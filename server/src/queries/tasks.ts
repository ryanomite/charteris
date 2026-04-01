import { getDb, generateId, now } from '../db';
import type { Task, Subtask } from '../types';

function getSubtasks(taskId: string): Subtask[] {
  const rows = getDb().prepare(
    'SELECT * FROM subtasks WHERE taskId = ? ORDER BY "order" ASC'
  ).all(taskId) as any[];
  return rows.map(r => ({ _id: r.id, title: r.title, completed: !!r.completed }));
}

function getTaskLabels(taskId: string): string[] {
  const rows = getDb().prepare(
    'SELECT labelId FROM task_labels WHERE taskId = ?'
  ).all(taskId) as any[];
  return rows.map(r => r.labelId);
}

function toTask(row: any): Task {
  return {
    _id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    labels: getTaskLabels(row.id),
    dueDate: row.dueDate || null,
    recurrence: row.recurrence,
    completed: !!row.completed,
    archived: !!row.archived,
    master: !!row.master,
    parentId: row.parentId || null,
    subtasks: getSubtasks(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface TaskFilter {
  completed?: boolean;
  archived?: boolean;
  master?: boolean;
  parentId?: string;
  label?: string;
  dueDate?: string;
}

export function findAllTasks(filter?: TaskFilter): Task[] {
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params: any[] = [];

  if (filter?.completed !== undefined) {
    sql += ' AND completed = ?';
    params.push(filter.completed ? 1 : 0);
  }
  if (filter?.archived !== undefined) {
    sql += ' AND archived = ?';
    params.push(filter.archived ? 1 : 0);
  }
  if (filter?.master !== undefined) {
    sql += ' AND master = ?';
    params.push(filter.master ? 1 : 0);
  }
  if (filter?.parentId) {
    sql += ' AND parentId = ?';
    params.push(filter.parentId);
  }
  if (filter?.label) {
    sql += ' AND id IN (SELECT taskId FROM task_labels WHERE labelId = ?)';
    params.push(filter.label);
  }
  if (filter?.dueDate) {
    // Match same date (date portion only)
    sql += ' AND date(dueDate) = date(?)';
    params.push(filter.dueDate);
  }

  sql += ' ORDER BY createdAt DESC';
  const rows = getDb().prepare(sql).all(...params) as any[];
  return rows.map(toTask);
}

export function findTaskById(id: string): Task | null {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as any;
  return row ? toTask(row) : null;
}

export function findTasksByParentId(parentId: string): Task[] {
  const rows = getDb().prepare('SELECT * FROM tasks WHERE parentId = ?').all(parentId) as any[];
  return rows.map(toTask);
}

interface CreateTaskData {
  title: string;
  description?: string;
  priority?: number | null;
  labels?: string[];
  dueDate?: string | null;
  recurrence?: string;
  completed?: boolean;
  archived?: boolean;
  master?: boolean;
  parentId?: string | null;
  subtasks?: { title: string; completed: boolean }[];
}

export function insertTask(data: CreateTaskData): Task {
  const db = getDb();
  const id = generateId();
  const ts = now();

  db.prepare(`
    INSERT INTO tasks (id, title, description, priority, dueDate, recurrence, completed, archived, master, parentId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.description || '',
    data.priority ?? null,
    data.dueDate || null,
    data.recurrence || '',
    data.completed ? 1 : 0,
    data.archived ? 1 : 0,
    data.master ? 1 : 0,
    data.parentId || null,
    ts,
    ts,
  );

  // Labels
  if (data.labels?.length) {
    const insertLabel = db.prepare('INSERT OR IGNORE INTO task_labels (taskId, labelId) VALUES (?, ?)');
    for (const labelId of data.labels) {
      insertLabel.run(id, labelId);
    }
  }

  // Subtasks
  if (data.subtasks?.length) {
    const insertSub = db.prepare(
      'INSERT INTO subtasks (id, taskId, title, completed, "order") VALUES (?, ?, ?, ?, ?)'
    );
    data.subtasks.forEach((s, i) => {
      insertSub.run(generateId(), id, s.title, s.completed ? 1 : 0, i);
    });
  }

  // If master, set parentId to self
  if (data.master && !data.parentId) {
    db.prepare('UPDATE tasks SET parentId = ? WHERE id = ?').run(id, id);
  }

  return findTaskById(id)!;
}

interface UpdateTaskData {
  title?: string;
  description?: string;
  priority?: number | null;
  labels?: string[];
  dueDate?: string | null;
  recurrence?: string;
  completed?: boolean;
  archived?: boolean;
  subtasks?: { _id?: string; title: string; completed: boolean }[];
}

export function updateTask(id: string, data: UpdateTaskData): Task | null {
  const db = getDb();
  const ts = now();

  const sets: string[] = ['updatedAt = ?'];
  const params: any[] = [ts];

  if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title); }
  if (data.description !== undefined) { sets.push('description = ?'); params.push(data.description); }
  if (data.priority !== undefined) { sets.push('priority = ?'); params.push(data.priority); }
  if (data.dueDate !== undefined) { sets.push('dueDate = ?'); params.push(data.dueDate); }
  if (data.recurrence !== undefined) { sets.push('recurrence = ?'); params.push(data.recurrence); }
  if (data.completed !== undefined) { sets.push('completed = ?'); params.push(data.completed ? 1 : 0); }
  if (data.archived !== undefined) { sets.push('archived = ?'); params.push(data.archived ? 1 : 0); }

  params.push(id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  // Labels — full replace
  if (data.labels !== undefined) {
    db.prepare('DELETE FROM task_labels WHERE taskId = ?').run(id);
    const insertLabel = db.prepare('INSERT OR IGNORE INTO task_labels (taskId, labelId) VALUES (?, ?)');
    for (const labelId of data.labels) {
      insertLabel.run(id, labelId);
    }
  }

  // Subtasks — full replace
  if (data.subtasks !== undefined) {
    db.prepare('DELETE FROM subtasks WHERE taskId = ?').run(id);
    const insertSub = db.prepare(
      'INSERT INTO subtasks (id, taskId, title, completed, "order") VALUES (?, ?, ?, ?, ?)'
    );
    data.subtasks.forEach((s, i) => {
      insertSub.run(s._id || generateId(), id, s.title, s.completed ? 1 : 0, i);
    });
  }

  return findTaskById(id);
}

export function propagateToSiblings(task: Task, fields: Record<string, unknown>): void {
  if (!task.parentId) return;
  const db = getDb();
  const ts = now();

  const sets: string[] = ['updatedAt = ?'];
  const params: any[] = [ts];

  if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
  if (fields.description !== undefined) { sets.push('description = ?'); params.push(fields.description); }
  if (fields.priority !== undefined) { sets.push('priority = ?'); params.push(fields.priority); }
  if (fields.dueDate !== undefined) { sets.push('dueDate = ?'); params.push(fields.dueDate); }
  if (fields.recurrence !== undefined) { sets.push('recurrence = ?'); params.push(fields.recurrence); }

  if (sets.length > 1) {
    params.push(task.parentId, task._id);
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE parentId = ? AND id != ?`).run(...params);
  }

  // Labels — propagate by replacing on all siblings
  if (fields.labels !== undefined) {
    const siblings = db.prepare('SELECT id FROM tasks WHERE parentId = ? AND id != ?')
      .all(task.parentId, task._id) as any[];
    const insertLabel = db.prepare('INSERT OR IGNORE INTO task_labels (taskId, labelId) VALUES (?, ?)');
    for (const sib of siblings) {
      db.prepare('DELETE FROM task_labels WHERE taskId = ?').run(sib.id);
      for (const labelId of fields.labels as string[]) {
        insertLabel.run(sib.id, labelId);
      }
    }
  }

  // Subtasks — propagate by replacing on all siblings
  if (fields.subtasks !== undefined) {
    const siblings = db.prepare('SELECT id FROM tasks WHERE parentId = ? AND id != ?')
      .all(task.parentId, task._id) as any[];
    const insertSub = db.prepare(
      'INSERT INTO subtasks (id, taskId, title, completed, "order") VALUES (?, ?, ?, ?, ?)'
    );
    for (const sib of siblings) {
      db.prepare('DELETE FROM subtasks WHERE taskId = ?').run(sib.id);
      (fields.subtasks as any[]).forEach((s: any, i: number) => {
        insertSub.run(generateId(), sib.id, s.title, s.completed ? 1 : 0, i);
      });
    }
  }
}

// Find incomplete, unarchived tasks eligible for "Cast" to Today:
// tasks with priority=1, or due today, or overdue
export function findTasksForCast(today: string): Task[] {
  const rows = getDb().prepare(`
    SELECT * FROM tasks
    WHERE completed = 0
      AND archived = 0
      AND (priority = 1 OR (dueDate IS NOT NULL AND date(dueDate) <= date(?)))
  `).all(today) as any[];
  return rows.map(toTask);
}

export function deleteTask(id: string): void {
  const db = getDb();
  // Cards referencing this task
  db.prepare('DELETE FROM cards WHERE taskId = ?').run(id);
  // Subtasks and labels are CASCADE, but let's be explicit
  db.prepare('DELETE FROM subtasks WHERE taskId = ?').run(id);
  db.prepare('DELETE FROM task_labels WHERE taskId = ?').run(id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

export function deleteTaskSeries(parentId: string): { deletedCount: number; taskIds: string[] } {
  const db = getDb();
  const tasks = db.prepare('SELECT id FROM tasks WHERE parentId = ?').all(parentId) as any[];
  const taskIds = tasks.map((t: any) => t.id);

  if (taskIds.length === 0) return { deletedCount: 0, taskIds: [] };

  const placeholders = taskIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM cards WHERE taskId IN (${placeholders})`).run(...taskIds);
  db.prepare(`DELETE FROM subtasks WHERE taskId IN (${placeholders})`).run(...taskIds);
  db.prepare(`DELETE FROM task_labels WHERE taskId IN (${placeholders})`).run(...taskIds);
  const result = db.prepare(`DELETE FROM tasks WHERE parentId = ?`).run(parentId);

  return { deletedCount: result.changes, taskIds };
}
