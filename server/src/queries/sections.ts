import { getDb, generateId, now } from '../db';
import type { Section } from '../types';

// Map DB row → API shape
function toSection(row: any): Section {
  return {
    _id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    order: row.order,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findAllSections(): Section[] {
  const rows = getDb().prepare('SELECT * FROM sections ORDER BY "order" ASC').all();
  return rows.map(toSection);
}

export function findSectionById(id: string): Section | null {
  const row = getDb().prepare('SELECT * FROM sections WHERE id = ?').get(id);
  return row ? toSection(row) : null;
}

export function findSectionBySlug(slug: string): Section | null {
  const row = getDb().prepare('SELECT * FROM sections WHERE slug = ?').get(slug);
  return row ? toSection(row) : null;
}

export function insertSection(data: { name: string; slug: string; icon: string; order: number }): Section {
  const id = generateId();
  const ts = now();
  getDb().prepare(
    'INSERT INTO sections (id, name, slug, icon, "order", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.name, data.slug, data.icon, data.order, ts, ts);
  return findSectionById(id)!;
}
