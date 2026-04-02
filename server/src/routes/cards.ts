import { Router, Request, Response } from 'express';
import {
  findAllCards, findCardById, insertCard, updateCard, deleteCard,
  closeGap, makeRoom, shiftCardOrdersUp, shiftCardOrdersDown,
  findCardByTaskInLists, maxCardOrder,
} from '../queries/cards';
import { findListById, findAllLists } from '../queries/lists';
import { findSectionById } from '../queries/sections';
import { findTaskById, deleteTask } from '../queries/tasks';
import { broadcast } from '../ws';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const filter: { listId?: string; taskId?: string } = {};
  if (req.query.listId) filter.listId = req.query.listId as string;
  if (req.query.taskId) filter.taskId = req.query.taskId as string;
  res.json(findAllCards(filter));
});

router.get('/:id', (req: Request, res: Response) => {
  const card = findCardById(req.params.id);
  if (!card) { res.status(404).json({ error: 'Card not found' }); return; }
  res.json(card);
});

router.post('/', (req: Request, res: Response) => {
  const { taskId, listId } = req.body;
  if (!taskId || !listId) {
    res.status(400).json({ error: 'taskId and listId are required' });
    return;
  }

  const card = insertCard({ taskId, listId });
  broadcast('card:created', card);
  res.status(201).json(card);
});

router.put('/:id', (req: Request, res: Response) => {
  const card = findCardById(req.params.id);
  if (!card) { res.status(404).json({ error: 'Card not found' }); return; }

  const updated = updateCard(card._id, {
    listId: req.body.listId,
    order: req.body.order,
  });
  broadcast('card:updated', updated);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const card = findCardById(req.params.id);
  if (!card) { res.status(404).json({ error: 'Card not found' }); return; }

  const allTaskCards = findAllCards({ taskId: card.taskId });
  const otherCards = allTaskCards.filter(c => c._id !== card._id);

  if (otherCards.length > 0) {
    // Task exists elsewhere — just remove this card
    deleteCard(card._id);
    broadcast('card:deleted', { _id: card._id });
    res.json({ message: 'Card removed' });
  } else {
    // Orphaned — delete the task (cascades to card)
    deleteTask(card.taskId);
    broadcast('task:deleted', { _id: card.taskId });
    res.json({ message: 'Task deleted' });
  }
});

router.patch('/:id/reorder', (req: Request, res: Response) => {
  const { order } = req.body;
  if (order === undefined) {
    res.status(400).json({ error: 'order is required' });
    return;
  }

  const card = findCardById(req.params.id);
  if (!card) { res.status(404).json({ error: 'Card not found' }); return; }

  const oldOrder = card.order;
  const newOrder = order;
  if (oldOrder === newOrder) { res.json(card); return; }

  if (newOrder < oldOrder) {
    shiftCardOrdersUp(card.listId, newOrder, oldOrder);
  } else {
    shiftCardOrdersDown(card.listId, oldOrder, newOrder);
  }

  const updated = updateCard(card._id, { order: newOrder });
  broadcast('card:reordered', updated);
  res.json(updated);
});

router.patch('/:id/move', (req: Request, res: Response) => {
  const { targetListId, order: targetOrder } = req.body;
  if (!targetListId) {
    res.status(400).json({ error: 'targetListId is required' });
    return;
  }

  const card = findCardById(req.params.id);
  if (!card) { res.status(404).json({ error: 'Card not found' }); return; }

  const sourceList = findListById(card.listId);
  const targetList = findListById(targetListId);
  if (!sourceList || !targetList) {
    res.status(404).json({ error: 'Source or target list not found' });
    return;
  }

  // Determine insertion order
  let newOrder: number;
  if (targetOrder !== undefined) {
    newOrder = targetOrder;
  } else {
    newOrder = maxCardOrder(targetListId) + 1;
  }

  const sameSectionMove = sourceList.sectionId === targetList.sectionId;

  if (sameSectionMove) {
    // Same section: move the card
    closeGap(card.listId, card.order);
    makeRoom(targetListId, newOrder);

    const updated = updateCard(card._id, { listId: targetList._id, order: newOrder });
    broadcast('card:moved', updated);
    res.json(updated);
  } else {
    // Cross-section: check if task already in target section
    const targetSectionLists = findAllLists({ sectionId: targetList.sectionId });
    const targetSectionListIds = targetSectionLists.map(l => l._id);
    const existingCard = findCardByTaskInLists(card.taskId, targetSectionListIds);

    if (existingCard) {
      // Already in target section — remove source card
      closeGap(card.listId, card.order);
      deleteCard(card._id);
      broadcast('card:deleted', { _id: card._id });
      res.json(existingCard);
    } else {
      // Duplicate card in target
      makeRoom(targetListId, newOrder);
      const newCard = insertCard({ taskId: card.taskId, listId: targetList._id, order: newOrder });
      broadcast('card:created', newCard);

      // If source is Inbox, remove source card (one-way out of Draft)
      const sourceSection = findSectionById(sourceList.sectionId);
      if (sourceSection && sourceSection.slug === 'inbox') {
        closeGap(card.listId, card.order);
        deleteCard(card._id);
        broadcast('card:deleted', { _id: card._id });
      }

      res.json(newCard);
    }
  }
});

export default router;
