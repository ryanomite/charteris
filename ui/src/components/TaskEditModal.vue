<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import { computeNextDueDate, handleRecurringCompletion } from '../composables/useRecurrence';
import { parseTaskMacros } from '../utils/taskMacros';
import { resolveLabelIds, findTodayList, findNextList, ensureCabinetList, addCardIfMissing, normalizeLabelName } from '../utils/taskHelpers';
import api from '../services/api';
import type { ICard, ITask, ILabel, ISubtask } from '../types';

const props = defineProps<{ card: ICard | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'open', card: ICard): void }>();

const store = useTaskStore();

const task = computed(() =>
  props.card ? store.taskById(props.card.taskId) : undefined
);

// Local editing state (copies of the task fields)
const title = ref('');
const description = ref('');
const priority = ref<1 | 2 | 3 | 4 | 5 | null>(null);
const dueDate = ref('');
const recurrence = ref('');
const subtasks = ref<ISubtask[]>([]);
const taskLabels = ref<string[]>([]);
const selectedListId = ref<string | null>(null);
const showDeleteConfirm = ref(false);
const showSeriesDeleteConfirm = ref(false);
const labelSearch = ref('');
const showLabelDropdown = ref(false);
const newSubtaskTitle = ref('');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS: Record<string, string> = {
  mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S',
};

// Sync local state when task changes
watch(() => task.value, (t) => {
  if (t) {
    title.value = t.title;
    description.value = t.description;
    priority.value = t.priority;
    dueDate.value = t.dueDate ? t.dueDate.split('T')[0] : '';
    recurrence.value = t.recurrence;
    subtasks.value = t.subtasks.map(s => ({ ...s }));
    taskLabels.value = [...t.labels];
  }
}, { immediate: true });

const recurrenceDays = computed(() =>
  recurrence.value ? recurrence.value.split(',').filter(Boolean) : []
);

function toggleDay(day: string) {
  const days = new Set(recurrenceDays.value);
  if (days.has(day)) days.delete(day);
  else days.add(day);
  recurrence.value = DAYS.filter(d => days.has(d)).join(',');
}

const labelObjects = computed(() =>
  taskLabels.value
    .map(id => store.labelById(id))
    .filter((l): l is ILabel => l != null)
);

const availableLists = computed(() => {
  // Return all lists from Counter (Planning/Briefing) and Cabinet (Board) sections
  const results: Array<{ _id: string; name: string; sectionName: string; sectionSlug: string }> = [];
  for (const list of store.lists) {
    const section = store.sections.find(s => s._id === list.sectionId);
    if (!list.archived && section && (section.slug === 'planning' || section.slug === 'board')) {
      results.push({
        _id: list._id,
        name: list.name,
        sectionName: section.name,
        sectionSlug: section.slug,
      });
    }
  }
  return results;
});

function labelDraftName(): string {
  return normalizeLabelName(labelSearch.value);
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setDueToday() {
  dueDate.value = formatLocalDate(new Date());
}

function setDueTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  dueDate.value = formatLocalDate(d);
}

function clearDueDate() {
  dueDate.value = '';
}

async function followUp() {
  if (!task.value || !props.card) return;
  try {
    if (!task.value.completed) {
      const { data: completed } = await api.patch(`/tasks/${task.value._id}/complete`);
      store.upsertTask(completed);
    }

    const followTitle = task.value.title.startsWith('F/U ') ? task.value.title : `F/U ${task.value.title}`;
    
    // Determine target list for follow-up task
    let selectListId: string | undefined;
    const currentList = store.lists.find(l => l._id === props.card!.listId);
    if (currentList && currentList.name === 'Today') {
      // If current task is in Today, move follow-up to Next
      const nextList = store.lists.find(l => l.name === 'Next');
      if (nextList) selectListId = nextList._id;
    }

    const payload: Record<string, unknown> = {
      title: followTitle,
      description: task.value.description,
      priority: task.value.priority,
      labels: task.value.labels,
      dueDate: null,
      recurrence: task.value.recurrence,
      completed: false,
      archived: false,
      master: task.value.master,
      parentId: task.value.parentId,
      subtasks: task.value.subtasks.map(s => ({ title: s.title, completed: false })),
    };

    // Use selectListId if determined, otherwise use current list
    if (selectListId) {
      payload.selectListId = selectListId;
    } else {
      payload.listId = props.card.listId;
    }

    const { data: newTask } = await api.post('/tasks', payload);
    store.upsertTask(newTask);
    
    // Refresh both the original and new task's lists
    const refreshListIds = [props.card.listId];
    if (selectListId && selectListId !== props.card.listId) {
      refreshListIds.push(selectListId);
    }
    await store.refreshListCards(refreshListIds);
    
    const newCard = store.cards.find(c => c.taskId === newTask._id && (selectListId ? c.listId === selectListId : c.listId === props.card!.listId));

    emit('close');
    if (newCard) {
      emit('open', newCard);
    }
  } catch (err) {
    console.error('Follow-up failed:', err);
  }
}

const filteredLabels = computed(() =>
  store.labels.filter(l =>
    l.name.toLowerCase().includes(labelDraftName().toLowerCase()) &&
    !taskLabels.value.includes(l._id)
  )
);

function addLabel(labelId: string) {
  if (!taskLabels.value.includes(labelId)) {
    taskLabels.value.push(labelId);
  }
  labelSearch.value = '';
  showLabelDropdown.value = false;
}

async function createAndAddLabel() {
  const name = labelDraftName();
  if (!name) return;
  try {
    const existing = store.labels.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      taskLabels.value.push(existing._id);
    } else {
      const { data } = await api.post('/labels', { name });
      store.upsertLabel(data);
      taskLabels.value.push(data._id);
    }
    labelSearch.value = '';
    showLabelDropdown.value = false;
  } catch (err) {
    console.error('Create label failed:', err);
  }
}

function removeLabel(labelId: string) {
  taskLabels.value = taskLabels.value.filter(id => id !== labelId);
}

function addSubtask() {
  const t = newSubtaskTitle.value.trim();
  if (!t) return;
  subtasks.value.push({ title: t, completed: false });
  newSubtaskTitle.value = '';
}

function removeSubtask(idx: number) {
  subtasks.value.splice(idx, 1);
}

async function save() {
  if (!task.value) return;
  try {
    const parsed = parseTaskMacros(title.value);
    const finalTitle = parsed.title || title.value.trim();

    const macroLabelIds = await resolveLabelIds(store, parsed.labelNames);
    const mergedLabels = [...new Set([...taskLabels.value, ...macroLabelIds])];

    // If recurrence changed and is non-empty, auto-compute due date
    let finalDueDate = parsed.dueDate || dueDate.value || null;
    if (recurrence.value && recurrence.value !== task.value.recurrence) {
      const computed = computeNextDueDate(recurrence.value);
      if (computed) finalDueDate = computed;
    }

    const payload: Partial<ITask> = {
      title: finalTitle,
      description: description.value,
      priority: parsed.priority ?? priority.value,
      dueDate: finalDueDate,
      recurrence: recurrence.value,
      subtasks: subtasks.value,
      labels: mergedLabels,
    };
    const { data } = await api.put(`/tasks/${task.value._id}`, payload);
    store.upsertTask(data);

    const currentList = props.card ? store.lists.find(l => l._id === props.card!.listId) : null;
    const currentSection = currentList
      ? store.sections.find(s => s._id === currentList.sectionId)
      : null;

    if (parsed.targetListName) {
      const cabinetList = await ensureCabinetList(store, parsed.targetListName);
      if (cabinetList) {
        if (currentSection?.slug === 'board' && props.card && props.card.listId !== cabinetList._id) {
          await api.patch(`/cards/${props.card._id}/move`, { targetListId: cabinetList._id });
          await store.refreshListCards([props.card.listId, cabinetList._id]);
        } else {
          await addCardIfMissing(store, task.value._id, cabinetList._id);
        }
      }
    }

    if (parsed.addToToday) {
      const todayList = findTodayList(store);
      if (todayList) {
        await addCardIfMissing(store, task.value._id, todayList._id);
      }
    }

    if (parsed.addToNext) {
      const nextList = findNextList(store);
      if (nextList) {
        await addCardIfMissing(store, task.value._id, nextList._id);
      }
    }

    // Handle list selector if user chose one
    if (selectedListId.value && props.card) {
      const selectedList = store.lists.find(l => l._id === selectedListId.value);
      const selectedSection = selectedList ? store.sections.find(s => s._id === selectedList.sectionId) : null;

      if (selectedSection?.slug === 'board') {
        // Cabinet list: move to that list
        const allTaskCards = store.cards.filter(c => c.taskId === task.value._id);
        for (const card of allTaskCards) {
          const cardList = store.lists.find(l => l._id === card.listId);
          const cardSection = cardList ? store.sections.find(s => s._id === cardList.sectionId) : null;
          if (cardSection?.slug === 'board' && card.listId !== selectedList._id) {
            await api.patch(`/cards/${card._id}/move`, { targetListId: selectedList._id });
          }
        }
        await store.refreshListCards([selectedList._id]);
      } else if (selectedSection?.slug === 'planning' && selectedList) {
        // Counter list: add to selected, remove from the other Counter list
        const todayList = findTodayList(store);
        const nextList = findNextList(store);
        const isToday = selectedList.name === 'Today';
        const otherCounterList = isToday ? nextList : todayList;

        // Remove from other Counter list
        if (otherCounterList) {
          const otherCard = store.cards.find(c => c.taskId === task.value._id && c.listId === otherCounterList._id);
          if (otherCard) {
            await api.delete(`/cards/${otherCard._id}`);
          }
        }

        // Add to selected Counter list
        await addCardIfMissing(store, task.value._id, selectedList._id);
      }
    }

    emit('close');
  } catch (err) {
    console.error('Save failed:', err);
  }
}

async function toggleComplete() {
  if (!task.value) return;
  try {
    const { data } = await api.patch(`/tasks/${task.value._id}/complete`);
    store.upsertTask(data);
    if (data.completed && data.recurrence) {
      await handleRecurringCompletion(data._id);
    }
  } catch (err) {
    console.error('Toggle complete failed:', err);
  }
}

async function archiveTask() {
  if (!task.value) return;
  try {
    const { data } = await api.patch(`/tasks/${task.value._id}/archive`);
    store.upsertTask(data);
    emit('close');
  } catch (err) {
    console.error('Archive failed:', err);
  }
}

async function deleteTask() {
  if (!task.value) return;
  try {
    await api.delete(`/tasks/${task.value._id}`);
    store.removeTask(task.value._id);
    emit('close');
  } catch (err) {
    console.error('Delete failed:', err);
  }
}

async function deleteSeriesTask() {
  if (!task.value) return;
  try {
    await api.delete(`/tasks/${task.value._id}/series`);
    // Refetch dashboard since series delete removes multiple tasks/cards
    await store.fetchDashboard();
    emit('close');
  } catch (err) {
    console.error('Series delete failed:', err);
  }
}

function onOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
    save();
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="card && task" class="modal-overlay" @click="onOverlayClick">
      <div class="modal" @click.stop>
        <div class="modal__header">
          <input
            v-model="title"
            class="modal__title"
            placeholder="Task title..."
          />
          <button class="modal__close" @click="save" title="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="modal__body">
          <!-- Completion toggle -->
          <div class="modal__row">
            <div class="modal__toggle-row">
              <button
                class="modal__toggle"
                :class="{ 'modal__toggle--done': task.completed }"
                @click="toggleComplete"
              >
                <i :class="['fas', task.completed ? 'fa-check-circle' : 'fa-circle']"></i>
                <span>{{ task.completed ? 'Completed' : 'Mark complete' }}</span>
              </button>
              <button class="modal__btn modal__btn--followup" @click="followUp">
                <i class="fas fa-reply"></i>
                Follow-up
              </button>
            </div>
          </div>

          <!-- Priority -->
          <div class="modal__row">
            <label class="modal__label">Priority</label>
            <div class="modal__priority">
              <button
                v-for="p in [1, 2, 3, 4, 5]"
                :key="p"
                class="priority-btn"
                :class="{ 'priority-btn--active': priority === p }"
                :style="{ '--pc': `var(--priority-${p})` }"
                @click="priority = priority === p ? null : (p as 1 | 2 | 3 | 4 | 5)"
              >
                {{ p === 5 ? 'R' : p }}
              </button>
            </div>
            <details class="modal__priority-help">
              <summary>Priority quick guide</summary>
              <ul>
                <li><strong>P1:</strong> Do today; urgent external commitments.</li>
                <li><strong>P2:</strong> Very important and next up; short slip okay.</li>
                <li><strong>P3:</strong> Important soon; moderate slip okay; can still be external.</li>
                <li><strong>P4:</strong> Internal priority; no near-term external pressure.</li>
                <li><strong>P5:</strong> Rainy-day / nice-to-have; no external urgency.</li>
              </ul>
            </details>
          </div>

          <!-- List Selector -->
          <div class="modal__row">
            <label class="modal__label">List (optional)</label>
            <select v-model="selectedListId" class="modal__select">
              <option :value="null">— No change —</option>
              <optgroup label="Counter" v-if="availableLists.some(l => l.sectionSlug === 'planning')">
                <option
                  v-for="list in availableLists.filter(l => l.sectionSlug === 'planning')"
                  :key="list._id"
                  :value="list._id"
                >
                  {{ list.name }}
                </option>
              </optgroup>
              <optgroup label="Cabinet" v-if="availableLists.some(l => l.sectionSlug === 'board')">
                <option
                  v-for="list in availableLists.filter(l => l.sectionSlug === 'board')"
                  :key="list._id"
                  :value="list._id"
                >
                  {{ list.name }}
                </option>
              </optgroup>
            </select>
          </div>

          <!-- Labels -->
          <div class="modal__row">
            <label class="modal__label">Labels</label>
            <div class="modal__labels">
              <span
                v-for="lbl in labelObjects"
                :key="lbl._id"
                class="label-tag"
              >
                {{ lbl.name }}
                <button @click="removeLabel(lbl._id)" class="label-tag__remove">
                  <i class="fas fa-times"></i>
                </button>
              </span>
              <div class="label-input-wrap">
                <input
                  v-model="labelSearch"
                  class="label-input"
                  placeholder="Add label..."
                  @focus="showLabelDropdown = true"
                  @keydown.enter.prevent="filteredLabels.length ? addLabel(filteredLabels[0]._id) : createAndAddLabel()"
                />
                <div v-if="showLabelDropdown && labelSearch" class="label-dropdown">
                  <button
                    v-for="lbl in filteredLabels"
                    :key="lbl._id"
                    class="label-dropdown__item"
                    @mousedown.prevent="addLabel(lbl._id)"
                  >
                    {{ lbl.name }}
                  </button>
                  <button
                    v-if="labelDraftName() && !filteredLabels.find(l => l.name.toLowerCase() === labelDraftName().toLowerCase())"
                    class="label-dropdown__item label-dropdown__create"
                    @mousedown.prevent="createAndAddLabel()"
                  >
                    Create "{{ labelDraftName() }}"
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Due Date -->
          <div class="modal__row">
            <label class="modal__label">Due Date</label>
            <div class="modal__date-row">
              <input
                v-model="dueDate"
                type="date"
                class="modal__date"
              />
              <button type="button" class="modal__date-shortcut" @click="setDueToday">Today</button>
              <button type="button" class="modal__date-shortcut" @click="setDueTomorrow">Tomorrow</button>
              <button type="button" class="modal__date-shortcut" @click="clearDueDate">Clear</button>
            </div>
          </div>

          <!-- Recurrence -->
          <div class="modal__row">
            <label class="modal__label">Recurrence</label>
            <div class="modal__recurrence">
              <button
                v-for="day in DAYS"
                :key="day"
                class="day-btn"
                :class="{ 'day-btn--active': recurrenceDays.includes(day) }"
                @click="toggleDay(day)"
              >
                {{ DAY_LABELS[day] }}
              </button>
            </div>
          </div>

          <!-- Description -->
          <div class="modal__row">
            <label class="modal__label">Description</label>
            <textarea
              v-model="description"
              class="modal__description"
              rows="3"
              placeholder="Add a description..."
            ></textarea>
          </div>

          <!-- Subtasks -->
          <div class="modal__row">
            <label class="modal__label">Subtasks</label>
            <div class="subtask-list">
              <div
                v-for="(sub, idx) in subtasks"
                :key="idx"
                class="subtask"
              >
                <button
                  class="subtask__check"
                  @click="sub.completed = !sub.completed"
                >
                  <i :class="['fas', sub.completed ? 'fa-check-square' : 'fa-square']"></i>
                </button>
                <span
                  class="subtask__title"
                  :class="{ 'subtask__title--done': sub.completed }"
                >
                  {{ sub.title }}
                </span>
                <button class="subtask__remove" @click="removeSubtask(idx)">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <div class="subtask-add">
                <input
                  v-model="newSubtaskTitle"
                  class="subtask-add__input"
                  placeholder="Add subtask..."
                  @keydown.enter.prevent="addSubtask()"
                />
                <button class="subtask-add__btn" @click="addSubtask()" :disabled="!newSubtaskTitle.trim()">
                  <i class="fas fa-plus"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal__footer">
          <button class="modal__btn modal__btn--archive" @click="archiveTask">
            <i :class="['fas', task?.archived ? 'fa-box-open' : 'fa-archive']"></i>
            {{ task?.archived ? 'Unarchive' : 'Archive' }}
          </button>

          <!-- Delete -->
          <div v-if="!showDeleteConfirm" class="modal__btn-group">
            <button class="modal__btn modal__btn--danger" @click="showDeleteConfirm = true">
              <i class="fas fa-trash"></i> Delete
            </button>
            <button
              v-if="task.parentId"
              class="modal__btn modal__btn--danger"
              @click="showSeriesDeleteConfirm = true"
            >
              <i class="fas fa-trash"></i> Delete Series
            </button>
          </div>
          <div v-else class="modal__confirm">
            <span>Delete this task?</span>
            <button class="modal__btn modal__btn--danger" @click="deleteTask">Yes</button>
            <button class="modal__btn" @click="showDeleteConfirm = false">No</button>
          </div>
          <div v-if="showSeriesDeleteConfirm" class="modal__confirm">
            <span>Delete all tasks in this series?</span>
            <button class="modal__btn modal__btn--danger" @click="deleteSeriesTask">Yes</button>
            <button class="modal__btn" @click="showSeriesDeleteConfirm = false">No</button>
          </div>

          <button class="modal__btn modal__btn--primary" @click="save">
            <i class="fas fa-check"></i> Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-card);
  border-radius: 12px;
  width: 520px;
  max-width: 95vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal__header {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal__title {
  flex: 1;
  font-size: 1.125rem;
  font-weight: 600;
  background: none;
  border: none;
  color: var(--text-primary);
  outline: none;
}

.modal__title::placeholder {
  color: var(--text-secondary);
}

.modal__close {
  color: var(--icon-ui);
  padding: 4px 8px;
  border-radius: 4px;
  transition: color var(--transition-default);
}

.modal__close:hover {
  color: var(--text-primary);
}

.modal__body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  font-weight: 600;
}

.modal__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  padding: 6px 0;
  transition: color var(--transition-default);
}

.modal__toggle:hover { color: var(--text-primary); }
.modal__toggle--done { color: #4CAF50; }

.modal__toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* Priority */
.modal__priority {
  display: flex;
  gap: 8px;
}

.priority-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.8125rem;
  border: 2px solid transparent;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  transition: all var(--transition-default);
}

.priority-btn:hover {
  border-color: var(--pc);
}

.priority-btn--active {
  border-color: var(--pc);
  color: var(--pc);
  background: rgba(255, 255, 255, 0.1);
}

.modal__priority-help {
  margin-top: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.modal__priority-help summary {
  cursor: pointer;
  color: var(--text-secondary);
}

.modal__priority-help ul {
  margin: 8px 0 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Labels */
.modal__labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.label-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.1);
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  color: var(--text-primary);
}

.label-tag__remove {
  color: var(--text-secondary);
  font-size: 0.625rem;
  transition: color var(--transition-default);
}

.label-tag__remove:hover { color: var(--priority-1); }

.label-input-wrap {
  position: relative;
}

.label-input {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.8125rem;
  color: var(--text-primary);
  outline: none;
  width: 140px;
}

.label-input:focus {
  border-color: var(--accent);
}

.label-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #1E1E1E;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  margin-top: 4px;
  z-index: 10;
  max-height: 140px;
  overflow-y: auto;
}

.label-dropdown__item {
  display: block;
  width: 100%;
  padding: 6px 8px;
  text-align: left;
  font-size: 0.8125rem;
  color: var(--text-primary);
  transition: background var(--transition-default);
}

.label-dropdown__item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.label-dropdown__create {
  color: var(--accent);
  font-style: italic;
}

/* Date */
.modal__date {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.875rem;
  color: var(--text-primary);
  outline: none;
  color-scheme: dark;
  width: fit-content;
}

.modal__date:focus {
  border-color: var(--accent);
}

.modal__date-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.modal__date-shortcut {
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.06);
  transition: background var(--transition-default), color var(--transition-default);
}

.modal__date-shortcut:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}

/* List Selector */
.modal__select {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.875rem;
  color: var(--text-primary);
  outline: none;
  width: 100%;
}

.modal__select:focus {
  border-color: var(--accent);
}

.modal__select optgroup {
  color: var(--text-secondary);
}

.modal__select option {
  background: #1a1a1a;
  color: var(--text-primary);
}

/* Recurrence */
.modal__recurrence {
  display: flex;
  gap: 6px;
}

.day-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-weight: 600;
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid transparent;
  transition: all var(--transition-default);
}

.day-btn:hover {
  border-color: var(--accent);
}

.day-btn--active {
  background: var(--accent);
  color: var(--text-primary);
  border-color: var(--accent);
}

/* Description */
.modal__description {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.875rem;
  color: var(--text-primary);
  outline: none;
  resize: vertical;
  font-family: inherit;
}

.modal__description:focus {
  border-color: var(--accent);
}

/* Subtasks */
.subtask-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.subtask {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.subtask__check {
  color: var(--icon-ui);
  font-size: 0.875rem;
  transition: color var(--transition-default);
}

.subtask__check:hover { color: var(--text-primary); }

.subtask__title {
  flex: 1;
  font-size: 0.8125rem;
}

.subtask__title--done {
  text-decoration: line-through;
  opacity: 0.5;
}

.subtask__remove {
  color: var(--text-secondary);
  font-size: 0.6875rem;
  opacity: 0;
  transition: opacity var(--transition-default), color var(--transition-default);
}

.subtask:hover .subtask__remove { opacity: 1; }
.subtask__remove:hover { color: var(--priority-1); }

.subtask-add {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.subtask-add__input {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 4px 0;
  font-size: 0.8125rem;
  color: var(--text-primary);
  outline: none;
}

.subtask-add__input:focus {
  border-color: var(--accent);
}

.subtask-add__btn {
  color: var(--icon-ui);
  font-size: 0.75rem;
  transition: color var(--transition-default);
}

.subtask-add__btn:hover:not(:disabled) { color: var(--accent); }
.subtask-add__btn:disabled { opacity: 0.3; }

/* Footer */
.modal__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.modal__btn-group {
  display: flex;
  gap: 8px;
}

.modal__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  transition: all var(--transition-default);
}

.modal__btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.modal__btn--danger {
  color: var(--priority-1);
}

.modal__btn--danger:hover {
  background: rgba(217, 4, 41, 0.15);
}

.modal__btn--archive:hover {
  background: rgba(252, 191, 73, 0.15);
  color: var(--priority-3);
}

.modal__btn--followup {
  margin-left: auto;
  color: var(--text-primary);
  background: rgba(87, 140, 183, 0.25);
}

.modal__btn--followup:hover {
  background: rgba(87, 140, 183, 0.38);
}

.modal__btn--primary {
  margin-left: auto;
  background: var(--accent);
  color: var(--text-primary);
}

.modal__btn--primary:hover {
  background: #5a93b3;
}

.modal__confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}
</style>
