import { Router, Request, Response } from 'express';
import { findAllSections } from '../queries/sections';
import { findAllLists } from '../queries/lists';
import { findAllTasks } from '../queries/tasks';
import { findAllCards } from '../queries/cards';
import { findAllLabels } from '../queries/labels';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const sections = findAllSections();
  const lists = findAllLists();
  const tasks = findAllTasks();
  const cards = findAllCards();
  const labels = findAllLabels();

  res.json({ sections, lists, tasks, cards, labels });
});

export default router;
