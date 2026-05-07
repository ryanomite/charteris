export interface ParsedTaskMacros {
  title: string;
  priority: 1 | 2 | 3 | 4 | 5 | null;
  labelNames: string[];
  targetListName: string | null;
  addToToday: boolean;
  addToNext: boolean;
}

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function parseTaskMacros(rawInput: string): ParsedTaskMacros {
  let working = rawInput;
  let priority: 1 | 2 | 3 | 4 | 5 | null = null;
  const labelNames: string[] = [];
  let targetListName: string | null = null;
  let addToToday = false;
  let addToNext = false;

  // Today marker: standalone !, plus leading/trailing forms like "!Buy milk" and "Buy milk!".
  working = working.replace(/^\s*!+/, () => {
    addToToday = true;
    return ' ';
  });
  working = working.replace(/!+\s*$/, () => {
    addToToday = true;
    return ' ';
  });
  working = working.replace(/(^|\s)!+(?=\s|$)/g, (_m, p1: string) => {
    addToToday = true;
    return p1 || ' ';
  });

  // Next marker: standalone >, plus leading/trailing forms like ">Buy milk" and "Buy milk>".
  working = working.replace(/^\s*>+/, () => {
    addToNext = true;
    return ' ';
  });
  working = working.replace(/>+\s*$/, () => {
    addToNext = true;
    return ' ';
  });
  working = working.replace(/(^|\s)>+(?=\s|$)/g, (_m, p1: string) => {
    addToNext = true;
    return p1 || ' ';
  });

  // Priorities p1..p5
  working = working.replace(/(?:^|\s)p([1-5])(?=\s|$)/gi, (_m, digit: string) => {
    priority = Number(digit) as 1 | 2 | 3 | 4 | 5;
    return ' ';
  });

  // Labels @foo
  working = working.replace(/(?:^|\s)@([^\s#@!>]+)/g, (_m, name: string) => {
    labelNames.push(name);
    return ' ';
  });

  // List macro #foo
  working = working.replace(/(?:^|\s)#([^\s#@!>]+)/g, (_m, name: string) => {
    targetListName = name;
    return ' ';
  });

  const title = working.replace(/\s+/g, ' ').trim();

  return {
    title,
    priority,
    labelNames,
    targetListName,
    addToToday,
    addToNext,
  };
}
