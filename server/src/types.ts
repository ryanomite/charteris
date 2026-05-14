// Type definitions for domain objects — matches the API response shapes

export interface Section {
  _id: string;
  name: string;
  slug: string;
  icon: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface List {
  _id: string;
  name: string;
  sectionId: string;
  order: number;
  isFixed: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  _id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  _id: string;
  title: string;
  description: string;
  priority: number | null;
  labels: string[];
  dueDate: string | null;
  recurrence: string;
  completed: boolean;
  archived: boolean;
  master: boolean;
  parentId: string | null;
  subtasks: Subtask[];
  committedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskEventType =
  | 'task_committed'
  | 'task_uncommitted'
  | 'task_completed'
  | 'task_uncompleted'
  | 'task_deleted';

export interface TaskEvent {
  _id: string;
  taskId: string;
  eventType: TaskEventType;
  occurredAt: string;
  taskTitle: string;
  taskPriority: number | null;
  taskDueDate: string | null;
  cabinetListId: string | null;
  cabinetListName: string | null;
  taskCompleted: boolean;
  taskArchived: boolean;
}

export interface Card {
  _id: string;
  taskId: string;
  listId: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  _id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalSettings {
  hideCommittedCards: boolean;
  castingRulesToday: string;
  castingRulesNext: string;
  cssOverrides: string;
}
