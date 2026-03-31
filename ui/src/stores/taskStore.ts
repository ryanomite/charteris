import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';
import type { ISection, IList, ITask, ICard, ILabel } from '../types';

export const useTaskStore = defineStore('tasks', () => {
  const sections = ref<ISection[]>([]);
  const lists = ref<IList[]>([]);
  const tasks = ref<ITask[]>([]);
  const cards = ref<ICard[]>([]);
  const labels = ref<ILabel[]>([]);
  const loading = ref(false);

  // Fetch full dashboard state
  async function fetchDashboard() {
    loading.value = true;
    try {
      const { data } = await api.get('/dashboard');
      sections.value = data.sections;
      lists.value = data.lists;
      tasks.value = data.tasks;
      cards.value = data.cards;
      labels.value = data.labels;
    } finally {
      loading.value = false;
    }
  }

  // Computed: sections in display order
  const sortedSections = computed(() =>
    [...sections.value].sort((a, b) => a.order - b.order)
  );

  // Get lists for a section, sorted by order (excluding archived)
  function listsForSection(sectionId: string): IList[] {
    return lists.value
      .filter(l => l.sectionId === sectionId && !l.archived)
      .sort((a, b) => a.order - b.order);
  }

  // Get cards for a list, sorted by: incomplete first → priority (null last) → completed last → order
  function cardsForList(listId: string): ICard[] {
    return cards.value
      .filter(c => {
        if (c.listId !== listId) return false;
        const task = tasks.value.find(t => t._id === c.taskId);
        return task && !task.archived;
      })
      .sort((a, b) => {
        const taskA = tasks.value.find(t => t._id === a.taskId);
        const taskB = tasks.value.find(t => t._id === b.taskId);
        // Completed cards go to the bottom
        const compA = taskA?.completed ? 1 : 0;
        const compB = taskB?.completed ? 1 : 0;
        if (compA !== compB) return compA - compB;
        // Then by priority (null = lowest)
        const pA = taskA?.priority ?? 99;
        const pB = taskB?.priority ?? 99;
        if (pA !== pB) return pA - pB;
        return a.order - b.order;
      });
  }

  // Get task by ID
  function taskById(taskId: string): ITask | undefined {
    return tasks.value.find(t => t._id === taskId);
  }

  // Get label by ID
  function labelById(labelId: string): ILabel | undefined {
    return labels.value.find(l => l._id === labelId);
  }

  // Get all labels for a task
  function labelsForTask(taskId: string): ILabel[] {
    const task = taskById(taskId);
    if (!task?.labels?.length) return [];
    return task.labels.map(id => labelById(id)).filter(Boolean) as ILabel[];
  }

  // --- Mutations for WebSocket / local updates ---

  function upsertTask(task: ITask) {
    const idx = tasks.value.findIndex(t => t._id === task._id);
    if (idx >= 0) tasks.value[idx] = task;
    else tasks.value.push(task);
  }

  function removeTask(taskId: string) {
    tasks.value = tasks.value.filter(t => t._id !== taskId);
    cards.value = cards.value.filter(c => c.taskId !== taskId);
  }

  function upsertCard(card: ICard) {
    const idx = cards.value.findIndex(c => c._id === card._id);
    if (idx >= 0) cards.value[idx] = card;
    else cards.value.push(card);
  }

  function removeCard(cardId: string) {
    cards.value = cards.value.filter(c => c._id !== cardId);
  }

  function upsertList(list: IList) {
    const idx = lists.value.findIndex(l => l._id === list._id);
    if (idx >= 0) lists.value[idx] = list;
    else lists.value.push(list);
  }

  function removeList(listId: string) {
    lists.value = lists.value.filter(l => l._id !== listId);
    cards.value = cards.value.filter(c => c.listId !== listId);
  }

  function upsertLabel(label: ILabel) {
    const idx = labels.value.findIndex(l => l._id === label._id);
    if (idx >= 0) labels.value[idx] = label;
    else labels.value.push(label);
  }

  function removeLabel(labelId: string) {
    labels.value = labels.value.filter(l => l._id !== labelId);
  }

  return {
    sections, lists, tasks, cards, labels, loading,
    sortedSections, fetchDashboard,
    listsForSection, cardsForList, taskById, labelById, labelsForTask,
    upsertTask, removeTask,
    upsertCard, removeCard,
    upsertList, removeList,
    upsertLabel, removeLabel,
  };
});
