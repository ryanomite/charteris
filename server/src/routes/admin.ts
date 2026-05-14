import { Router, Request, Response } from 'express';
import { getDb, generateId, now } from '../db';
import { broadcast } from '../ws';
import { findTaskById } from '../queries/tasks';
import { trackTaskDeletion } from '../utils/taskEventTracking';

const router = Router();

function dropAllData(): void {
  getDb().exec(`
    DELETE FROM cards;
    DELETE FROM subtasks;
    DELETE FROM task_labels;
    DELETE FROM tasks;
    DELETE FROM lists;
    DELETE FROM labels;
    DELETE FROM sections;
  `);
}

function ensureSectionsAndLists(): void {
  const db = getDb();
  const ts = now();

  const inboxId = generateId();
  const planningId = generateId();
  const boardId = generateId();

  const insertSection = db.prepare(
    'INSERT INTO sections (id, name, slug, icon, "order", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insertSection.run(inboxId, 'Inbox', 'inbox', 'fa-inbox', 0, ts, ts);
  insertSection.run(planningId, 'Planning', 'planning', 'fa-calendar-alt', 1, ts, ts);
  insertSection.run(boardId, 'Board', 'board', 'fa-columns', 2, ts, ts);

  const insertList = db.prepare(
    'INSERT INTO lists (id, name, sectionId, "order", isFixed, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insertList.run(generateId(), 'Draft', inboxId, 0, 1, ts, ts);
  insertList.run(generateId(), 'Today', planningId, 0, 1, ts, ts);
  insertList.run(generateId(), 'Next', planningId, 1, 1, ts, ts);
}

// POST /api/v1/admin/drop — delete everything
router.post('/drop', (_req: Request, res: Response) => {
  dropAllData();
  res.json({ message: 'All data dropped' });
});

// POST /api/v1/admin/reset — delete everything, recreate sections and fixed lists
router.post('/reset', (_req: Request, res: Response) => {
  dropAllData();
  ensureSectionsAndLists();
  res.json({ message: 'Database reset — sections and fixed lists restored' });
});

// POST /api/v1/admin/deduplicate — remove duplicate cards and duplicate-titled tasks
router.post('/deduplicate', (_req: Request, res: Response) => {
  const db = getDb();
  const affectedListIds = new Set<string>();
  const deletedTaskIds: string[] = [];
  let duplicateCardsRemoved = 0;
  let duplicateTasksRemoved = 0;

  db.exec('BEGIN TRANSACTION');
  try {
    const cardRows = db.prepare(`
      SELECT id, taskId, listId
      FROM cards
      ORDER BY updatedAt DESC, createdAt DESC, id DESC
    `).all() as Array<{ id: string; taskId: string; listId: string }>;

    const seenTaskList = new Set<string>();
    const deleteCardStmt = db.prepare('DELETE FROM cards WHERE id = ?');

    for (const row of cardRows) {
      const key = `${row.taskId}:${row.listId}`;
      if (seenTaskList.has(key)) {
        deleteCardStmt.run(row.id);
        affectedListIds.add(row.listId);
        duplicateCardsRemoved += 1;
      } else {
        seenTaskList.add(key);
      }
    }

    const taskRows = db.prepare(`
      SELECT id, title
      FROM tasks
      ORDER BY updatedAt DESC, createdAt DESC, id DESC
    `).all() as Array<{ id: string; title: string }>;

    const normalizeTitle = (value: string): string => value.trim().toLowerCase();
    const seenTitles = new Set<string>();
    const findTaskCardsStmt = db.prepare('SELECT listId FROM cards WHERE taskId = ?');
    const deleteTaskCards = db.prepare('DELETE FROM cards WHERE taskId = ?');
    const deleteSubtasks = db.prepare('DELETE FROM subtasks WHERE taskId = ?');
    const deleteTaskLabels = db.prepare('DELETE FROM task_labels WHERE taskId = ?');
    const deleteTaskStmt = db.prepare('DELETE FROM tasks WHERE id = ?');

    for (const row of taskRows) {
      const normalized = normalizeTitle(row.title || '');
      if (!normalized) continue;
      if (seenTitles.has(normalized)) {
        const task = findTaskById(row.id);
        if (task) {
          trackTaskDeletion(task);
        }
        const cards = findTaskCardsStmt.all(row.id) as Array<{ listId: string }>;
        for (const c of cards) affectedListIds.add(c.listId);
        deleteTaskCards.run(row.id);
        deleteSubtasks.run(row.id);
        deleteTaskLabels.run(row.id);
        deleteTaskStmt.run(row.id);
        deletedTaskIds.push(row.id);
        duplicateTasksRemoved += 1;
      } else {
        seenTitles.add(normalized);
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const listIds = [...affectedListIds];
  if (listIds.length) {
    broadcast('cards:bulk-updated', { listIds });
  }
  for (const taskId of deletedTaskIds) {
    broadcast('task:deleted', { _id: taskId });
  }

  res.json({
    message: 'Deduplication complete',
    duplicateCardsRemoved,
    duplicateTasksRemoved,
    affectedListCount: listIds.length,
  });
});

export default router;
