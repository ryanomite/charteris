import { Router, Request, Response } from 'express';
import { findAllSections, findSectionById, findSectionBySlug } from '../queries/sections';
import { findAllLists } from '../queries/lists';
import { findAllCards, deleteCard, updateCard, maxCardOrder, insertCard } from '../queries/cards';
import { findAllTasks, findTaskById, type TaskFilter } from '../queries/tasks';
import { findAllLabels } from '../queries/labels';
import { findGlobalSettings } from '../queries/settings';
import type { Task } from '../types';
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

function evaluateCastingRule(rule: string, task: Task, labelNames: string[], listNames: string[]): boolean {
  const todayDate = startOfToday();
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const due = parseYmd(task.dueDate);

  const hasLabel = (name: string) => labelNames.some(l => l.toLowerCase() === name.toLowerCase());
  const inList = (name: string) => listNames.some(l => l.toLowerCase() === name.toLowerCase());
  const regex = (pattern: string, value = '', flags = 'i') => {
    try {
      return new RegExp(pattern, flags).test(String(value));
    } catch {
      return false;
    }
  };
  const isDueToday = () => !!due && due.getTime() === todayDate.getTime();
  const isDueTomorrow = () => !!due && due.getTime() === tomorrowDate.getTime();
  const isOverdue = () => !!due && due.getTime() < todayDate.getTime();
  const daysUntilDue = () => {
    if (!due) return null;
    const ms = due.getTime() - todayDate.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  };
  const today = () => toYmdLocal(todayDate);
  const tomorrow = () => toYmdLocal(tomorrowDate);

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
    ) => boolean;
    return fn(task, labelNames, listNames, hasLabel, inList, regex, isDueToday, isDueTomorrow, isOverdue, daysUntilDue, today, tomorrow);
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
  const nextList = lists.find(l => l.name === 'Next');
  if (!todayList || !nextList) {
    res.status(500).json({ error: 'Today or Next list not found' });
    return;
  }

  // Step 1: Remove completed/archived cards from both Today and Next
  const bothListCards = [
    ...findAllCards({ listId: todayList._id }),
    ...findAllCards({ listId: nextList._id }),
  ];
  for (const card of bothListCards) {
    const task = findTaskById(card.taskId);
    if (task && (task.completed || task.archived)) {
      deleteCard(card._id);
    }
  }

  // Step 2: Remove non-orphaned cards from Next
  const nextCardsAfterStep1 = findAllCards({ listId: nextList._id });
  for (const card of nextCardsAfterStep1) {
    const allTaskCards = findAllCards({ taskId: card.taskId });
    const hasOtherCards = allTaskCards.some(c => c.listId !== nextList._id);
    if (hasOtherCards) {
      deleteCard(card._id);
    }
  }

  // Step 3: Move all remaining Today cards to Next
  const todayCardsAfterStep1 = findAllCards({ listId: todayList._id });
  for (const card of todayCardsAfterStep1) {
    const nextOrder = maxCardOrder(nextList._id) + 1;
    updateCard(card._id, { listId: nextList._id, order: nextOrder });
  }

  broadcast('cards:bulk-updated', { listIds: [todayList._id, nextList._id] });
  res.json({ listIds: [todayList._id, nextList._id] });
});

// POST /sections/board/cast
// → Today: incomplete/unarchived tasks overdue, due today, or priority 1
// → Next:  incomplete/unarchived tasks due tomorrow (not already in Today or Next)
router.post('/board/cast', (_req: Request, res: Response) => {
  const planningSec = findSectionBySlug('planning');
  if (!planningSec) { res.status(404).json({ error: 'Planning section not found' }); return; }

  const lists = findAllLists({ sectionId: planningSec._id });
  const todayList = lists.find(l => l.name === 'Today');
  const nextList  = lists.find(l => l.name === 'Next');
  if (!todayList || !nextList) { res.status(500).json({ error: 'Today or Next list not found' }); return; }

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
    return evaluateCastingRule(settings.castingRulesToday, task, labelNames, listNames);
  });

  const eligibleTomorrow = candidates.filter(task => {
    const labelNames = task.labels.map(id => labelNameById.get(id)).filter(Boolean) as string[];
    const listNames = listNamesByTaskId.get(task._id) || [];
    return evaluateCastingRule(settings.castingRulesNext, task, labelNames, listNames);
  });

  // --- Today rule ---
  // A task may only appear once per section — evict from Next before adding to Today.
  const todayCards = findAllCards({ listId: todayList._id });
  const todayTaskIds = new Set(todayCards.map(c => c.taskId));
  const nextCards = findAllCards({ listId: nextList._id });
  const nextCardByTaskId = new Map(nextCards.map(c => [c.taskId, c]));

  const addedToday: ReturnType<typeof insertCard>[] = [];
  for (const task of eligibleToday) {
    if (!todayTaskIds.has(task._id)) {
      // Remove from Next if already there (same task can't be in both)
      const nextCard = nextCardByTaskId.get(task._id);
      if (nextCard) deleteCard(nextCard._id);
      addedToday.push(insertCard({ taskId: task._id, listId: todayList._id }));
    }
  }

  // --- Next rule ---
  // Refresh after evictions and insertions above
  const nextCardsNow = findAllCards({ listId: nextList._id });
  const nextTaskIds = new Set(nextCardsNow.map(c => c.taskId));
  const todayTaskIdsUpdated = new Set([...todayTaskIds, ...addedToday.map(c => c.taskId)]);

  const addedNext: ReturnType<typeof insertCard>[] = [];
  for (const task of eligibleTomorrow) {
    if (!todayTaskIdsUpdated.has(task._id) && !nextTaskIds.has(task._id)) {
      addedNext.push(insertCard({ taskId: task._id, listId: nextList._id }));
    }
  }

  const listIds = [todayList._id, nextList._id];
  broadcast('cards:bulk-updated', { listIds });
  res.json({ listIds, addedToday: addedToday.length, addedNext: addedNext.length });
});

export default router;
