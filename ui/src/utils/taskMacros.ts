export interface ParsedTaskMacros {
  title: string;
  priority: 1 | 2 | 3 | 4 | 5 | null;
  labelNames: string[];
  targetListName: string | null;
  dueDate: string | null;
  addToToday: boolean;
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function resolveWeekday(targetDay: number): string {
  const today = startOfToday();
  const delta = (targetDay - today.getDay() + 7) % 7;
  const out = new Date(today);
  out.setDate(out.getDate() + delta);
  return formatYmd(out);
}

function resolveMmDdOrMmDdYyyy(value: string): string | null {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year: number;
  if (m[3]) {
    year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  } else {
    const now = new Date();
    year = now.getFullYear();
  }

  const candidate = new Date(year, month - 1, day);
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return null;
  }

  // If year omitted and date already passed, target next year.
  if (!m[3]) {
    const today = startOfToday();
    if (candidate < today) {
      const next = new Date(year + 1, month - 1, day);
      if (next.getMonth() === month - 1 && next.getDate() === day) {
        return formatYmd(next);
      }
    }
  }

  return formatYmd(candidate);
}

function resolveIsoDate(value: string): string | null {
  const m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const candidate = new Date(year, month - 1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) {
    return null;
  }
  return formatYmd(candidate);
}

function resolveKeywordDate(value: string): { dueDate: string | null; addToToday: boolean } {
  const v = value.toLowerCase();
  if (v === 'today') {
    return { dueDate: formatYmd(startOfToday()), addToToday: true };
  }
  if (v === 'tomorrow') {
    const d = startOfToday();
    d.setDate(d.getDate() + 1);
    return { dueDate: formatYmd(d), addToToday: false };
  }

  const weekdayMap: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };

  if (weekdayMap[v] !== undefined) {
    return { dueDate: resolveWeekday(weekdayMap[v]), addToToday: false };
  }

  return { dueDate: null, addToToday: false };
}

function tryResolveDate(rawToken: string): { dueDate: string | null; addToToday: boolean } {
  const keyword = resolveKeywordDate(rawToken);
  if (keyword.dueDate) return keyword;

  const mmdd = resolveMmDdOrMmDdYyyy(rawToken);
  if (mmdd) return { dueDate: mmdd, addToToday: false };

  const iso = resolveIsoDate(rawToken);
  if (iso) return { dueDate: iso, addToToday: false };

  return { dueDate: null, addToToday: false };
}

export function parseTaskMacros(rawInput: string): ParsedTaskMacros {
  let working = rawInput;
  let priority: 1 | 2 | 3 | 4 | 5 | null = null;
  const labelNames: string[] = [];
  let targetListName: string | null = null;
  let dueDate: string | null = null;
  let addToToday = false;

  // Standalone "!" at start or after whitespace, including forms like "!Buy milk".
  working = working.replace(/(^|\s)!+(?=\s|$|\S)/g, (_m, p1: string) => {
    addToToday = true;
    return p1 || ' ';
  });

  // Priorities p1..p5
  working = working.replace(/(?:^|\s)p([1-5])(?=\s|$)/gi, (_m, digit: string) => {
    priority = Number(digit) as 1 | 2 | 3 | 4 | 5;
    return ' ';
  });

  // Labels @foo
  working = working.replace(/(?:^|\s)@([^\s#@!]+)/g, (_m, name: string) => {
    labelNames.push(name);
    return ' ';
  });

  // List macro #foo
  working = working.replace(/(?:^|\s)#([^\s#@!]+)/g, (_m, name: string) => {
    targetListName = name;
    return ' ';
  });

  // Date macros
  const dateTokens = [
    /(?:^|\s)(today|tomorrow|sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)(?=\s|$)/i,
    /(?:^|\s)(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?=\s|$)/,
    /(?:^|\s)(\d{4}-\d{1,2}-\d{1,2})(?=\s|$)/,
  ];

  for (const tokenRe of dateTokens) {
    const m = working.match(tokenRe);
    if (!m) continue;
    const rawToken = m[1];
    const resolved = tryResolveDate(rawToken);
    if (resolved.dueDate) {
      dueDate = resolved.dueDate;
      if (resolved.addToToday) addToToday = true;
      const safe = rawToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      working = working.replace(new RegExp(`(?:^|\\s)${safe}(?=\\s|$)`, 'i'), ' ');
      break;
    }
  }

  const title = working.replace(/\s+/g, ' ').trim();

  return {
    title,
    priority,
    labelNames,
    targetListName,
    dueDate,
    addToToday,
  };
}
