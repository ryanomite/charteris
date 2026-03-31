<script setup lang="ts">
import { computed } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import { useDragDrop, dragCard } from '../composables/useDragDrop';
import { useSelection } from '../composables/useSelection';
import api from '../services/api';
import type { ICard } from '../types';

const props = defineProps<{ card: ICard }>();
const emit = defineEmits<{ (e: 'open', card: ICard): void }>();
const store = useTaskStore();
const { onDragStart, onDragEnd } = useDragDrop();
const { isSelected, isFocused, selectCard } = useSelection();

const task = computed(() => store.taskById(props.card.taskId));

const priorityColor = computed(() => {
  const p = task.value?.priority;
  if (p == null) return 'transparent';
  const map: Record<number, string> = {
    1: 'var(--priority-1)',
    2: 'var(--priority-2)',
    3: 'var(--priority-3)',
    4: 'var(--priority-4)',
  };
  return map[p] || 'transparent';
});

const isComplete = computed(() => task.value?.completed === true);
const isDragging = computed(() => dragCard.value?._id === props.card._id);

const dueStatus = computed(() => {
  const d = task.value?.dueDate;
  if (!d) return null;
  const due = new Date(d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());

  if (dueDay < today) return 'overdue';
  if (dueDay.getTime() === today.getTime()) return 'due-today';
  if (dueDay.getTime() === tomorrow.getTime()) return 'due-tomorrow';
  return null;
});

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
  } catch (err) {
    console.error('Toggle complete failed:', err);
  }
}
</script>

<template>
  <div
    class="card"
    :class="{
      'card--complete': isComplete,
      'card--dragging': isDragging,
      'card--selected': isSelected(card._id),
      'card--focused': isFocused(card._id),
      'card--overdue': dueStatus === 'overdue',
      'card--due-today': dueStatus === 'due-today',
      'card--due-tomorrow': dueStatus === 'due-tomorrow',
    }"
    :style="{ borderLeftColor: priorityColor }"
    v-if="task"
    draggable="true"
    @dragstart="onDragStart(card, $event)"
    @dragend="onDragEnd"
    @click="onClick"
  >
    <div class="card__hover-left">
      <button class="card__check" :title="isComplete ? 'Mark incomplete' : 'Mark complete'" @click="toggleComplete">
        <i :class="['fas', isComplete ? 'fa-check-circle' : 'fa-circle']"></i>
      </button>
    </div>
    <div class="card__body">
      <span class="card__title">{{ task.title }}</span>
      <span v-if="dueStatus" class="card__due" :class="`card__due--${dueStatus}`">
        <i class="fas fa-clock"></i>
        {{ dueStatus === 'overdue' ? 'Overdue' : dueStatus === 'due-today' ? 'Today' : 'Tomorrow' }}
      </span>
    </div>
    <div class="card__hover-right">
      <button class="card__action" title="Move card">
        <i class="fas fa-arrows-alt"></i>
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

.card__due {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  margin-top: 4px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
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
.card:hover .card__hover-right {
  opacity: 1;
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
