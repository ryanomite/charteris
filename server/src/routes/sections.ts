import { Router, Request, Response } from 'express';
import { findAllSections, findSectionById, findSectionBySlug } from '../queries/sections';
import { findAllLists } from '../queries/lists';
import { findAllCards, deleteCard, updateCard, maxCardOrder, insertCard } from '../queries/cards';
import { findTaskById, findTasksForCast, findTasksDueTomorrow } from '../queries/tasks';
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
// 1. Remove completed/archived cards from both Today and Next.
// 2. Remove non-orphaned cards from Next (tasks that exist in other lists).
// 3. Move ALL remaining Today cards to Next (orphaned or not).
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

  // Step 1: Remove completed/archived cards from both Today and Next
  const bothListCards = [
    ...findAllCards({ listId: todayList._id }),
    ...findAllCards({ listId: nextList._id }),
  ];
  for (const card of bothListCards) {
    const task = findTaskById(card.taskId);
    if (task && (task.completed || task.archived)) {
      deleteCard(card._id);
    }
  }

  // Step 2: Remove non-orphaned cards from Next
  const nextCardsAfterStep1 = findAllCards({ listId: nextList._id });
  for (const card of nextCardsAfterStep1) {
    const allTaskCards = findAllCards({ taskId: card.taskId });
    const hasOtherCards = allTaskCards.some(c => c.listId !== nextList._id);
    if (hasOtherCards) {
      deleteCard(card._id);
    }
  }

  // Step 3: Move all remaining Today cards to Next
  const todayCardsAfterStep1 = findAllCards({ listId: todayList._id });
  for (const card of todayCardsAfterStep1) {
    const nextOrder = maxCardOrder(nextList._id) + 1;
    updateCard(card._id, { listId: nextList._id, order: nextOrder });
  }

  broadcast('cards:bulk-updated', { listIds: [todayList._id, nextList._id] });
  res.json({ listIds: [todayList._id, nextList._id] });
});

// POST /sections/board/cast
// → Today: incomplete/unarchived tasks overdue, due today, or priority 1
// → Next:  incomplete/unarchived tasks due tomorrow (not already in Today or Next)
router.post('/board/cast', (_req: Request, res: Response) => {
  const planningSec = findSectionBySlug('planning');
  if (!planningSec) { res.status(404).json({ error: 'Planning section not found' }); return; }

  const lists = findAllLists({ sectionId: planningSec._id });
  const todayList = lists.find(l => l.name === 'Today');
  const nextList  = lists.find(l => l.name === 'Next');
  if (!todayList || !nextList) { res.status(500).json({ error: 'Today or Next list not found' }); return; }

  const now = new Date();
  const today    = now.toISOString().substring(0, 10);
  const tomorrowDate = new Date(now); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().substring(0, 10);

  // --- Today: overdue, due today, or priority 1 ---
  const eligibleToday = findTasksForCast(today);
  const todayCards = findAllCards({ listId: todayList._id });
  const todayTaskIds = new Set(todayCards.map(c => c.taskId));

  const addedToday = [];
  for (const task of eligibleToday) {
    if (!todayTaskIds.has(task._id)) {
      addedToday.push(insertCard({ taskId: task._id, listId: todayList._id }));
    }
  }

  // --- Next: due tomorrow, not already in Today or Next ---
  const eligibleTomorrow = findTasksDueTomorrow(tomorrow);
  const nextCards = findAllCards({ listId: nextList._id });
  const nextTaskIds = new Set(nextCards.map(c => c.taskId));
  // Refresh todayTaskIds to include cards just added
  const todayTaskIdsUpdated = new Set([...todayTaskIds, ...addedToday.map(c => c.taskId)]);

  const addedNext = [];
  for (const task of eligibleTomorrow) {
    if (!todayTaskIdsUpdated.has(task._id) && !nextTaskIds.has(task._id)) {
      addedNext.push(insertCard({ taskId: task._id, listId: nextList._id }));
    }
  }

  const affectedLists = [todayList._id];
  if (addedNext.length > 0) affectedLists.push(nextList._id);
  if (addedToday.length > 0 || addedNext.length > 0) {
    broadcast('cards:bulk-updated', { listIds: affectedLists });
  }
  res.json({ addedToday: addedToday.length, addedNext: addedNext.length });
});

export default router;
