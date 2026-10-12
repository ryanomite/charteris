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

// GET /api/v1/stats/burndown — today's open-commitment burn-down.
// Replays task_events to reconstruct how many committed (Today) tasks were
// still open at each half-hour mark, starting at 8:00am local time.
// Accepts optional ?tz=<minutes> (JS getTimezoneOffset()) for local-time labels.
router.get('/burndown', (req: Request, res: Response) => {
  const db = getDb();

  const rawTz = parseInt(req.query.tz as string);
  const tzOffset = Number.isFinite(rawTz) && rawTz >= -840 && rawTz <= 840 ? rawTz : 0;

  const nowMs = Date.now();
  const localNow = new Date(nowMs - tzOffset * 60 * 1000);

  // Today's 8:00am local, expressed as a real UTC timestamp
  const localMidnightMs = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
  const startMs = localMidnightMs + 8 * 60 * 60 * 1000 + tzOffset * 60 * 1000;

  // Build sample points every 30 minutes from 8:00am through now.
  const STEP = 30 * 60 * 1000;
  const samples: number[] = [];
  if (nowMs >= startMs) {
    for (let t = startMs; t <= nowMs; t += STEP) samples.push(t);
    if (samples[samples.length - 1] !== nowMs) samples.push(nowMs);
  } else {
    samples.push(startMs);
  }

  // Replay the event log in order, tracking each task's committed/completed state.
  // A task counts as an "open commitment" when it is committed to Today and not yet complete.
  const events = db.prepare(`
    SELECT taskId, eventType, occurredAt
    FROM task_events
    WHERE eventType IN ('task_committed', 'task_uncommitted', 'task_completed', 'task_uncompleted', 'task_deleted')
    ORDER BY occurredAt ASC
  `).all() as { taskId: string; eventType: string; occurredAt: string }[];

  const state = new Map<string, { committed: boolean; completed: boolean }>();
  let open = 0;
  let ei = 0;
  const counts: number[] = [];

  for (const sampleMs of samples) {
    while (ei < events.length && new Date(events[ei].occurredAt).getTime() <= sampleMs) {
      const ev = events[ei++];
      const st = state.get(ev.taskId) ?? { committed: false, completed: false };
      const wasOpen = st.committed && !st.completed;

      switch (ev.eventType) {
        case 'task_committed': st.committed = true; break;
        case 'task_uncommitted': st.committed = false; break;
        case 'task_completed': st.completed = true; break;
        case 'task_uncompleted': st.completed = false; break;
        case 'task_deleted': st.committed = false; st.completed = false; break;
      }

      const isOpen = st.committed && !st.completed;
      if (isOpen !== wasOpen) open += isOpen ? 1 : -1;
      state.set(ev.taskId, st);
    }
    counts.push(open);
  }

  const times = samples.map((ms) => {
    const local = new Date(ms - tzOffset * 60 * 1000);
    const h = String(local.getUTCHours()).padStart(2, '0');
    const m = String(local.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  });

  res.json({ times, counts });
});

export default router;
