<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import { useDragDrop, dragCard } from '../composables/useDragDrop';
import { hoveredListId } from '../composables/useHoveredList';
import api from '../services/api';
import TaskCard from './TaskCard.vue';
import type { IList, ISection, ICard } from '../types';

const props = defineProps<{ list: IList; section: ISection }>();
const emit = defineEmits<{ (e: 'openCard', card: ICard): void }>();
const store = useTaskStore();
const { canDrop, onDrop } = useDragDrop();

const cards = computed(() => store.cardsForList(props.list._id));

const dropIndex = ref(-1);
const isOver = ref(false);
const adding = ref(false);
const newTitle = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const droppable = computed(() => canDrop(props.list._id, props.section.slug));
const isSameListDrag = computed(() => dragCard.value?.listId === props.list._id);

function onDragOver(e: DragEvent) {
  if (!droppable.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  isOver.value = true;

  if (isSameListDrag.value) {
    // Same-list reorder: show precise drop indicator
    const container = (e.currentTarget as HTMLElement);
    const cardElements = Array.from(container.querySelectorAll('.card'));
    let idx = cardElements.length;
    for (let i = 0; i < cardElements.length; i++) {
      const rect = cardElements[i].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        idx = i;
        break;
      }
    }
    dropIndex.value = idx;
  } else {
    // Cross-list: just highlight the list, drop to bottom
    dropIndex.value = -1;
  }
}

function onDragLeave() {
  isOver.value = false;
  dropIndex.value = -1;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  if (!droppable.value) return;
  const idx = isSameListDrag.value && dropIndex.value >= 0 ? dropIndex.value : cards.value.length;
  onDrop(props.list._id, idx);
  isOver.value = false;
  dropIndex.value = -1;
}

function startAdding() {
  adding.value = true;
  newTitle.value = '';
  nextTick(() => inputRef.value?.focus());
}

function cancelAdding() {
  adding.value = false;
  newTitle.value = '';
}

async function submitNewCard() {
  const t = newTitle.value.trim();
  if (!t) {
    cancelAdding();
    return;
  }
  try {
    // Create the task first
    const { data: task } = await api.post('/tasks', { title: t });
    store.upsertTask(task);
    // Create a card for it in this list
    const { data: card } = await api.post('/cards', { taskId: task._id, listId: props.list._id });
    store.upsertCard(card);
    newTitle.value = '';
    // Keep input open for rapid entry
    nextTick(() => inputRef.value?.focus());
  } catch (err) {
    console.error('Create card failed:', err);
  }
}

function onMouseEnter() {
  hoveredListId.value = props.list._id;
}

function onMouseLeave() {
  if (hoveredListId.value === props.list._id) {
    hoveredListId.value = null;
  }
}

function handleQuickAdd() {
  if (hoveredListId.value === props.list._id || (!hoveredListId.value && props.list.name === 'Draft')) {
    startAdding();
  }
}

onMounted(() => {
  window.addEventListener('charteris:quick-add', handleQuickAdd);
});

onUnmounted(() => {
  window.removeEventListener('charteris:quick-add', handleQuickAdd);
});
</script>

<template>
  <div class="list" :class="{ 'list--drag-over': isOver && droppable }" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <div class="list__header">
      <span class="list__title">{{ list.name }}</span>
      <button class="list__menu" title="List menu">
        <i class="fas fa-ellipsis-h"></i>
      </button>
    </div>
    <div
      class="list__cards"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="handleDrop"
    >
      <template v-for="(card, i) in cards" :key="card._id">
        <div v-if="isSameListDrag && dropIndex === i && dragCard?._id !== card._id" class="drop-indicator"></div>
        <TaskCard :card="card" @open="(c: ICard) => emit('openCard', c)" />
      </template>
      <div v-if="isSameListDrag && dropIndex === cards.length" class="drop-indicator"></div>
    </div>
    <div v-if="adding" class="list__add-form">
      <input
        ref="inputRef"
        v-model="newTitle"
        class="list__add-input"
        placeholder="Card title..."
        @keydown.enter.prevent="submitNewCard"
        @keydown.escape="cancelAdding"
        @blur="submitNewCard"
      />
    </div>
    <button v-else class="list__add" @click="startAdding">
      <i class="fas fa-plus"></i>
      <span>Add a card</span>
    </button>
  </div>
</template>

<style scoped>
.list {
  width: 280px;
  min-width: 280px;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-list);
  border-radius: var(--radius-list);
  overflow: hidden;
}

.list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  flex-shrink: 0;
}

.list__title {
  font-weight: 600;
  font-size: 0.875rem;
}

.list__menu {
  color: var(--icon-ui);
  padding: 4px 6px;
  border-radius: 4px;
  transition: background var(--transition-default);
}

.list__menu:hover {
  background: rgba(255, 255, 255, 0.1);
}

.list__cards {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

.list__add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  border-radius: 0 0 var(--radius-list) var(--radius-list);
  transition: background var(--transition-default), color var(--transition-default);
  flex-shrink: 0;
}

.list__add:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.list__add i {
  font-size: 0.75rem;
}

.list__add-form {
  padding: 6px 8px;
  flex-shrink: 0;
}

.list__add-input {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--accent, #457B9D);
  border-radius: var(--radius-card);
  padding: 8px 10px;
  font-size: 0.8125rem;
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
}

.list--drag-over {
  outline: 2px dashed var(--accent, #457B9D);
  outline-offset: -2px;
}

.drop-indicator {
  height: 3px;
  background: var(--accent, #457B9D);
  border-radius: 2px;
  flex-shrink: 0;
}
</style>
