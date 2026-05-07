import { Router, Request, Response } from 'express';
import { findGlobalSettings, updateGlobalSettings } from '../queries/settings';
import { broadcast } from '../ws';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(findGlobalSettings());
});

router.put('/', (req: Request, res: Response) => {
  const { hideCommittedCards, castingRulesToday, castingRulesNext, cssOverrides } = req.body || {};

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

  const updated = updateGlobalSettings({ hideCommittedCards, castingRulesToday, castingRulesNext, cssOverrides });
  broadcast('settings:updated', updated);
  res.json(updated);
});

export default router;
