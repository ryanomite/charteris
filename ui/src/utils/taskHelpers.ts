import api from '../services/api';
import type { IList } from '../types';
import { useTaskStore } from '../stores/taskStore';
import { toClassSlug } from './classNames';

export function normalizeLabelName(raw: string): string {
  return raw.trim().replace(/^@+/, '').trim();
}

export async function resolveLabelIds(store: ReturnType<typeof useTaskStore>, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const rawName of names) {
    const name = normalizeLabelName(rawName);
    if (!name) continue;
    let label = store.labels.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (!label) {
      const { data } = await api.post('/labels', { name });
      store.upsertLabel(data);
      label = data;
    }
    ids.push(label._id);
  }
  return [...new Set(ids)];
}

export function findTodayList(store: ReturnType<typeof useTaskStore>): IList | null {
  const planning = store.sections.find(s => s.slug === 'planning');
  if (!planning) return null;
  return store.lists.find(l => l.sectionId === planning._id && l.name.toLowerCase() === 'today') || null;
}

export function findNextList(store: ReturnType<typeof useTaskStore>): IList | null {
  const planning = store.sections.find(s => s.slug === 'planning');
  if (!planning) return null;
  return store.lists.find(l => l.sectionId === planning._id && l.name.toLowerCase() === 'next') || null;
}

export function findBoardSectionId(store: ReturnType<typeof useTaskStore>): string | null {
  const board = store.sections.find(s => s.slug === 'board');
  return board?._id ?? null;
}

export async function ensureCabinetList(store: ReturnType<typeof useTaskStore>, listName: string): Promise<IList | null> {
  const trimmed = listName.trim();
  if (!trimmed) return null;
  const boardSectionId = findBoardSectionId(store);
  if (!boardSectionId) return null;
  const normalizedTarget = toClassSlug(trimmed);

  // Macro matching is case-insensitive and ignores whitespace/emoji/special chars.
  let list = store.lists.find(l => l.sectionId === boardSectionId && toClassSlug(l.name) === normalizedTarget) || null;
  if (list?.archived) {
    const { data } = await api.patch(`/lists/${list._id}/archive`);
    store.upsertList(data);
    list = data;
  }

  if (!list) {
    const { data } = await api.post('/lists', { name: trimmed, sectionId: boardSectionId });
    store.upsertList(data);
    list = data;
  }

  return list;
}

export async function addCardIfMissing(store: ReturnType<typeof useTaskStore>, taskId: string, listId: string): Promise<void> {
  const existing = store.cards.find(c => c.taskId === taskId && c.listId === listId);
  if (existing) return;
  const { data } = await api.post('/cards', { taskId, listId });
  store.upsertCard(data);
}
