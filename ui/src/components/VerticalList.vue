<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, inject } from 'vue';
import type { Ref } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import { useDragDrop, dragCard } from '../composables/useDragDrop';
import { hoveredListId } from '../composables/useHoveredList';
import { parseTaskMacros } from '../utils/taskMacros';
import { resolveLabelIds, findTodayList, findNextList, ensureCabinetList, addCardIfMissing } from '../utils/taskHelpers';
import { toClassSlug } from '../utils/classNames';
import api from '../services/api';
import TaskCard from './TaskCard.vue';
import type { IList, ISection, ICard } from '../types';

const props = defineProps<{ list: IList; section: ISection }>();
const emit = defineEmits<{
  (e: 'openCard', card: ICard): void;
  (e: 'openImport', payload?: { listId?: string }): void;
}>();
const store = useTaskStore();
const { canDrop, onDrop } = useDragDrop();

const cards = computed(() => store.cardsForList(props.list._id));
const filterQuery = inject<Ref<string>>('filterQuery', ref(''));

const filteredCards = computed(() => {
  const q = filterQuery.value?.trim() ?? '';
  if (q.length < 2) return cards.value;

  const tokens = q.split(/\s+/).filter(Boolean);
  const labelNames: string[] = [];
  const dateTokens: string[] = [];
  const titleTokens: string[] = [];
  // priority filter: null = no filter, otherwise [min, max] inclusive
  let priorityRange: [number, number] | null = null;

  for (const token of tokens) {
    if (token.startsWith('@')) {
      labelNames.push(token.slice(1).toLowerCase());
    } else if (['today', 'overdue', 'tomorrow'].includes(token.toLowerCase())) {
      dateTokens.push(token.toLowerCase());
    } else if (/^p[1-5](-p?[1-5])?$/i.test(token)) {
      const parts = token.toLowerCase().replace(/p/g, '').split('-');
      const lo = parseInt(parts[0]);
      const hi = parts[1] !== undefined ? parseInt(parts[1]) : lo;
      priorityRange = [Math.min(lo, hi), Math.max(lo, hi)];
    } else {
      titleTokens.push(token.toLowerCase());
    }
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  return cards.value.filter(card => {
    const task = store.tasks.find(t => t._id === card.taskId);
    if (!task) return false;

    if (titleTokens.length && !titleTokens.every(t => task.title.toLowerCase().includes(t))) return false;

    for (const name of labelNames) {
      const label = store.labels.find(l => l.name.toLowerCase() === name);
      if (!label || !task.labels.includes(label._id)) return false;
    }

    for (const dt of dateTokens) {
      if (dt === 'today' && task.dueDate !== todayStr) return false;
      if (dt === 'tomorrow' && task.dueDate !== tomorrowStr) return false;
      if (dt === 'overdue' && (!task.dueDate || task.dueDate >= todayStr)) return false;
    }

    if (priorityRange) {
      const p = task.priority;
      if (p === null || p < priorityRange[0] || p > priorityRange[1]) return false;
    }

    return true;
  });
});
const activeCardCount = computed(() => store.activeCardCountForList(props.list._id));
const listSemanticClass = computed(() => `list-${toClassSlug(props.list.name)}`);

const dropIndex = ref(-1);
const isOver = ref(false);
const adding = ref(false);
const newTitle = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const lastCreatedCardId = ref<string | null>(null);

const menuOpen = ref(false);
const renaming = ref(false);
const renameValue = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

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

function editLastCreated() {
  if (!lastCreatedCardId.value) return;
  const card = store.cards.find(c => c._id === lastCreatedCardId.value);
  if (card) {
    // Set adding to false first to prevent blur from triggering submitNewCard
    adding.value = false;
    newTitle.value = '';
    emit('openCard', card);
  }
}

async function submitNewCard() {
  const rawInput = newTitle.value.trim();
  if (!rawInput) {
    cancelAdding();
    return;
  }
  try {
    const { title, priority, labelNames, addToToday, addToNext, dueDate, targetListName } = parseTaskMacros(rawInput);
    if (!title) {
      cancelAdding();
      return;
    }

    const labelIds = await resolveLabelIds(store, labelNames);

    const todayList = findTodayList(store);
    const nextList = findNextList(store);
    const targetCabinetList = targetListName ? await ensureCabinetList(store, targetListName) : null;

    let primaryListId = props.list._id;
    if (targetCabinetList && props.section.slug !== 'planning') {
      primaryListId = targetCabinetList._id;
    }

    const taskPayload: Record<string, unknown> = { title };
    taskPayload.listId = primaryListId;
    if (priority !== null) taskPayload.priority = priority;
    if (labelIds.length) taskPayload.labels = labelIds;
    if (dueDate) taskPayload.dueDate = dueDate;

    const { data: task } = await api.post('/tasks', taskPayload);
    store.upsertTask(task);
    await store.refreshListCards([primaryListId]);
    const seededCard = store.cards.find(c => c.taskId === task._id && c.listId === primaryListId) || null;
    lastCreatedCardId.value = seededCard?._id || null;

    if (targetCabinetList && props.section.slug === 'planning') {
      await addCardIfMissing(store, task._id, targetCabinetList._id);
    }

    // If ! shortcut used, also add card to Today list (if not already in a planning list)
    if (addToToday && todayList && todayList._id !== primaryListId) {
      await addCardIfMissing(store, task._id, todayList._id);
    }

    // If > shortcut used, also add card to Next list (if not already in that list)
    if (addToNext && nextList && nextList._id !== primaryListId) {
      await addCardIfMissing(store, task._id, nextList._id);
    }

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

function handleQuickAdd(e: Event) {
  const detail = (e as CustomEvent).detail;
  const targetListId = detail?.listId;
  
  if (targetListId === props.list._id || (!targetListId && (hoveredListId.value === props.list._id || (!hoveredListId.value && props.list.name === 'Draft')))) {
    startAdding();
  }
}


function condenseAll() {
  closeMenu();
  document.querySelectorAll(`.card[data-list-id="${props.list._id}"]`).forEach(el => {
    el.classList.add('condensed');
  });
}

function expandAll() {
  closeMenu();
  document.querySelectorAll(`.card[data-list-id="${props.list._id}"]`).forEach(el => {
    el.classList.remove('condensed');
  });
}

onMounted(() => {
  window.addEventListener('charteris:quick-add', handleQuickAdd);

  // Auto-condense Next list cards on initial render
  if (props.list.name === 'Next') {
    nextTick(() => {
      document.querySelectorAll(`.card[data-list-id="${props.list._id}"]`).forEach(el => {
        el.classList.add('condensed');
      });
    });
  }
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

async function archiveCompleted() {
  closeMenu();
  const completed = cards.value.filter(c => {
    const task = store.taskById(c.taskId);
    return task && task.completed && !task.archived;
  });
  if (!completed.length) return;
  const BATCH = 5;
  for (let i = 0; i < completed.length; i += BATCH) {
    const batch = completed.slice(i, i + BATCH);
    await Promise.all(batch.map(async card => {
      const { data } = await api.patch(`/tasks/${card.taskId}/archive`);
      store.upsertTask(data);
    }));
  }
}

async function adjournList() {
  closeMenu();
  try {
    const { data } = await api.post('/sections/planning/adjourn');
    await store.refreshListCards(data.listIds);
  } catch (err) {
    console.error('Adjourn failed:', err);
  }
}

async function archiveList() {
  closeMenu();
  if (!confirm(`Archive "${props.list.name}" and all its tasks?`)) return;
  try {
    const { data } = await api.patch(`/lists/${props.list._id}/archive`);
    store.upsertList(data);
  } catch (err) {
    console.error('Archive list failed:', err);
  }
}

async function unarchiveList() {
  closeMenu();
  try {
    const { data } = await api.patch(`/lists/${props.list._id}/archive`);
    store.upsertList(data);
  } catch (err) {
    console.error('Unarchive list failed:', err);
  }
}

// --- List move left/right ---

const sectionLists = computed(() => store.listsForSection(props.section._id));
const listIndex = computed(() => sectionLists.value.findIndex(l => l._id === props.list._id));
const canMoveLeft = computed(() => !props.list.isFixed && listIndex.value > 0);
const canMoveRight = computed(() => !props.list.isFixed && listIndex.value < sectionLists.value.length - 1);

async function moveListLeft() {
  closeMenu();
  if (!canMoveLeft.value) return;
  const neighbor = sectionLists.value[listIndex.value - 1];
  try {
    await api.patch(`/lists/${props.list._id}/reorder`, { order: neighbor.order });
    await store.refreshSectionLists(props.section._id);
  } catch (err) {
    console.error('Move list left failed:', err);
  }
}

async function moveListRight() {
  closeMenu();
  if (!canMoveRight.value) return;
  const neighbor = sectionLists.value[listIndex.value + 1];
  try {
    await api.patch(`/lists/${props.list._id}/reorder`, { order: neighbor.order });
    await store.refreshSectionLists(props.section._id);
  } catch (err) {
    console.error('Move list right failed:', err);
  }
}

function openImportForList() {
  closeMenu();
  emit('openImport', { listId: props.list._id });
}

</script>

<template>
  <div
    class="list"
    :class="[
      {
        'list--drag-over': isOver && droppable,
        'list--archived': list.archived,
      },
      listSemanticClass,
    ]"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="list__header">
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
        @click.stop="list.isFixed ? expandAll() : startRename()"
      >{{ list.name }}</span>
      <span class="list__count">{{ activeCardCount }}</span>
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
            <button role="menuitem" class="dropdown__item" @click="archiveCompleted">
              <i class="fas fa-check-circle"></i>
              Archive completed tasks
            </button>
          </li>
          <li v-if="list.name === 'Today' && section.slug === 'planning'" role="none">
            <button role="menuitem" class="dropdown__item" @click="adjournList">
              <i class="fas fa-times-circle"></i>
              Adjourn
            </button>
          </li>
          <li role="none">
            <button role="menuitem" class="dropdown__item" @click="archiveAllTasks">
              <i class="fas fa-archive"></i>
              Archive all tasks
            </button>
          </li>
          <li role="none">
            <button role="menuitem" class="dropdown__item" @click="openImportForList">
              <i class="fas fa-file-import"></i>
              Import tasks
            </button>
          </li>
          <li role="none">
            <button role="menuitem" class="dropdown__item" @click="condenseAll">
              <i class="fas fa-compress-alt"></i>
              Condense all
            </button>
          </li>
          <li role="none">
            <button role="menuitem" class="dropdown__item" @click="expandAll">
              <i class="fas fa-expand-alt"></i>
              Expand all
            </button>
          </li>
          <li v-if="!list.isFixed" role="none">
            <button role="menuitem" class="dropdown__item dropdown__item--danger" @click="archiveList">
              <i class="fas fa-times-circle"></i>
              Archive list
            </button>
          </li>
          <li v-if="list.archived" role="none">
            <button role="menuitem" class="dropdown__item" @click="unarchiveList">
              <i class="fas fa-box-open"></i>
              Unarchive list
            </button>
          </li>
          <li v-if="canMoveLeft" role="none">
            <button role="menuitem" class="dropdown__item" @click="moveListLeft">
              <i class="fas fa-arrow-left"></i>
              Move left
            </button>
          </li>
          <li v-if="canMoveRight" role="none">
            <button role="menuitem" class="dropdown__item" @click="moveListRight">
              <i class="fas fa-arrow-right"></i>
              Move right
            </button>
          </li>
        </ul>
        <div v-if="menuOpen" class="dropdown__backdrop" @click="closeMenu"></div>
      </div>
    </div>
    <div
      class="list__cards"
      :data-list-id="list._id"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="handleDrop"
    >
      <template v-for="(card, i) in filteredCards" :key="card._id">
        <div v-if="isSameListDrag && dropIndex === i && dragCard?._id !== card._id" class="drop-indicator"></div>
        <div :data-card-id="card._id">
          <TaskCard :card="card" :section-slug="section.slug" @open="(c: ICard) => emit('openCard', c)" />
        </div>
      </template>
      <div v-if="isSameListDrag && dropIndex === filteredCards.length" class="drop-indicator"></div>
    </div>
    <div v-if="adding" class="list__add-form">
      <input
        ref="inputRef"
        v-model="newTitle"
        class="list__add-input"
        placeholder="Card title..."
        @keydown.enter.prevent="submitNewCard"
        @keydown.escape="cancelAdding"
        @keydown.up.prevent="editLastCreated"
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
  scroll-snap-align: start;
}

.list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  flex-shrink: 0;
  user-select: none;
  -webkit-user-select: none;
}

.list__title {
  font-weight: 600;
  font-size: 0.875rem;
  flex: 1;
  min-width: 0;
}

.list__count {
  flex-shrink: 0;
  margin-left: 8px;
  margin-right: 8px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  opacity: 0.9;
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
  gap: 7px;
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

.list--archived {
  opacity: 0.4;
  filter: grayscale(0.5);
}

.drop-indicator {
  height: 3px;
  background: var(--accent, #457B9D);
  border-radius: 2px;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .list {
    width: calc(100vw - calc(var(--gap-main) * 2 + 32px));
    min-width: calc(100vw - calc(var(--gap-main) * 2 + 32px));
  }
}
</style>
