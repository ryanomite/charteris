import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  findAllSections, findSectionById, findSectionBySlug,
} from '../queries/sections';
import {
  findAllLists, findListById, insertList, maxListOrder,
} from '../queries/lists';
import {
  findAllTasks, findTaskById, insertTask, updateTask, deleteTask,
} from '../queries/tasks';
import {
  findAllCards, findCardById, insertCard, deleteCard, updateCard, closeGap, makeRoom,
} from '../queries/cards';
import {
  findAllLabels, insertLabel as createLabel,
} from '../queries/labels';

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'charteris',
    version: '1.0.0',
  });

  server.tool('get_dashboard', 'Get the full dashboard state', {}, async () => {
    const sections = findAllSections();
    const lists = findAllLists();
    const tasks = findAllTasks({ archived: false });
    const cards = findAllCards();
    const labels = findAllLabels();
    return { content: [{ type: 'text' as const, text: JSON.stringify({ sections, lists, tasks, cards, labels }, null, 2) }] };
  });

  server.tool('list_tasks', 'List tasks with optional filters', {
    completed: z.boolean().optional(),
    archived: z.boolean().optional(),
    label: z.string().optional(),
  }, async (args) => {
    const tasks = findAllTasks({
      completed: args.completed,
      archived: args.archived,
      label: args.label,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
  });

  server.tool('get_task', 'Get a task by ID', {
    taskId: z.string(),
  }, async (args) => {
    const task = findTaskById(args.taskId);
    if (!task) return { content: [{ type: 'text' as const, text: 'Task not found' }], isError: true };
    return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
  });

  server.tool('create_task', 'Create a new task', {
    title: z.string(),
    description: z.string().optional(),
    priority: z.number().min(1).max(5).optional(),
    labels: z.array(z.string()).optional(),
    dueDate: z.string().optional(),
    recurrence: z.string().optional(),
  }, async (args) => {
    const task = insertTask({
      title: args.title,
      description: args.description || '',
      priority: args.priority || null,
      labels: args.labels || [],
      dueDate: args.dueDate || null,
      recurrence: args.recurrence || '',
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
  });

  server.tool('update_task', 'Update a task', {
    taskId: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.number().min(1).max(5).optional(),
    labels: z.array(z.string()).optional(),
    dueDate: z.string().nullable().optional(),
    recurrence: z.string().optional(),
  }, async (args) => {
    const task = findTaskById(args.taskId);
    if (!task) return { content: [{ type: 'text' as const, text: 'Task not found' }], isError: true };
    const updated = updateTask(task._id, {
      title: args.title,
      description: args.description,
      priority: args.priority,
      labels: args.labels,
      dueDate: args.dueDate,
      recurrence: args.recurrence,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(updated, null, 2) }] };
  });

  server.tool('complete_task', 'Toggle task completion', {
    taskId: z.string(),
  }, async (args) => {
    const task = findTaskById(args.taskId);
    if (!task) return { content: [{ type: 'text' as const, text: 'Task not found' }], isError: true };
    const updated = updateTask(task._id, { completed: !task.completed });
    return { content: [{ type: 'text' as const, text: JSON.stringify(updated, null, 2) }] };
  });

  server.tool('archive_task', 'Toggle task archive status', {
    taskId: z.string(),
  }, async (args) => {
    const task = findTaskById(args.taskId);
    if (!task) return { content: [{ type: 'text' as const, text: 'Task not found' }], isError: true };
    const updated = updateTask(task._id, { archived: !task.archived });
    return { content: [{ type: 'text' as const, text: JSON.stringify(updated, null, 2) }] };
  });

  server.tool('delete_task', 'Delete a task and all its cards', {
    taskId: z.string(),
  }, async (args) => {
    const task = findTaskById(args.taskId);
    if (!task) return { content: [{ type: 'text' as const, text: 'Task not found' }], isError: true };
    deleteTask(task._id);
    return { content: [{ type: 'text' as const, text: `Task "${task.title}" and its cards deleted` }] };
  });

  server.tool('list_cards', 'List cards with optional filters', {
    listId: z.string().optional(),
    taskId: z.string().optional(),
  }, async (args) => {
    const cards = findAllCards({ listId: args.listId, taskId: args.taskId });
    return { content: [{ type: 'text' as const, text: JSON.stringify(cards, null, 2) }] };
  });

  server.tool('create_card', 'Create a card for a task in a list', {
    taskId: z.string(),
    listId: z.string(),
  }, async (args) => {
    const card = insertCard({ taskId: args.taskId, listId: args.listId });
    return { content: [{ type: 'text' as const, text: JSON.stringify(card, null, 2) }] };
  });

  server.tool('move_card', 'Move a card to a different list', {
    cardId: z.string(),
    targetListId: z.string(),
    order: z.number().optional(),
  }, async (args) => {
    const card = findCardById(args.cardId);
    if (!card) return { content: [{ type: 'text' as const, text: 'Card not found' }], isError: true };

    closeGap(card.listId, card.order);
    const newOrder = args.order ?? 0;
    makeRoom(args.targetListId, newOrder);

    const updated = updateCard(card._id, { listId: args.targetListId, order: newOrder });
    return { content: [{ type: 'text' as const, text: JSON.stringify(updated, null, 2) }] };
  });

  server.tool('delete_card', 'Delete a card', {
    cardId: z.string(),
  }, async (args) => {
    const card = findCardById(args.cardId);
    if (!card) return { content: [{ type: 'text' as const, text: 'Card not found' }], isError: true };
    deleteCard(card._id);
    return { content: [{ type: 'text' as const, text: 'Card deleted' }] };
  });

  server.tool('list_labels', 'List all labels', {
    q: z.string().optional(),
  }, async (args) => {
    const labels = findAllLabels(args.q);
    return { content: [{ type: 'text' as const, text: JSON.stringify(labels, null, 2) }] };
  });

  server.tool('create_label', 'Create a new label', {
    name: z.string(),
  }, async (args) => {
    const label = createLabel(args.name);
    return { content: [{ type: 'text' as const, text: JSON.stringify(label, null, 2) }] };
  });

  server.tool('list_lists', 'List all lists', {
    sectionId: z.string().optional(),
  }, async (args) => {
    const lists = findAllLists(args.sectionId ? { sectionId: args.sectionId } : undefined);
    return { content: [{ type: 'text' as const, text: JSON.stringify(lists, null, 2) }] };
  });

  // --- Convenience tools ---

  server.tool('get_today_tasks', 'Get all incomplete tasks in the Today list, with full task details', {}, async () => {
    const planning = findSectionBySlug('planning');
    if (!planning) return { content: [{ type: 'text' as const, text: '[]' }] };
    const todayList = findAllLists({ sectionId: planning._id })
      .find(l => l.name.toLowerCase() === 'today');
    if (!todayList) return { content: [{ type: 'text' as const, text: '[]' }] };
    const cards = findAllCards({ listId: todayList._id });
    const tasks = cards
      .map(c => findTaskById(c.taskId))
      .filter((t): t is NonNullable<ReturnType<typeof findTaskById>> => Boolean(t))
      .filter(t => !t.completed && !t.archived);
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
  });

  server.tool('get_tasks_in_list', 'Get all tasks in a list by list name (case-insensitive), with full task details', {
    listName: z.string(),
    includeCompleted: z.boolean().optional(),
  }, async (args) => {
    const allLists = findAllLists();
    const list = allLists.find(l => l.name.toLowerCase() === args.listName.toLowerCase());
    if (!list) return { content: [{ type: 'text' as const, text: `List "${args.listName}" not found` }], isError: true };
    const cards = findAllCards({ listId: list._id });
    const tasks = cards
      .map(c => findTaskById(c.taskId))
      .filter((t): t is NonNullable<ReturnType<typeof findTaskById>> => Boolean(t))
      .filter(t => args.includeCompleted ? true : !t.completed)
      .filter(t => !t.archived);
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
  });

  server.tool('add_task_to_list', 'Create a task and add it to a list by name (creates Cabinet list if not found). Returns the created task.', {
    title: z.string(),
    listName: z.string(),
    description: z.string().optional(),
    priority: z.number().min(1).max(5).optional(),
    dueDate: z.string().optional(),
    addToToday: z.boolean().optional().describe('Also add a card in the Today list'),
  }, async (args) => {
    const allLists = findAllLists();
    let list = allLists.find(l => l.name.toLowerCase() === args.listName.toLowerCase());
    if (!list) {
      const board = findSectionBySlug('board');
      if (!board) return { content: [{ type: 'text' as const, text: 'Board section not found' }], isError: true };
      const order = maxListOrder(board._id) + 1;
      list = insertList({ name: args.listName, sectionId: board._id, order, isFixed: false });
    }
    const task = insertTask({
      title: args.title,
      description: args.description || '',
      priority: args.priority || null,
      labels: [],
      dueDate: args.dueDate || null,
      recurrence: '',
    });
    insertCard({ taskId: task._id, listId: list._id });
    if (args.addToToday) {
      const planning = findSectionBySlug('planning');
      if (planning) {
        const todayList = findAllLists({ sectionId: planning._id })
          .find(l => l.name.toLowerCase() === 'today');
        if (todayList) insertCard({ taskId: task._id, listId: todayList._id });
      }
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }] };
  });

  server.tool('create_list', 'Create a new list in the Board section', {
    name: z.string(),
    sectionId: z.string(),
  }, async (args) => {
    const section = findSectionById(args.sectionId);
    if (!section || section.slug !== 'board') {
      return { content: [{ type: 'text' as const, text: 'Lists can only be created in the Board section' }], isError: true };
    }
    const order = maxListOrder(args.sectionId) + 1;
    const list = insertList({ name: args.name, sectionId: args.sectionId, order, isFixed: false });
    return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
  });

  return server;
}
