import { Router, Request, Response } from 'express';
import { findSectionBySlug } from '../queries/sections';
import { findAllLists, findListByName, insertList, maxListOrder } from '../queries/lists';
import { insertTask } from '../queries/tasks';
import { insertCard, maxCardOrder } from '../queries/cards';
import { findLabelByName, insertLabel } from '../queries/labels';

const router = Router();

interface TrelloLabel { id: string; name: string; color: string; }
interface TrelloCheckItem { name: string; state: 'complete' | 'incomplete'; }
interface TrelloChecklist { id: string; name: string; checkItems: TrelloCheckItem[]; }
interface TrelloList { id: string; name: string; closed: boolean; }
interface TrelloCard { id: string; name: string; desc: string; due: string | null; closed: boolean; idList: string; labels: TrelloLabel[]; idChecklists: string[]; }
interface TrelloExport { name: string; lists: TrelloList[]; cards: TrelloCard[]; labels: TrelloLabel[]; checklists: TrelloChecklist[]; }

router.post('/trello', (req: Request, res: Response) => {
  const trello: TrelloExport = req.body;

  if (!trello.cards || !trello.lists) {
    res.status(400).json({ error: 'Invalid Trello export: missing cards or lists' });
    return;
  }

  const boardSection = findSectionBySlug('board');
  if (!boardSection) {
    res.status(500).json({ error: 'Board section not found' });
    return;
  }

  const inboxSection = findSectionBySlug('inbox');
  const draftList = inboxSection
    ? findAllLists({ sectionId: inboxSection._id }).find(l => l.name === 'Draft') || null
    : null;

  const stats = { lists: 0, tasks: 0, cards: 0, labels: 0, skippedArchived: 0 };

  // 1. Import labels
  const labelMap = new Map<string, string>();
  for (const tLabel of trello.labels) {
    if (!tLabel.name) continue;
    let existing = findLabelByName(tLabel.name);
    if (!existing) {
      existing = insertLabel(tLabel.name);
      stats.labels++;
    }
    labelMap.set(tLabel.id, existing._id);
  }

  // 2. Checklist map
  const checklistMap = new Map<string, TrelloChecklist>();
  for (const cl of (trello.checklists || [])) {
    checklistMap.set(cl.id, cl);
  }

  // 3. Import lists
  const trelloListMap = new Map<string, string>();
  const openLists = trello.lists.filter(l => !l.closed);
  let listOrder = maxListOrder(boardSection._id) + 1;
  const fixedListNames = ['draft', 'today', 'next'];

  for (const tList of openLists) {
    const lowerName = tList.name.toLowerCase();

    if (fixedListNames.includes(lowerName)) {
      const fixedList = findListByName(tList.name);
      if (fixedList) {
        trelloListMap.set(tList.id, fixedList._id);
        continue;
      }
    }

    const newList = insertList({
      name: tList.name,
      sectionId: boardSection._id,
      order: listOrder++,
      isFixed: false,
    });
    trelloListMap.set(tList.id, newList._id);
    stats.lists++;
  }

  // 4. Import cards
  for (const tCard of trello.cards) {
    if (tCard.closed) {
      stats.skippedArchived++;
      continue;
    }

    let targetListId = trelloListMap.get(tCard.idList);
    if (!targetListId && draftList) {
      targetListId = draftList._id;
    }
    if (!targetListId) continue;

    const cardLabelIds = (tCard.labels || [])
      .map(l => labelMap.get(l.id))
      .filter((id): id is string => !!id);

    const subtasks: { title: string; completed: boolean }[] = [];
    for (const clId of (tCard.idChecklists || [])) {
      const cl = checklistMap.get(clId);
      if (!cl) continue;
      for (const item of cl.checkItems) {
        subtasks.push({ title: item.name, completed: item.state === 'complete' });
      }
    }

    const task = insertTask({
      title: tCard.name,
      description: tCard.desc || '',
      priority: null,
      labels: cardLabelIds,
      dueDate: tCard.due ? new Date(tCard.due).toISOString() : null,
      recurrence: '',
      completed: false,
      archived: false,
      master: false,
      parentId: null,
      subtasks,
    });
    stats.tasks++;

    const cardOrder = maxCardOrder(targetListId) + 1;
    insertCard({ taskId: task._id, listId: targetListId, order: cardOrder });
    stats.cards++;
  }

  res.json({
    message: `Imported from Trello board "${trello.name}"`,
    stats,
  });
});

export default router;
