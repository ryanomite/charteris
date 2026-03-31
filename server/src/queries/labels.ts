import { getDb, generateId, now } from '../db';
import type { Label } from '../types';

function toLabel(row: any): Label {
  return {
    _id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findAllLabels(q?: string): Label[] {
  if (q) {
    return getDb().prepare("SELECT * FROM labels WHERE name LIKE ? ORDER BY name ASC")
      .all(`%${q}%`).map(toLabel);
  }
  return getDb().prepare('SELECT * FROM labels ORDER BY name ASC').all().map(toLabel);
}

export function findLabelById(id: string): Label | null {
  const row = getDb().prepare('SELECT * FROM labels WHERE id = ?').get(id) as any;
  return row ? toLabel(row) : null;
}

export function findLabelByName(name: string): Label | null {
  const row = getDb().prepare('SELECT * FROM labels WHERE name = ? COLLATE NOCASE').get(name) as any;
  return row ? toLabel(row) : null;
}

export function insertLabel(name: string): Label {
  const id = generateId();
  const ts = now();
  getDb().prepare(
    'INSERT INTO labels (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)'
  ).run(id, name.trim().toLowerCase(), ts, ts);
  return findLabelById(id)!;
}

export function updateLabel(id: string, name: string): Label | null {
  const ts = now();
  getDb().prepare('UPDATE labels SET name = ?, updatedAt = ? WHERE id = ?')
    .run(name.trim().toLowerCase(), ts, id);
  return findLabelById(id);
}

export function deleteLabel(id: string): void {
  getDb().prepare('DELETE FROM task_labels WHERE labelId = ?').run(id);
  getDb().prepare('DELETE FROM labels WHERE id = ?').run(id);
}
