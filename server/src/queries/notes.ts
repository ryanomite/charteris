import { getDb, now } from '../db';
import type { Notes } from '../types';

const NOTES_KEY = 'default';

export function findNotes(): Notes {
  const row = getDb()
    .prepare('SELECT content, updatedAt FROM notes WHERE key = ?')
    .get(NOTES_KEY) as { content?: string; updatedAt?: string } | undefined;

  if (!row) return { content: '', updatedAt: '' };
  return { content: row.content ?? '', updatedAt: row.updatedAt ?? '' };
}

export function updateNotes(content: string): Notes {
  const updatedAt = now();
  getDb().prepare(`
    INSERT INTO notes (key, content, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      content = excluded.content,
      updatedAt = excluded.updatedAt
  `).run(NOTES_KEY, content, updatedAt);

  return { content, updatedAt };
}
