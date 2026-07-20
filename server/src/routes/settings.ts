import { Router, Request, Response } from 'express';
import { findGlobalSettings, updateGlobalSettings } from '../queries/settings';
import { broadcast } from '../ws';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(findGlobalSettings());
});

router.put('/', (req: Request, res: Response) => {
  const { hideCommittedCards, castingRulesToday, castingRulesNext, cssOverrides, viewPresets } = req.body || {};

  if (hideCommittedCards !== undefined && typeof hideCommittedCards !== 'boolean') {
    res.status(400).json({ error: 'hideCommittedCards must be a boolean' });
    return;
  }
  if (castingRulesToday !== undefined && typeof castingRulesToday !== 'string') {
    res.status(400).json({ error: 'castingRulesToday must be a string' });
    return;
  }
  if (castingRulesNext !== undefined && typeof castingRulesNext !== 'string') {
    res.status(400).json({ error: 'castingRulesNext must be a string' });
    return;
  }
  if (cssOverrides !== undefined && typeof cssOverrides !== 'string') {
    res.status(400).json({ error: 'cssOverrides must be a string' });
    return;
  }
  if (viewPresets !== undefined && !Array.isArray(viewPresets)) {
    res.status(400).json({ error: 'viewPresets must be an array' });
    return;
  }
  if (Array.isArray(viewPresets)) {
    for (const p of viewPresets) {
      if (!p || typeof p._id !== 'string' || typeof p.name !== 'string' || typeof p.icon !== 'string' || typeof p.hash !== 'string') {
        res.status(400).json({ error: 'Each view preset must have _id, name, icon, and hash (all strings)' });
        return;
      }
    }
  }

  const updated = updateGlobalSettings({ hideCommittedCards, castingRulesToday, castingRulesNext, cssOverrides, viewPresets });
  broadcast('settings:updated', updated);
  res.json(updated);
});

export default router;
