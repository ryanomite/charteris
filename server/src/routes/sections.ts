import { Router, Request, Response } from 'express';
import { findAllSections, findSectionById } from '../queries/sections';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(findAllSections());
});

router.get('/:id', (req: Request, res: Response) => {
  const section = findSectionById(req.params.id);
  if (!section) { res.status(404).json({ error: 'Section not found' }); return; }
  res.json(section);
});

export default router;
