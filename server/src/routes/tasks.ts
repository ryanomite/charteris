import { Router, Request, Response } from 'express';
import {
  findAllTasks, findTaskById, insertTask, updateTask, deleteTask,
  propagateToSiblings, deleteTaskSeries, type TaskFilter,
} from '../queries/tasks';
import { broadcast } from '../ws';

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
  const { title, description, priority, labels, dueDate, recurrence, completed, archived, master, parentId, subtasks } = req.body;
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  const task = insertTask({
    title,
    description: description || '',
    priority: priority || null,
    labels: labels || [],
    dueDate: dueDate || null,
    recurrence: recurrence || '',
    completed: completed || false,
    archived: archived || false,
    master: master || false,
    parentId: parentId || null,
    subtasks: subtasks || [],
  });

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

  if (updated.parentId && Object.keys(propagateData).length > 0) {
    propagateToSiblings(updated, propagateData);
  }

  broadcast('task:updated', updated);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const task = findTaskById(req.params.id);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  deleteTask(task._id);
  broadcast('task:deleted', { _id: task._id });
  res.json({ message: 'Task deleted' });
});

router.patch('/:id/complete', (req: Request, res: Response) => {
  const task = findTaskById(req.params.id);
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const updated = updateTask(task._id, { completed: !task.completed });
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

  const { deletedCount, taskIds } = deleteTaskSeries(task.parentId);
  for (const id of taskIds) {
    broadcast('task:deleted', { _id: id });
  }
  res.json({ message: 'Series deleted', deletedCount });
});

export default router;
