import { Router, Request, Response } from 'express';
import { findAllLists, findListById, insertList, updateList, deleteList, archiveList, unarchiveList, maxListOrder, shiftListOrders } from '../queries/lists';
import { findAllCards, deleteCardsByListId } from '../queries/cards';
import { updateTask } from '../queries/tasks';
import { findSectionById } from '../queries/sections';
import { broadcast } from '../ws';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const filter: { sectionId?: string } = {};
  if (req.query.sectionId) filter.sectionId = req.query.sectionId as string;
  res.json(findAllLists(filter));
});

router.get('/:id', (req: Request, res: Response) => {
  const list = findListById(req.params.id);
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }
  res.json(list);
});

router.post('/', (req: Request, res: Response) => {
  const { name, sectionId } = req.body;
  if (!name || !sectionId) {
    res.status(400).json({ error: 'name and sectionId are required' });
    return;
  }

  const section = findSectionById(sectionId);
  if (!section || section.slug !== 'board') {
    res.status(400).json({ error: 'Lists can only be created in the Board section' });
    return;
  }

  const order = maxListOrder(sectionId) + 1;
  const list = insertList({ name, sectionId, order, isFixed: false });
  broadcast('list:created', list);
  res.status(201).json(list);
});

router.put('/:id', (req: Request, res: Response) => {
  const list = findListById(req.params.id);
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }
  if (list.isFixed) { res.status(400).json({ error: 'Fixed lists cannot be renamed' }); return; }

  const updated = updateList(list._id, { name: req.body.name });
  broadcast('list:updated', updated);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const list = findListById(req.params.id);
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }
  if (list.isFixed) { res.status(400).json({ error: 'Fixed lists cannot be deleted' }); return; }

  deleteCardsByListId(list._id);
  deleteList(list._id);
  broadcast('list:deleted', { _id: list._id });
  res.json({ message: 'List deleted' });
});

router.patch('/:id/archive', (req: Request, res: Response) => {
  const list = findListById(req.params.id);
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }
  if (list.isFixed) { res.status(400).json({ error: 'Fixed lists cannot be archived' }); return; }

  if (list.archived) {
    // Unarchive list and its tasks
    const updated = unarchiveList(list._id);
    const cards = findAllCards({ listId: list._id });
    for (const card of cards) {
      const updatedTask = updateTask(card.taskId, { archived: false });
      if (updatedTask) broadcast('task:updated', updatedTask);
    }
    broadcast('list:updated', updated);
    res.json(updated);
  } else {
    // Archive all tasks in this list first
    const cards = findAllCards({ listId: list._id });
    for (const card of cards) {
      const updated = updateTask(card.taskId, { archived: true });
      if (updated) broadcast('task:updated', updated);
    }

    const updated = archiveList(list._id);
    broadcast('list:updated', updated);
    res.json(updated);
  }
});

router.patch('/:id/reorder', (req: Request, res: Response) => {
  const { order } = req.body;
  if (order === undefined) {
    res.status(400).json({ error: 'order is required' });
    return;
  }

  const list = findListById(req.params.id);
  if (!list) { res.status(404).json({ error: 'List not found' }); return; }

  const oldOrder = list.order;
  const newOrder = order;
  if (oldOrder === newOrder) { res.json(list); return; }

  if (newOrder < oldOrder) {
    shiftListOrders(list.sectionId, newOrder, oldOrder, 1);
  } else {
    shiftListOrders(list.sectionId, oldOrder, newOrder, -1);
  }

  const updated = updateList(list._id, { order: newOrder });
  broadcast('list:reordered', updated);
  res.json(updated);
});

export default router;
