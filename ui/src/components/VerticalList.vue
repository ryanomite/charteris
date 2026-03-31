<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import { useDragDrop, dragCard, dragList } from '../composables/useDragDrop';
import { hoveredListId } from '../composables/useHoveredList';
import api from '../services/api';
import TaskCard from './TaskCard.vue';
import type { IList, ISection, ICard } from '../types';

const props = defineProps<{ list: IList; section: ISection }>();
const emit = defineEmits<{ (e: 'openCard', card: ICard): void }>();
const store = useTaskStore();
const { canDrop, onDrop, onListDragStart, onListDragEnd, onListDrop } = useDragDrop();

const cards = computed(() => store.cardsForList(props.list._id));

const dropIndex = ref(-1);
const isOver = ref(false);
const adding = ref(false);
const newTitle = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const menuOpen = ref(false);
const renaming = ref(false);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

// List drag-reorder state
const isListDragOver = ref(false);
const listDropBefore = ref(true);

const droppable = computed(() => canDrop(props.list._id, props.section.slug));
const isSameListDrag = computed(() => dragCard.value?.listId === props.list._id);

function onDragOver(e: DragEvent) {
  if (!droppable.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  isOver.value = true;

  if (isSameListDrag.value) {
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
    const { data: task } = await api.post('/tasks', { title: t });
    store.upsertTask(task);
    const { data: card } = await api.post('/cards', { taskId: task._id, listId: props.list._id });
    store.upsertCard(card);
    newTitle.value = '';
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

// --- List context menu ---

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

function startRename() {
  closeMenu();
  renameValue.value = props.list.name;
  renaming.value = true;
  nextTick(() => renameInputRef.value?.focus());
}

function cancelRename() {
  renaming.value = false;
}

async function submitRename() {
  const name = renameValue.value.trim();
  renaming.value = false;
  if (!name || name === props.list.name) return;
  try {
    const { data } = await api.put(`/lists/${props.list._id}`, { name });
    store.upsertList(data);
  } catch (err) {
    console.error('Rename list failed:', err);
  }
}

async function archiveAllTasks() {
  closeMenu();
  if (!confirm(`Archive all tasks in "${props.list.name}"?`)) return;
  const BATCH = 5;
  const listCards = [...cards.value];
  for (let i = 0; i < listCards.length; i += BATCH) {
    const batch = listCards.slice(i, i + BATCH);
    await Promise.all(batch.map(async card => {
      const { data } = await api.patch(`/tasks/${card.taskId}/archive`);
      store.upsertTask(data);
    }));
  }
}

async function archiveList() {
  closeMenu();
  if (!confirm(`Archive "${props.list.name}" and all its tasks?`)) return;
  try {
    const { data } = await api.patch(`/lists/${props.list._id}/archive`);
    store.removeList(data._id);
  } catch (err) {
    console.error('Archive list failed:', err);
  }
}

// --- List header drag-to-reorder ---

function onListHeaderDragStart(e: DragEvent) {
  if (dragCard.value) { e.preventDefault(); return; } // card drag takes priority
  if (props.list.isFixed) { e.preventDefault(); return; }
  onListDragStart(props.list, e);
}

function onListHeaderDragEnd() {
  onListDragEnd();
  isListDragOver.value = false;
}

function onListDragOverSelf(e: DragEvent) {
  if (!dragList.value || dragList.value._id === props.list._id) return;
  if (dragList.value.sectionId !== props.list.sectionId) return;
  e.preventDefault();
  e.stopPropagation();
  isListDragOver.value = true;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  listDropBefore.value = e.clientX < rect.left + rect.width / 2;
}

function onListDragLeaveSelf(e: DragEvent) {
  // Only clear if we're leaving the list element itself (not entering a child)
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
    isListDragOver.value = false;
  }
}

async function onListDropSelf(e: DragEvent) {
  if (!dragList.value || dragList.value._id === props.list._id) return;
  e.preventDefault();
  e.stopPropagation();
  isListDragOver.value = false;
  await onListDrop(props.list, listDropBefore.value);
}
</script>

<template>
  <div
    class="list"
    :class="{
      'list--drag-over': isOver && droppable,
      'list--dragging': dragList?._id === list._id,
      'list--list-drop-before': isListDragOver && listDropBefore,
      'list--list-drop-after': isListDragOver && !listDropBefore,
    }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @dragover="onListDragOverSelf"
    @dragleave="onListDragLeaveSelf"
    @drop="onListDropSelf"
  >
    <div
      class="list__header"
      :draggable="!dragCard.value && !list.isFixed"
      @dragstart="onListHeaderDragStart"
      @dragend="onListHeaderDragEnd"
    >
      <input
        v-if="renaming"
        ref="renameInputRef"
        v-model="renameValue"
        class="list__rename-input"
        @keydown.enter.prevent="submitRename"
        @keydown.escape="cancelRename"
        @blur="submitRename"
      />
      <span
        v-else
        class="list__title"
        :class="{ 'list__title--editable': !list.isFixed }"
        @click.stop="!list.isFixed && startRename()"
      >{{ list.name }}</span>
      <div class="list__menu-wrap" @keydown.escape="closeMenu">
        <button
          class="list__menu"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
          title="List menu"
          @click="toggleMenu"
        >
          <i class="fas fa-ellipsis-h"></i>
        </button>
        <ul v-if="menuOpen" class="dropdown" role="menu" @click.stop>
          <li v-if="!list.isFixed" role="none">
            <button role="menuitem" class="dropdown__item" @click="startRename">
              <i class="fas fa-pencil-alt"></i>
              Edit name
            </button>
          </li>
          <li role="none">
            <button role="menuitem" class="dropdown__item" @click="archiveAllTasks">
              <i class="fas fa-archive"></i>
              Archive all tasks
            </button>
          </li>
          <li v-if="!list.isFixed" role="none">
            <button role="menuitem" class="dropdown__item dropdown__item--danger" @click="archiveList">
              <i class="fas fa-times-circle"></i>
              Archive list
            </button>
          </li>
        </ul>
        <div v-if="menuOpen" class="dropdown__backdrop" @click="closeMenu"></div>
      </div>
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
  overflow: visible;
  box-shadow: 0 4px 13px #0006, 0 0 40px #0003;
}

.list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.list__title {
  font-weight: 600;
  font-size: 0.875rem;
  flex: 1;
  min-width: 0;
}

.list__title--editable {
  cursor: text;
}

.list__rename-input {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--accent, #457B9D);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
  font-family: inherit;
}

.list__menu-wrap {
  position: relative;
  flex-shrink: 0;
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

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 190px;
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 4px;
  list-style: none;
  z-index: 200;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.dropdown__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.875rem;
  color: var(--text-primary);
  text-align: left;
  transition: background var(--transition-default);
}

.dropdown__item:hover,
.dropdown__item:focus {
  background: rgba(255, 255, 255, 0.08);
  outline: none;
}

.dropdown__item i {
  width: 16px;
  text-align: center;
  color: var(--icon-ui);
}

.dropdown__item--danger {
  color: #ff6b6b;
}

.dropdown__item--danger i {
  color: #ff6b6b;
}

.dropdown__backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}

.list__cards {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 48px;
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

.list--dragging {
  opacity: 0.4;
  pointer-events: none;
}

.list--list-drop-before {
  box-shadow: -4px 0 0 0 var(--accent, #457B9D), 0 4px 13px #0006, 0 0 40px #0003;
}

.list--list-drop-after {
  box-shadow: 4px 0 0 0 var(--accent, #457B9D), 0 4px 13px #0006, 0 0 40px #0003;
}

.drop-indicator {
  height: 3px;
  background: var(--accent, #457B9D);
  border-radius: 2px;
  flex-shrink: 0;
}
</style>
