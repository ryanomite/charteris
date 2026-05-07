import { Router, Request, Response } from 'express';
import { findAllSections } from '../queries/sections';
import { findAllLists } from '../queries/lists';
import { findAllTasks } from '../queries/tasks';
import { findAllCards } from '../queries/cards';
import { findAllLabels } from '../queries/labels';
import { findGlobalSettings, findGlobalSettingsUpdatedAt } from '../queries/settings';

const router = Router();

function toMillis(value?: string): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function computeDashboardVersion() {
  const sections = findAllSections();
  const lists = findAllLists({ includeArchived: true });
  const tasks = findAllTasks();
  const cards = findAllCards();
  const labels = findAllLabels();
  const settingsUpdatedAt = findGlobalSettingsUpdatedAt();

  const latestMs = Math.max(
    ...sections.map(s => toMillis(s.updatedAt || s.createdAt)),
    ...lists.map(l => toMillis(l.updatedAt || l.createdAt)),
    ...tasks.map(t => toMillis(t.updatedAt || t.createdAt)),
    ...cards.map(c => toMillis(c.updatedAt || c.createdAt)),
    ...labels.map(l => toMillis(l.updatedAt || l.createdAt)),
    toMillis(settingsUpdatedAt || undefined),
    0,
  );

  return {
    version: String(latestMs),
    latestChangeAt: latestMs ? new Date(latestMs).toISOString() : null,
  };
}

router.get('/', (_req: Request, res: Response) => {
  const sections = findAllSections();
  const lists = findAllLists({ includeArchived: true });
  const tasks = findAllTasks();
  const cards = findAllCards();
  const labels = findAllLabels();
  const settings = findGlobalSettings();

  res.json({ sections, lists, tasks, cards, labels, settings });
});

router.get('/version', (_req: Request, res: Response) => {
  res.json(computeDashboardVersion());
});

export default router;
