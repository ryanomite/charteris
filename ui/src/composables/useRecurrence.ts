import { useTaskStore } from '../stores/taskStore';
import api from '../services/api';

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

let lastCheckDate: string | null = null;

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date {
  const parts = s.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Given recurrence days (e.g. "mon,thu") and a reference date,
 * find the next occurrence ON or AFTER the reference date.
 */
function getNextOccurrence(recurrence: string, afterDate: Date): Date | null {
  const days = recurrence.split(',').filter(Boolean).map(d => DAY_MAP[d.toLowerCase()]);
  if (days.length === 0) return null;

  const dayOfWeek = afterDate.getDay();

  // Check today first
  if (days.includes(dayOfWeek)) {
    return new Date(afterDate);
  }

  // Find next matching day
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = new Date(afterDate);
    candidate.setDate(candidate.getDate() + offset);
    if (days.includes(candidate.getDay())) {
      return candidate;
    }
  }
  return null;
}

/**
 * Given recurrence days and a reference date, find the next occurrence
 * STRICTLY AFTER the reference date (not on it).
 */
function getNextOccurrenceAfter(recurrence: string, afterDate: Date): Date | null {
  const nextDay = new Date(afterDate);
  nextDay.setDate(nextDay.getDate() + 1);
  return getNextOccurrence(recurrence, nextDay);
}

/**
 * Update a recurring task's due date to the next valid occurrence.
 * Returns true if the due date was changed.
 */
export async function updateRecurringDueDate(taskId: string): Promise<boolean> {
  const store = useTaskStore();
  const task = store.taskById(taskId);
  if (!task || !task.recurrence) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextDate = getNextOccurrence(task.recurrence, today);
  if (!nextDate) return false;

  const newDueDate = formatDate(nextDate);
  if (task.dueDate === newDueDate) return false;

  try {
    const { data } = await api.put(`/tasks/${task._id}`, { dueDate: newDueDate });
    store.upsertTask(data);
    return true;
  } catch (err) {
    console.error('Update recurring due date failed:', err);
    return false;
  }
}

/**
 * Handle completion of a recurring task:
 * 1. Clone the task with next recurrence date (not today)
 * 2. Place clone in the same Cabinet list(s) the original is in
 * 3. Ensure clone is not in Today/Next lists
 */
export async function handleRecurringCompletion(taskId: string): Promise<void> {
  const store = useTaskStore();
  const task = store.taskById(taskId);
  if (!task || !task.recurrence || !task.completed) return;

  // Find Cabinet list cards for this task
  const boardSection = store.sections.find(s => s.slug === 'board');
  if (!boardSection) return;
  const boardListIds = store.lists
    .filter(l => l.sectionId === boardSection._id && !l.archived)
    .map(l => l._id);
  const cabinetCards = store.cards.filter(c => c.taskId === taskId && boardListIds.includes(c.listId));

  // If no cabinet cards, task is orphaned - skip cloning
  if (cabinetCards.length === 0) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextDate = getNextOccurrenceAfter(task.recurrence, today);
  if (!nextDate) return;

  try {
    // Create clone task
    const { data: cloneTask } = await api.post('/tasks', {
      title: task.title,
      description: task.description,
      priority: task.priority,
      labels: task.labels,
      dueDate: formatDate(nextDate),
      recurrence: task.recurrence,
      completed: false,
      archived: false,
      master: task.master,
      parentId: task.parentId,
      subtasks: task.subtasks.map(s => ({ title: s.title, completed: false })),
    });
    store.upsertTask(cloneTask);

    // Create cards only in Cabinet lists
    for (const cabinetCard of cabinetCards) {
      const { data: card } = await api.post('/cards', {
        taskId: cloneTask._id,
        listId: cabinetCard.listId,
      });
      store.upsertCard(card);
    }
  } catch (err) {
    console.error('Clone recurring task failed:', err);
  }
}

/**
 * Run recurring task checks for all tasks.
 * Called on app load and when date changes.
 */
export async function runRecurrenceChecks(): Promise<void> {
  const store = useTaskStore();
  const today = todayStr();

  // Update due dates for all incomplete recurring tasks
  const recurringTasks = store.tasks.filter(t => t.recurrence && !t.completed && !t.archived);
  for (const task of recurringTasks) {
    const current = task.dueDate;
    if (!current) {
      // No due date set yet — set it
      await updateRecurringDueDate(task._id);
      continue;
    }

    const dueDate = parseDate(current);
    const todayDate = parseDate(today);
    if (dueDate < todayDate) {
      // Past due — move forward
      await updateRecurringDueDate(task._id);
    }
  }

  lastCheckDate = today;
}

/**
 * Check if a recurrence check is needed (date has changed or first run).
 */
export function needsRecurrenceCheck(): boolean {
  const today = todayStr();
  return lastCheckDate !== today;
}

/**
 * Compute the next due date for a given recurrence string.
 * Used when creating/editing recurring tasks.
 */
export function computeNextDueDate(recurrence: string): string | null {
  if (!recurrence) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = getNextOccurrence(recurrence, today);
  return next ? formatDate(next) : null;
}
