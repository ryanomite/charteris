import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

// GET /api/v1/stats — returns daily commitment/completion counts for the last 30 days
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();

  // Generate the last 30 dates (today inclusive, oldest first)
  const dates: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const rows = db.prepare(`
    SELECT
      DATE(occurredAt) as date,
      SUM(CASE WHEN eventType = 'task_committed' THEN 1 ELSE 0 END) as commitments,
      SUM(CASE WHEN eventType = 'task_completed' THEN 1 ELSE 0 END) as completions
    FROM task_events
    WHERE eventType IN ('task_committed', 'task_completed')
      AND DATE(occurredAt) >= ?
    GROUP BY DATE(occurredAt)
    ORDER BY date ASC
  `).all(dates[0]) as { date: string; commitments: number; completions: number }[];

  const rowMap = new Map(rows.map(r => [r.date, r]));

  const commitments: number[] = [];
  const completions: number[] = [];
  const percentages: number[] = [];

  for (const date of dates) {
    const row = rowMap.get(date);
    const c = row?.commitments ?? 0;
    const x = row?.completions ?? 0;
    commitments.push(c);
    completions.push(x);
    percentages.push(c > 0 ? Math.min(100, Math.round((x / c) * 100)) : 0);
  }

  res.json({ dates, commitments, completions, percentages });
});

export default router;
