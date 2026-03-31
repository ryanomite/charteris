import { Router, Request, Response } from 'express';
import { getDb, generateId, now } from '../db';

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

export default router;
