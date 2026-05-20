import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

// GET /api/v1/stats — returns daily commitment/completion counts for the last 30 days
// Accepts optional ?tz=<minutes> (JS getTimezoneOffset(), e.g. 300 for CDT) to group by local date
router.get('/', (req: Request, res: Response) => {
  const db = getDb();

  // Parse timezone offset: JS getTimezoneOffset() = minutes *west* of UTC (positive for behind UTC)
  const rawTz = parseInt(req.query.tz as string);
  const tzOffset = Number.isFinite(rawTz) && rawTz >= -840 && rawTz <= 840 ? rawTz : 0;
  // SQLite modifier to shift UTC → local: subtract tzOffset minutes
  const tzModifier = `${-tzOffset} minutes`;

  // Generate the last 30 dates in local time (oldest first)
  const localNow = new Date(Date.now() - tzOffset * 60 * 1000);
  const dates: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(localNow.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const rows = db.prepare(`
    SELECT
      DATE(datetime(occurredAt, ?)) as date,
      COUNT(DISTINCT CASE WHEN eventType = 'task_committed' THEN taskId END) as commitments,
      SUM(CASE WHEN eventType = 'task_completed' THEN 1 ELSE 0 END) as completions
    FROM task_events
    WHERE eventType IN ('task_committed', 'task_completed')
      AND DATE(datetime(occurredAt, ?)) >= ?
    GROUP BY DATE(datetime(occurredAt, ?))
    ORDER BY date ASC
  `).all(tzModifier, tzModifier, dates[0], tzModifier) as { date: string; commitments: number; completions: number }[];

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
