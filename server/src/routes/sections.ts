import { Router, Request, Response } from 'express';
import { findAllSections, findSectionById, findSectionBySlug } from '../queries/sections';
import { findAllLists } from '../queries/lists';
import { findAllCards, deleteCard, updateCard, maxCardOrder, insertCard } from '../queries/cards';
import { findTasksForCast } from '../queries/tasks';
import { broadcast } from '../ws';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(findAllSections());
});

router.get('/:id', (req: Request, res: Response) => {
  const section = findSectionById(req.params.id);
  if (!section) { res.status(404).json({ error: 'Section not found' }); return; }
  res.json(section);
});

// POST /sections/planning/adjourn
// Clears the Today list: tasks that exist in other lists are removed from Today;
// tasks that only exist in Today (orphaned) are moved to Next.
router.post('/planning/adjourn', (_req: Request, res: Response) => {
  const section = findSectionBySlug('planning');
  if (!section) { res.status(404).json({ error: 'Planning section not found' }); return; }

  const lists = findAllLists({ sectionId: section._id });
  const todayList = lists.find(l => l.name === 'Today');
  const nextList = lists.find(l => l.name === 'Next');
  if (!todayList || !nextList) {
    res.status(500).json({ error: 'Today or Next list not found' });
    return;
  }

  const todayCards = findAllCards({ listId: todayList._id });
  for (const card of todayCards) {
    const allTaskCards = findAllCards({ taskId: card.taskId });
    const hasOtherCards = allTaskCards.some(c => c.listId !== todayList._id);
    if (hasOtherCards) {
      deleteCard(card._id);
    } else {
      const nextOrder = maxCardOrder(nextList._id) + 1;
      updateCard(card._id, { listId: nextList._id, order: nextOrder });
    }
  }

  broadcast('cards:bulk-updated', { listIds: [todayList._id, nextList._id] });
  res.json({ listIds: [todayList._id, nextList._id] });
});

// POST /sections/board/cast
// Adds cards to Today for all incomplete/unarchived tasks that are overdue,
// due today, or have priority 1 — skipping any already in Today.
router.post('/board/cast', (_req: Request, res: Response) => {
  const planningSec = findSectionBySlug('planning');
  if (!planningSec) { res.status(404).json({ error: 'Planning section not found' }); return; }

  const lists = findAllLists({ sectionId: planningSec._id });
  const todayList = lists.find(l => l.name === 'Today');
  if (!todayList) { res.status(500).json({ error: 'Today list not found' }); return; }

  const today = new Date().toISOString().substring(0, 10);
  const eligible = findTasksForCast(today);

  const todayCards = findAllCards({ listId: todayList._id });
  const todayTaskIds = new Set(todayCards.map(c => c.taskId));

  const newCards = [];
  for (const task of eligible) {
    if (!todayTaskIds.has(task._id)) {
      const card = insertCard({ taskId: task._id, listId: todayList._id });
      newCards.push(card);
    }
  }

  if (newCards.length > 0) {
    broadcast('cards:bulk-updated', { listIds: [todayList._id] });
  }
  res.json({ added: newCards.length, listId: todayList._id });
});

export default router;
