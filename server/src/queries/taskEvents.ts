import { getDb, generateId, now } from '../db';
import type { Task, TaskEvent, TaskEventType } from '../types';

function toTaskEvent(row: any): TaskEvent {
  return {
    _id: row.id,
    taskId: row.taskId,
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    taskTitle: row.taskTitle,
    taskPriority: row.taskPriority ?? null,
    taskDueDate: row.taskDueDate ?? null,
    cabinetListId: row.cabinetListId ?? null,
    cabinetListName: row.cabinetListName ?? null,
    taskCompleted: !!row.taskCompleted,
    taskArchived: !!row.taskArchived,
  };
}

function findPrimaryCabinetList(taskId: string): { id: string; name: string } | null {
  const row = getDb().prepare(`
    SELECT l.id, l.name
    FROM cards c
    JOIN lists l ON l.id = c.listId
    JOIN sections s ON s.id = l.sectionId
    WHERE c.taskId = ?
      AND s.slug = 'board'
    ORDER BY c.updatedAt DESC, c.createdAt DESC, c."order" ASC
    LIMIT 1
  `).get(taskId) as { id: string; name: string } | undefined;
  return row ? { id: row.id, name: row.name } : null;
}

export function insertTaskEvent(task: Task, eventType: TaskEventType, occurredAt = now()): TaskEvent {
  const id = generateId();
  const cabinet = findPrimaryCabinetList(task._id);

  getDb().prepare(`
    INSERT INTO task_events (
      id,
      taskId,
      eventType,
      occurredAt,
      taskTitle,
      taskPriority,
      taskDueDate,
      cabinetListId,
      cabinetListName,
      taskCompleted,
      taskArchived
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    task._id,
    eventType,
    occurredAt,
    task.title,
    task.priority ?? null,
    task.dueDate ?? null,
    cabinet?.id ?? null,
    cabinet?.name ?? null,
    task.completed ? 1 : 0,
    task.archived ? 1 : 0,
  );

  return findTaskEventById(id)!;
}

export function findTaskEventById(id: string): TaskEvent | null {
  const row = getDb().prepare('SELECT * FROM task_events WHERE id = ?').get(id) as any;
  return row ? toTaskEvent(row) : null;
}
