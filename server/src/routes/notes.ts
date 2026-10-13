import { Router, Request, Response } from 'express';
import { findNotes, updateNotes } from '../queries/notes';
import { broadcast } from '../ws';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(findNotes());
});

router.put('/', (req: Request, res: Response) => {
  const { content } = req.body || {};

  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content must be a string' });
    return;
  }

  const updated = updateNotes(content);
  broadcast('notes:updated', updated);
  res.json(updated);
});

export default router;
