import { getDb, generateId, now } from '../db';
import type { List } from '../types';

function toList(row: any): List {
  return {
    _id: row.id,
    name: row.name,
    sectionId: row.sectionId,
    order: row.order,
    isFixed: !!row.isFixed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findAllLists(filter?: { sectionId?: string }): List[] {
  if (filter?.sectionId) {
    return getDb().prepare('SELECT * FROM lists WHERE sectionId = ? ORDER BY "order" ASC')
      .all(filter.sectionId).map(toList);
  }
  return getDb().prepare('SELECT * FROM lists ORDER BY "order" ASC').all().map(toList);
}

export function findListById(id: string): List | null {
  const row = getDb().prepare('SELECT * FROM lists WHERE id = ?').get(id);
  return row ? toList(row) : null;
}

export function findListByName(name: string): List | null {
  const row = getDb().prepare('SELECT * FROM lists WHERE name = ? COLLATE NOCASE').get(name);
  return row ? toList(row) : null;
}

export function insertList(data: { name: string; sectionId: string; order: number; isFixed: boolean }): List {
  const id = generateId();
  const ts = now();
  getDb().prepare(
    'INSERT INTO lists (id, name, sectionId, "order", isFixed, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.name, data.sectionId, data.order, data.isFixed ? 1 : 0, ts, ts);
  return findListById(id)!;
}

export function updateList(id: string, data: { name?: string; order?: number }): List | null {
  const ts = now();
  if (data.name !== undefined) {
    getDb().prepare('UPDATE lists SET name = ?, updatedAt = ? WHERE id = ?').run(data.name, ts, id);
  }
  if (data.order !== undefined) {
    getDb().prepare('UPDATE lists SET "order" = ?, updatedAt = ? WHERE id = ?').run(data.order, ts, id);
  }
  return findListById(id);
}

export function deleteList(id: string): void {
  getDb().prepare('DELETE FROM lists WHERE id = ?').run(id);
}

export function maxListOrder(sectionId: string): number {
  const row = getDb().prepare('SELECT MAX("order") as maxOrder FROM lists WHERE sectionId = ?').get(sectionId) as any;
  return row?.maxOrder ?? -1;
}

export function shiftListOrders(sectionId: string, from: number, to: number, direction: number): void {
  if (direction > 0) {
    getDb().prepare(
      'UPDATE lists SET "order" = "order" + 1 WHERE sectionId = ? AND "order" >= ? AND "order" < ?'
    ).run(sectionId, from, to);
  } else {
    getDb().prepare(
      'UPDATE lists SET "order" = "order" - 1 WHERE sectionId = ? AND "order" > ? AND "order" <= ?'
    ).run(sectionId, from, to);
  }
}
