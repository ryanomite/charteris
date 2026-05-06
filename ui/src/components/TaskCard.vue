<script setup lang="ts">
import { computed } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import { useDragDrop, dragCard } from '../composables/useDragDrop';
import { useSelection } from '../composables/useSelection';
import { hoveredCardId } from '../composables/useHoveredList';
import { handleRecurringCompletion } from '../composables/useRecurrence';
import api from '../services/api';
import type { ICard } from '../types';

const props = defineProps<{ card: ICard; sectionSlug?: string }>();
const emit = defineEmits<{ (e: 'open', card: ICard): void }>();
const store = useTaskStore();
const { onDragStart, onDragEnd, onCardTouchStart } = useDragDrop();
const { isSelected, isFocused, selectCard } = useSelection();

const task = computed(() => store.taskById(props.card.taskId));
const isComplete = computed(() => task.value?.completed === true);
const isDragging = computed(() => dragCard.value?._id === props.card._id);

const priorityColor = computed(() => {
  if (isComplete.value) return 'transparent';
  const p = task.value?.priority;
  if (p == null) return 'transparent';
  const map: Record<number, string> = {
    1: 'var(--priority-1)',
    2: 'var(--priority-2)',
    3: 'var(--priority-3)',
    4: 'var(--priority-4)',
    5: 'var(--priority-5)',
  };
  return map[p] || 'transparent';
});

const isCommittedInPlanning = computed(() => {
  if (props.sectionSlug !== 'board') return false;
  const planning = store.sections.find(s => s.slug === 'planning');
  if (!planning) return false;
  const planningListIds = store.lists
    .filter(l => l.sectionId === planning._id && !l.archived)
    .map(l => l._id);
  return store.cards.some(c => c.taskId === props.card.taskId && planningListIds.includes(c.listId));
});

const dueStatus = computed(() => {
  const d = task.value?.dueDate;
  if (!d) return null;
  if (task.value?.completed) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Parse date string directly to local time (YYYY-MM-DD), avoiding UTC midnight offset
  const parts = d.split('-').map(Number);
  const dueDay = new Date(parts[0], parts[1] - 1, parts[2]);

  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'due-today';
  if (dueDay.getTime() === tomorrow.getTime()) return 'due-tomorrow';
  return 'due-future';
});

const dueFutureLabel = computed(() => {
  if (dueStatus.value !== 'due-future') return '';
  const d = task.value?.dueDate;
  if (!d) return '';
  const parts = d.split('-').map(Number);
  return `${parts[1]}/${parts[2]}`;
});

const taskLabels = computed(() => {
  if (!task.value?.labels?.length) return [];
  return task.value.labels
    .map(id => store.labelById(id))
    .filter(Boolean);
});

// Determine action button: left arrow for Cabinet, right arrow for non-orphaned Briefing
const actionArrow = computed(() => {
  if (!task.value) return null;
  if (props.sectionSlug === 'board') {
    // Cabinet: show left arrow to add to Today (if not already in a planning list)
    return 'left';
  }
  if (props.sectionSlug === 'planning') {
    // Briefing: show right arrow if task has a card in the Cabinet (non-orphaned)
    const boardSection = store.sections.find(s => s.slug === 'board');
    if (!boardSection) return null;
    const boardListIds = store.lists
      .filter(l => l.sectionId === boardSection._id && !l.archived)
      .map(l => l._id);
    const hasBoard = store.cards.some(c => c.taskId === props.card.taskId && boardListIds.includes(c.listId));
    return hasBoard ? 'right' : null;
  }
  return null;
});

function onMouseEnter() { hoveredCardId.value = props.card._id; }
function onMouseLeave() { if (hoveredCardId.value === props.card._id) hoveredCardId.value = null; }

function onClick(e: MouseEvent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    selectCard(props.card._id, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  } else {
    emit('open', props.card);
  }
}

async function toggleComplete(e: MouseEvent) {
  e.stopPropagation();
  if (!task.value) return;
  try {
    const { data } = await api.patch(`/tasks/${task.value._id}/complete`);
    store.upsertTask(data);
    // If recurring task was just completed, clone it
    if (data.completed && data.recurrence) {
      await handleRecurringCompletion(data._id);
    }
  } catch (err) {
    console.error('Toggle complete failed:', err);
  }
}

async function onActionClick(e: MouseEvent) {
  e.stopPropagation();
  if (!task.value) return;
  if (actionArrow.value === 'left') {
    // Add to Today
    const planningSection = store.sections.find(s => s.slug === 'planning');
    if (!planningSection) return;
    const todayList = store.listsForSection(planningSection._id).find(l => l.name === 'Today');
    if (!todayList) return;
    // Check if already in Today
    const alreadyInToday = store.cards.some(c => c.taskId === props.card.taskId && c.listId === todayList._id);
    if (alreadyInToday) return;
    try {
      const { data } = await api.post('/cards', { taskId: task.value._id, listId: todayList._id });
      store.upsertCard(data);
    } catch (err) {
      console.error('Add to Today failed:', err);
    }
  } else if (actionArrow.value === 'right') {
    // Remove from the Briefing list this card is in
    try {
      await api.delete(`/cards/${props.card._id}`);
      store.removeCard(props.card._id);
    } catch (err) {
      console.error('Remove from Briefing failed:', err);
    }
  }
}
</script>

<template>
  <div
    class="card"
    :class="{
      'card--complete': isComplete,
      'card--archived': task?.archived,
      'card--dragging': isDragging,
      'card--selected': isSelected(card._id),
      'card--focused': isFocused(card._id),
      'card--overdue': dueStatus === 'overdue',
      'card--due-today': dueStatus === 'due-today',
      'card--due-tomorrow': dueStatus === 'due-tomorrow',
      'card--board-committed': isCommittedInPlanning,
    }"
    :style="{ borderLeftColor: priorityColor }"
    v-if="task"
    draggable="true"
    @dragstart="onDragStart(card, $event)"
    @dragend="onDragEnd"
    @touchstart="onCardTouchStart(card, $event)"
    @click="onClick"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="card__hover-left">
      <button class="card__check" :title="isComplete ? 'Mark incomplete' : 'Mark complete'" @click="toggleComplete">
        <i :class="['fas', isComplete ? 'fa-check-circle' : 'fa-circle']"></i>
      </button>
    </div>
    <div class="card__body">
      <span class="card__title">{{ task.title }}</span>
      <div v-if="dueStatus || taskLabels.length" class="card__tags">
        <span v-if="dueStatus === 'due-future'" class="card__due card__due--future">
          <i class="fas fa-calendar-alt"></i>
          {{ dueFutureLabel }}
        </span>
        <span v-else-if="dueStatus" class="card__due" :class="`card__due--${dueStatus}`">
          <i class="fas fa-clock"></i>
          {{ dueStatus === 'overdue' ? 'Overdue' : dueStatus === 'due-today' ? 'Today' : 'Tomorrow' }}
        </span>
        <span v-for="label in taskLabels" :key="label!._id" class="card__label">
          <i class="fas fa-tag"></i>
          {{ label!.name }}
        </span>
      </div>
    </div>
    <div v-if="actionArrow" class="card__hover-right">
      <button
        class="card__action"
        :title="actionArrow === 'left' ? 'Add to Today' : 'Remove from Counter'"
        @click="onActionClick"
      >
        <i :class="['fas', actionArrow === 'left' ? 'fa-arrow-left' : 'fa-arrow-right']"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border-radius: var(--radius-card);
  border-left: 3px solid transparent;
  padding: 8px 10px;
  cursor: pointer;
  transition: background var(--transition-default);
  position: relative;
}

.card:hover {
  background: var(--bg-card-hover);
}

.card--complete {
  opacity: 0.75;
}

.card--archived {
  opacity: 0.4;
  filter: grayscale(0.5);
}

.card--complete .card__title {
  text-decoration: line-through;
  opacity: 0.5;
}

.card--dragging {
  opacity: 0.4;
}

.card--selected {
  outline: 2px solid #FFFFFF;
  outline-offset: -2px;
}

.card--focused {
  box-shadow: 0 0 0 1px var(--accent, #457B9D);
}

.card--board-committed {
  background: transparent;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
}

.card--board-committed:hover {
  background: rgba(255, 255, 255, 0.04);
}

.card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.card__due,
.card__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
}

.card__label {
  color: var(--color-label);
  background: rgba(0, 220, 220, 0.12);
}

.card__due--overdue {
  color: var(--priority-1);
  background: rgba(217, 4, 41, 0.15);
}

.card__due--due-today {
  color: var(--priority-2);
  background: rgba(247, 127, 0, 0.15);
}

.card__due--due-tomorrow {
  color: var(--priority-3);
  background: rgba(252, 191, 73, 0.15);
}

.card__due--future {
  color: #999;
  background: rgba(153, 153, 153, 0.15);
}

.card__body {
  flex: 1;
  min-width: 0;
}

.card__title {
  font-size: 0.8125rem;
  line-height: 1.3;
  word-break: break-word;
}

.card__hover-left,
.card__hover-right {
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity var(--transition-default);
}

.card:hover .card__hover-left,
.card:hover .card__hover-right,
.card--complete .card__hover-left {
  opacity: 1;
}

.card--complete .card__check i {
  color: var(--color-complete);
}

.card__hover-left {
  margin-right: 8px;
}

.card__hover-right {
  margin-left: 8px;
}

.card__check,
.card__action {
  color: var(--icon-ui);
  padding: 2px;
  border-radius: 4px;
  font-size: 0.8125rem;
  transition: color var(--transition-default);
}

.card__check:hover,
.card__action:hover {
  color: var(--text-primary);
}
</style>
