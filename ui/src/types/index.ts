export interface ISection {
  _id: string;
  name: string;
  slug: 'inbox' | 'planning' | 'board';
  icon: string;
  order: number;
}

export interface IList {
  _id: string;
  name: string;
  sectionId: string;
  order: number;
  isFixed: boolean;
  archived: boolean;
}

export interface ISubtask {
  title: string;
  completed: boolean;
}

export interface ITask {
  _id: string;
  title: string;
  description: string;
  priority: 1 | 2 | 3 | 4 | 5 | null;
  labels: string[];
  dueDate: string | null;
  recurrence: string;
  completed: boolean;
  archived: boolean;
  master: boolean;
  parentId: string | null;
  subtasks: ISubtask[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ICard {
  _id: string;
  taskId: string;
  listId: string;
  order: number;
}

export interface ILabel {
  _id: string;
  name: string;
}

export interface IDashboard {
  sections: ISection[];
  lists: IList[];
  tasks: ITask[];
  cards: ICard[];
  labels: ILabel[];
}

export interface WSMessage {
  event: string;
  data: any;
}
