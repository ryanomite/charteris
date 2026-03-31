import { getDb, generateId, now } from '../db';
import type { Card } from '../types';

function toCard(row: any): Card {
  return {
    _id: row.id,
    taskId: row.taskId,
    listId: row.listId,
    order: row.order,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findAllCards(filter?: { listId?: string; taskId?: string }): Card[] {
  let sql = 'SELECT * FROM cards WHERE 1=1';
  const params: any[] = [];

  if (filter?.listId) { sql += ' AND listId = ?'; params.push(filter.listId); }
  if (filter?.taskId) { sql += ' AND taskId = ?'; params.push(filter.taskId); }

  sql += ' ORDER BY "order" ASC';
  return getDb().prepare(sql).all(...params).map(toCard);
}

export function findCardById(id: string): Card | null {
  const row = getDb().prepare('SELECT * FROM cards WHERE id = ?').get(id) as any;
  return row ? toCard(row) : null;
}

export function findCardByTaskInLists(taskId: string, listIds: string[]): Card | null {
  if (listIds.length === 0) return null;
  const placeholders = listIds.map(() => '?').join(',');
  const row = getDb().prepare(
    `SELECT * FROM cards WHERE taskId = ? AND listId IN (${placeholders})`
  ).get(taskId, ...listIds) as any;
  return row ? toCard(row) : null;
}

export function insertCard(data: { taskId: string; listId: string; order?: number }): Card {
  const db = getDb();
  const id = generateId();
  const ts = now();

  let order = data.order;
  if (order === undefined) {
    const row = db.prepare('SELECT MAX("order") as maxOrder FROM cards WHERE listId = ?').get(data.listId) as any;
    order = (row?.maxOrder ?? -1) + 1;
  }

  db.prepare(
    'INSERT INTO cards (id, taskId, listId, "order", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, data.taskId, data.listId, order, ts, ts);

  return findCardById(id)!;
}

export function updateCard(id: string, data: { listId?: string; order?: number }): Card | null {
  const ts = now();
  const db = getDb();
  if (data.listId !== undefined) {
    db.prepare('UPDATE cards SET listId = ?, updatedAt = ? WHERE id = ?').run(data.listId, ts, id);
  }
  if (data.order !== undefined) {
    db.prepare('UPDATE cards SET "order" = ?, updatedAt = ? WHERE id = ?').run(data.order, ts, id);
  }
  return findCardById(id);
}

export function deleteCard(id: string): void {
  getDb().prepare('DELETE FROM cards WHERE id = ?').run(id);
}

export function deleteCardsByListId(listId: string): void {
  getDb().prepare('DELETE FROM cards WHERE listId = ?').run(listId);
}

export function deleteCardsByTaskId(taskId: string): void {
  getDb().prepare('DELETE FROM cards WHERE taskId = ?').run(taskId);
}

export function maxCardOrder(listId: string): number {
  const row = getDb().prepare('SELECT MAX("order") as maxOrder FROM cards WHERE listId = ?').get(listId) as any;
  return row?.maxOrder ?? -1;
}

export function shiftCardOrdersUp(listId: string, from: number, to: number): void {
  getDb().prepare(
    'UPDATE cards SET "order" = "order" + 1 WHERE listId = ? AND "order" >= ? AND "order" < ?'
  ).run(listId, from, to);
}

export function shiftCardOrdersDown(listId: string, from: number, to: number): void {
  getDb().prepare(
    'UPDATE cards SET "order" = "order" - 1 WHERE listId = ? AND "order" > ? AND "order" <= ?'
  ).run(listId, from, to);
}

export function closeGap(listId: string, afterOrder: number): void {
  getDb().prepare(
    'UPDATE cards SET "order" = "order" - 1 WHERE listId = ? AND "order" > ?'
  ).run(listId, afterOrder);
}

export function makeRoom(listId: string, atOrder: number): void {
  getDb().prepare(
    'UPDATE cards SET "order" = "order" + 1 WHERE listId = ? AND "order" >= ?'
  ).run(listId, atOrder);
}
