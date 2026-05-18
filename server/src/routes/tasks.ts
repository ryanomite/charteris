import { Router, Request, Response } from 'express';
import {
  findAllTasks, findTaskById, insertTask, updateTask, deleteTask,
  propagateToSiblings, deleteTaskSeries, findTasksByParentId, type TaskFilter,
} from '../queries/tasks';
import { findAllCards, findCardById, deleteCard, insertCard } from '../queries/cards';
import { findAllLists, findListById, insertList, maxListOrder } from '../queries/lists';
import { findSectionById, findSectionBySlug } from '../queries/sections';
import { findLabelByName, insertLabel } from '../queries/labels';
import { broadcast } from '../ws';
import { normalizeName, parseTaskMacros } from '../utils/taskMacros';
import { trackCommitmentTransition, trackCompletionTransition, trackTaskDeletion } from '../utils/taskEventTracking';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const filter: TaskFilter = {};
  if (req.query.completed !== undefined) filter.completed = req.query.completed === 'true';
  if (req.query.archived !== undefined) filter.archived = req.query.archived === 'true';
  if (req.query.master !== undefined) filter.master = req.query.master === 'true';
  if (req.query.parentId) filter.parentId = req.query.parentId as string;
  if (req.query.label) filter.label = req.query.label as string;
  if (req.query.dueDate) filter.dueDate = req.query.dueDate as string;
  res.json(findAllTasks(filter));
});

router.get('/:id', (req: Request, res: Response) => {
  const task = findTaskById(req.params.id);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
  res.json(task);
});

router.post('/', (req: Request, res: Response) => {
  const {
    title,
    description,
    priority,
    labels,
    dueDate,
    recurrence,
    completed,
    archived,
    master,
    parentId,
    subtasks,
    applyMacros,
    listId,
    selectListId,
  } = req.body || {};

  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const parseOnServer = applyMacros === true;
  const parsed = parseOnServer ? parseTaskMacros(title) : null;
  const finalTitle = parsed?.title || title;

  if (!finalTitle.trim()) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const labelIds = Array.isArray(labels) ? labels.filter((id: unknown): id is string => typeof id === 'string') : [];
  if (parsed?.labelNames?.length) {
    for (const raw of parsed.labelNames) {
      const name = raw.trim();
      if (!name) continue;
      const existing = findLabelByName(name);
      const label = existing || insertLabel(name);
      if (!labelIds.includes(label._id)) labelIds.push(label._id);
    }
  }

  const planningSection = findSectionBySlug('planning');
  const boardSection = findSectionBySlug('board');
  const planningLists = planningSection ? findAllLists({ sectionId: planningSection._id, includeArchived: true }) : [];
  const boardLists = boardSection ? findAllLists({ sectionId: boardSection._id, includeArchived: true }) : [];
  const todayList = planningLists.find(l => l.name.toLowerCase() === 'today');
  const nextList = planningLists.find(l => l.name.toLowerCase() === 'next');

  const targetListIds = new Set<string>();

  if (typeof listId === 'string' && listId.trim()) {
    const explicit = findListById(listId);
    if (!explicit) {
      res.status(400).json({ error: 'listId is invalid' });
      return;
    }
    targetListIds.add(explicit._id);
  }

  if (parsed?.targetListName && boardSection) {
    const normalizedTarget = normalizeName(parsed.targetListName);
    let boardList = boardLists.find(l => normalizeName(l.name) === normalizedTarget) || null;
    if (!boardList) {
      boardList = insertList({
        name: parsed.targetListName.trim(),
        sectionId: boardSection._id,
        order: maxListOrder(boardSection._id) + 1,
        isFixed: false,
      });
    }
    targetListIds.add(boardList._id);
  }

  if (parsed?.addToToday && todayList) {
    targetListIds.add(todayList._id);
  }
  if (parsed?.addToNext && nextList) {
    targetListIds.add(nextList._id);
  }

  // Handle selectListId: explicit list selection from user
  if (typeof selectListId === 'string' && selectListId.trim()) {
    const selectedList = findListById(selectListId);
    if (!selectedList) {
      res.status(400).json({ error: 'selectListId is invalid' });
      return;
    }
    const selectedSection = findSectionById(selectedList.sectionId);
    if (selectedSection?.slug === 'board') {
      // Cabinet list: move to that list only
      targetListIds.clear();
      targetListIds.add(selectedList._id);
    } else if (selectedSection?.slug === 'planning') {
      // Counter list (Today/Next): add to that list, remove from the other
      if (selectedList.name.toLowerCase() === 'today') {
        targetListIds.delete(nextList?._id || '');
        if (todayList) targetListIds.add(todayList._id);
      } else if (selectedList.name.toLowerCase() === 'next') {
        targetListIds.delete(todayList?._id || '');
        if (nextList) targetListIds.add(nextList._id);
      }
    }
  }

  // Ensure tasks created through the API are visible by default.
  if (targetListIds.size === 0) {
    if (!todayList) {
      res.status(500).json({ error: 'Today list not found for default placement' });
      return;
    }
    targetListIds.add(todayList._id);
  }

  const task = insertTask({
    title: finalTitle,
    description: description || '',
    priority: parsed?.priority ?? priority ?? null,
    labels: labelIds,
    dueDate: dueDate || null,
    recurrence: recurrence || '',
    completed: completed || false,
    archived: archived || false,
    master: master || false,
    parentId: parentId || null,
    subtasks: subtasks || [],
    completedAt: completed ? new Date().toISOString() : null,
  });

  for (const targetId of targetListIds) {
    const createdCard = insertCard({ taskId: task._id, listId: targetId });
    broadcast('card:created', createdCard);
  }

  broadcast('task:created', task);
  res.status(201).json(task);
});

router.put('/:id', (req: Request, res: Response) => {
  const task = findTaskById(req.params.id);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const propagatableFields = ['title', 'description', 'priority', 'labels', 'dueDate', 'recurrence', 'subtasks'];
  const instanceFields = ['completed', 'archived'];

  const updateData: Record<string, unknown> = {};
  const propagateData: Record<string, unknown> = {};

  for (const field of instanceFields) {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  }

  for (const field of propagatableFields) {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
      propagateData[field] = req.body[field];
    }
  }

  const updated = updateTask(task._id, updateData as any);
  if (!updated) { res.status(404).json({ error: 'Task not found' }); return; }

  trackCompletionTransition(task, updated);

  // Sync Today card membership based on due-date edits.
  // - If due date becomes today: ensure a Today card exists.
  // - If due date becomes non-today: remove Today card only when task is unorphaned.
  if (req.body.dueDate !== undefined) {
    const planningSection = findSectionBySlug('planning');
    const todayList = planningSection
      ? findAllLists({ sectionId: planningSection._id }).find(l => l.name === 'Today')
      : null;

    if (todayList) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const isDueToday = updated.dueDate === todayStr;
      const taskCards = findAllCards({ taskId: updated._id });
      const todayCard = taskCards.find(c => c.listId === todayList._id);

      if (isDueToday && !todayCard) {
        const createdTodayCard = insertCard({ taskId: updated._id, listId: todayList._id });
        trackCommitmentTransition(updated._id, null, todayList._id);
        broadcast('card:created', createdTodayCard);
      }

      if (!isDueToday && todayCard) {
        const hasOtherCards = taskCards.some(c => c.listId !== todayList._id);
        if (hasOtherCards) {
          deleteCard(todayCard._id);
          trackCommitmentTransition(updated._id, todayList._id, null);
          broadcast('card:deleted', { _id: todayCard._id });
        }
      }
    }
  }

  if (updated.parentId && Object.keys(propagateData).length > 0) {
    propagateToSiblings(updated, propagateData);
  }

  broadcast('task:updated', updated);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const task = findTaskById(req.params.id);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const cardId = req.query.cardId as string | undefined;
  if (cardId) {
    const card = findCardById(cardId);
    if (card) {
      const list = findListById(card.listId);
      const section = list ? findSectionById(list.sectionId) : null;
      if (section?.slug === 'planning') {
        const allTaskCards = findAllCards({ taskId: task._id });
        const otherCards = allTaskCards.filter(c => c._id !== card._id);
        if (otherCards.length > 0) {
          trackCommitmentTransition(task._id, card.listId, null);
          deleteCard(card._id);
          broadcast('card:deleted', { _id: card._id });
          res.json({ message: 'Card removed' });
          return;
        }
      }
    }
  }

  const taskCards = findAllCards({ taskId: task._id });
  for (const card of taskCards) {
    trackCommitmentTransition(task._id, card.listId, null);
  }
  trackTaskDeletion(task);

  deleteTask(task._id);
  broadcast('task:deleted', { _id: task._id });
  res.json({ message: 'Task deleted' });
});

router.patch('/:id/complete', (req: Request, res: Response) => {
  const task = findTaskById(req.params.id);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const updated = updateTask(task._id, { completed: !task.completed });
  if (updated) {
    trackCompletionTransition(task, updated);
  }
  broadcast('task:updated', updated);
  res.json(updated);
});

router.patch('/:id/archive', (req: Request, res: Response) => {
  const task = findTaskById(req.params.id);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const updated = updateTask(task._id, { archived: !task.archived });
  broadcast('task:updated', updated);
  res.json(updated);
});

router.delete('/:id/series', (req: Request, res: Response) => {
  const task = findTaskById(req.params.id);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  if (!task.parentId) {
    res.status(400).json({ error: 'Task is not part of a series' });
    return;
  }

  const seriesTasks = findTasksByParentId(task.parentId);
  for (const seriesTask of seriesTasks) {
    const cards = findAllCards({ taskId: seriesTask._id });
    for (const card of cards) {
      trackCommitmentTransition(seriesTask._id, card.listId, null);
    }
    trackTaskDeletion(seriesTask);
  }

  const { deletedCount, taskIds } = deleteTaskSeries(task.parentId);
  for (const id of taskIds) {
    broadcast('task:deleted', { _id: id });
  }
  res.json({ message: 'Series deleted', deletedCount });
});

export default router;
