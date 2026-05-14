import { now } from '../db';
import { findAllLists } from '../queries/lists';
import { findSectionBySlug } from '../queries/sections';
import { insertTaskEvent } from '../queries/taskEvents';
import { findTaskById, setTaskCommittedAt, setTaskCompletedAt } from '../queries/tasks';
import type { Task } from '../types';

function getTodayListId(): string | null {
  const planning = findSectionBySlug('planning');
  if (!planning) return null;
  const today = findAllLists({ sectionId: planning._id, includeArchived: true })
    .find(list => list.name.toLowerCase() === 'today');
  return today?._id ?? null;
}

export function trackCommitmentTransition(taskId: string, fromListId?: string | null, toListId?: string | null): void {
  const todayListId = getTodayListId();
  if (!todayListId) return;

  const fromToday = !!fromListId && fromListId === todayListId;
  const toToday = !!toListId && toListId === todayListId;
  if (fromToday === toToday) return;

  const task = findTaskById(taskId);
  if (!task) return;

  const ts = now();
  if (toToday) {
    setTaskCommittedAt(task._id, ts);
    insertTaskEvent(task, 'task_committed', ts);
    return;
  }

  setTaskCommittedAt(task._id, null);
  insertTaskEvent(task, 'task_uncommitted', ts);
}

export function trackCompletionTransition(previous: Task, updated: Task): void {
  if (previous.completed === updated.completed) return;

  const ts = now();
  if (updated.completed) {
    setTaskCompletedAt(updated._id, ts);
    insertTaskEvent(updated, 'task_completed', ts);
    return;
  }

  setTaskCompletedAt(updated._id, null);
  insertTaskEvent(updated, 'task_uncompleted', ts);
}

export function trackTaskDeletion(task: Task): void {
  insertTaskEvent(task, 'task_deleted', now());
}
