import { Router, Request, Response } from 'express';
import { findAllSections, findSectionById, findSectionBySlug } from '../queries/sections';
import { findAllLists } from '../queries/lists';
import { findAllCards, deleteCard, insertCard } from '../queries/cards';
import { findAllTasks, findTaskById, type TaskFilter } from '../queries/tasks';
import { findAllLabels } from '../queries/labels';
import { findGlobalSettings } from '../queries/settings';
import type { Task } from '../types';
import { trackCommitmentTransition } from '../utils/taskEventTracking';
import { broadcast } from '../ws';

const router = Router();

function parseYmd(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function evaluateCastingRule(
  rule: string,
  task: Task,
  labelNames: string[],
  listNames: string[],
  localHour: number,
  localWeekday: number,
  todayYmd: string,
  tomorrowYmd: string,
): boolean {
  const hasLabel = (name: string) => labelNames.some(l => l.toLowerCase() === name.toLowerCase());
  const inList = (name: string) => listNames.some(l => l.toLowerCase() === name.toLowerCase());
  const regex = (pattern: string, value = '', flags = 'i') => {
    try {
      return new RegExp(pattern, flags).test(String(value));
    } catch {
      return false;
    }
  };
  const isDueToday = () => !!task.dueDate && task.dueDate === todayYmd;
  const isDueTomorrow = () => !!task.dueDate && task.dueDate === tomorrowYmd;
  const isOverdue = () => !!task.dueDate && task.dueDate < todayYmd;
  const daysUntilDue = () => {
    if (!task.dueDate) return null;
    const a = Date.parse(task.dueDate + 'T00:00:00Z');
    const b = Date.parse(todayYmd + 'T00:00:00Z');
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.round((a - b) / (1000 * 60 * 60 * 24));
  };
  const today = () => todayYmd;
  const tomorrow = () => tomorrowYmd;
  const currentHour = () => localHour;
  const currentWeekday = () => localWeekday;

  try {
    const fn = new Function(
      'task',
      'labels',
      'lists',
      'hasLabel',
      'inList',
      'regex',
      'isDueToday',
      'isDueTomorrow',
      'isOverdue',
      'daysUntilDue',
      'today',
      'tomorrow',
      'currentHour',
      'currentWeekday',
      `"use strict"; const { title, description, priority, dueDate, completed, archived, recurrence, master, parentId } = task; return Boolean(${rule});`,
    ) as (
      task: Task,
      labels: string[],
      lists: string[],
      hasLabel: (name: string) => boolean,
      inList: (name: string) => boolean,
      regex: (pattern: string, value?: string, flags?: string) => boolean,
      isDueToday: () => boolean,
      isDueTomorrow: () => boolean,
      isOverdue: () => boolean,
      daysUntilDue: () => number | null,
      today: () => string,
      tomorrow: () => string,
      currentHour: () => number,
      currentWeekday: () => number,
    ) => boolean;
    return fn(task, labelNames, listNames, hasLabel, inList, regex, isDueToday, isDueTomorrow, isOverdue, daysUntilDue, today, tomorrow, currentHour, currentWeekday);
  } catch {
    return false;
  }
}

router.get('/', (_req: Request, res: Response) => {
  res.json(findAllSections());
});

router.get('/:id', (req: Request, res: Response) => {
  const section = findSectionById(req.params.id);
  if (!section) { res.status(404).json({ error: 'Section not found' }); return; }
  res.json(section);
});

// POST /sections/planning/adjourn
// 1. Remove completed/archived cards from both Today and Next.
// 2. Remove non-orphaned cards from Next (tasks that exist in other lists).
// 3. Move ALL remaining Today cards to Next (orphaned or not).
router.post('/planning/adjourn', (_req: Request, res: Response) => {
  const section = findSectionBySlug('planning');
  if (!section) { res.status(404).json({ error: 'Planning section not found' }); return; }

  const lists = findAllLists({ sectionId: section._id });
  const todayList = lists.find(l => l.name === 'Today');
  if (!todayList) {
    res.status(500).json({ error: 'Today list not found' });
    return;
  }

  // Step 1: Remove completed/archived cards from Today
  const todayCards = findAllCards({ listId: todayList._id });
  for (const card of todayCards) {
    const task = findTaskById(card.taskId);
    if (task && (task.completed || task.archived)) {
      trackCommitmentTransition(card.taskId, card.listId, null);
      deleteCard(card._id);
    }
  }

  // Step 2: Remove non-orphaned cards from Today
  const todayCardsAfterStep1 = findAllCards({ listId: todayList._id });
  for (const card of todayCardsAfterStep1) {
    const allTaskCards = findAllCards({ taskId: card.taskId });
    const hasOtherCards = allTaskCards.some(c => c.listId !== todayList._id);
    if (hasOtherCards) {
      trackCommitmentTransition(card.taskId, card.listId, null);
      deleteCard(card._id);
    }
  }

  // Step 3: Clear remaining Today cards (no Next list anymore)
  const todayCardsAfterStep2 = findAllCards({ listId: todayList._id });
  for (const card of todayCardsAfterStep2) {
    trackCommitmentTransition(card.taskId, todayList._id, null);
    deleteCard(card._id);
  }

  broadcast('cards:bulk-updated', { listIds: [todayList._id] });
  res.json({ listIds: [todayList._id] });
});

// POST /sections/board/cast
// → Today: incomplete/unarchived tasks overdue, due today, or priority 1
// → Next:  incomplete/unarchived tasks due tomorrow (not already in Today or Next)
router.post('/board/cast', (req: Request, res: Response) => {
  const planningSec = findSectionBySlug('planning');
  if (!planningSec) { res.status(404).json({ error: 'Planning section not found' }); return; }

  const lists = findAllLists({ sectionId: planningSec._id });
  const todayList = lists.find(l => l.name === 'Today');
  if (!todayList) { res.status(500).json({ error: 'Today list not found' }); return; }

  const now = new Date();
  const tz = typeof req.body?.timeZone === 'string' ? req.body.timeZone : null;
  let validTz = false;
  if (tz) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); validTz = true; } catch { validTz = false; }
  }

  const weekdayNameToNum: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function tzParts(date: Date, timeZone: string) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
      hour12: false,
    });
    const parts = dtf.formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    const ymd = `${get('year')}-${get('month')}-${get('day')}`;
    const hour = Number(get('hour')) % 24;
    const weekday = weekdayNameToNum[get('weekday')] ?? 0;
    return { hour: Number.isFinite(hour) ? hour : 0, weekday, ymd };
  }

  let localHour: number;
  let localWeekday: number;
  let todayYmd: string;
  let tomorrowYmd: string;

  if (validTz && tz) {
    const p = tzParts(now, tz);
    localHour = p.hour;
    localWeekday = p.weekday;
    todayYmd = p.ymd;
    const p2 = tzParts(new Date(now.getTime() + 24 * 60 * 60 * 1000), tz);
    tomorrowYmd = p2.ymd;
  } else {
    const bodyHour = Number(req.body?.localHour);
    const bodyWeekday = Number(req.body?.localWeekday);
    localHour = Number.isFinite(bodyHour) && bodyHour >= 0 && bodyHour <= 23 ? bodyHour : now.getHours();
    localWeekday = Number.isFinite(bodyWeekday) && bodyWeekday >= 0 && bodyWeekday <= 6 ? bodyWeekday : now.getDay();
    const bodyToday = typeof req.body?.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.today)
      ? req.body.today
      : null;
    todayYmd = bodyToday || toYmdLocal(now);
    const td = new Date(todayYmd + 'T00:00:00Z');
    td.setUTCDate(td.getUTCDate() + 1);
    tomorrowYmd = td.toISOString().slice(0, 10);
  }

  const settings = findGlobalSettings();
  const allLabels = findAllLabels();
  const labelNameById = new Map(allLabels.map(l => [l._id, l.name]));
  const allLists = findAllLists({ includeArchived: true });
  const listNameById = new Map(allLists.map(l => [l._id, l.name]));
  const allCards = findAllCards();
  const listNamesByTaskId = new Map<string, string[]>();
  for (const card of allCards) {
    const listName = listNameById.get(card.listId);
    if (!listName) continue;
    const existing = listNamesByTaskId.get(card.taskId) || [];
    if (!existing.includes(listName)) {
      existing.push(listName);
      listNamesByTaskId.set(card.taskId, existing);
    }
  }

  const filter: TaskFilter = { completed: false, archived: false };
  const candidates = findAllTasks(filter);

  const eligibleToday = candidates.filter(task => {
    const labelNames = task.labels.map(id => labelNameById.get(id)).filter(Boolean) as string[];
    const listNames = listNamesByTaskId.get(task._id) || [];
    return evaluateCastingRule(settings.castingRulesToday, task, labelNames, listNames, localHour, localWeekday, todayYmd, tomorrowYmd);
  });

  // --- Today rule ---
  const todayCards = findAllCards({ listId: todayList._id });
  const todayTaskIds = new Set(todayCards.map(c => c.taskId));

  const addedToday: ReturnType<typeof insertCard>[] = [];
  for (const task of eligibleToday) {
    if (!todayTaskIds.has(task._id)) {
      const inserted = insertCard({ taskId: task._id, listId: todayList._id });
      trackCommitmentTransition(task._id, null, todayList._id);
      addedToday.push(inserted);
    }
  }

  const listIds = [todayList._id];
  broadcast('cards:bulk-updated', { listIds });
  res.json({ listIds, addedToday: addedToday.length });
});

export default router;
