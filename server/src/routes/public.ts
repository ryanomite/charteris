import { Router, Request, Response } from 'express';
import { findSectionBySlug } from '../queries/sections';
import { findAllLists } from '../queries/lists';
import { findAllCards } from '../queries/cards';
import { findTaskById, updateTask } from '../queries/tasks';
import { broadcast } from '../ws';

const router = Router();

function getTodayIncompleteTasks() {
  const planning = findSectionBySlug('planning');
  if (!planning) return [] as ReturnType<typeof findTaskById>[];

  const todayList = findAllLists({ sectionId: planning._id, includeArchived: true })
    .find(l => l.name.toLowerCase() === 'today');
  if (!todayList) return [] as ReturnType<typeof findTaskById>[];

  const cards = findAllCards({ listId: todayList._id });
  const tasks = cards
    .map(c => findTaskById(c.taskId))
    .filter((t): t is NonNullable<ReturnType<typeof findTaskById>> => Boolean(t))
    .filter(t => !t.completed && !t.archived);

  return tasks;
}

router.get('/today/top', (_req: Request, res: Response) => {
  const top = getTodayIncompleteTasks().slice(0, 3).map(t => t.title);
  res.type('text/plain').send(top.join('\n'));
});

router.get('/today/complete', (req: Request, res: Response) => {
  const nRaw = (req.query.n as string | undefined)
    ?? Object.keys(req.query).find(k => /^[123]$/.test(k));
  const n = Number(nRaw);

  if (![1, 2, 3].includes(n)) {
    res.status(400).type('text/plain').send('Invalid position. Use n=1, n=2, or n=3.');
    return;
  }

  const tasks = getTodayIncompleteTasks();
  const task = tasks[n - 1];
  if (!task) {
    res.status(404).type('text/plain').send('No task found at that position.');
    return;
  }

  const updated = updateTask(task._id, { completed: true });
  if (!updated) {
    res.status(500).type('text/plain').send('Failed to complete task.');
    return;
  }

  broadcast('task:updated', updated);
  res.type('text/plain').send(`Completed: ${updated.title}`);
});

export default router;
