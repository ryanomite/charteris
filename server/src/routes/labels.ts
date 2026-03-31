import { Router, Request, Response } from 'express';
import { findAllLabels, findLabelById, findLabelByName, insertLabel, updateLabel, deleteLabel } from '../queries/labels';
import { broadcast } from '../ws';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const q = req.query.q as string | undefined;
  res.json(findAllLabels(q));
});

router.get('/:id', (req: Request, res: Response) => {
  const label = findLabelById(req.params.id);
  if (!label) { res.status(404).json({ error: 'Label not found' }); return; }
  res.json(label);
});

router.post('/', (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }

  const existing = findLabelByName(name.trim().toLowerCase());
  if (existing) {
    res.status(409).json({ error: 'Label already exists', label: existing });
    return;
  }

  const label = insertLabel(name);
  broadcast('label:created', label);
  res.status(201).json(label);
});

router.put('/:id', (req: Request, res: Response) => {
  const label = findLabelById(req.params.id);
  if (!label) { res.status(404).json({ error: 'Label not found' }); return; }

  const updated = updateLabel(label._id, req.body.name);
  broadcast('label:updated', updated);
  res.json(updated);
});

router.delete('/:id', (req: Request, res: Response) => {
  const label = findLabelById(req.params.id);
  if (!label) { res.status(404).json({ error: 'Label not found' }); return; }

  deleteLabel(label._id);
  broadcast('label:deleted', { _id: label._id });
  res.json({ message: 'Label deleted' });
});

export default router;
