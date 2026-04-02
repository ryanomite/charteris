<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import api from '../services/api';
import type { ICard, ITask, ILabel, ISubtask } from '../types';

const props = defineProps<{ card: ICard | null }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useTaskStore();

const task = computed(() =>
  props.card ? store.taskById(props.card.taskId) : undefined
);

// Local editing state (copies of the task fields)
const title = ref('');
const description = ref('');
const priority = ref<1 | 2 | 3 | 4 | null>(null);
const dueDate = ref('');
const recurrence = ref('');
const subtasks = ref<ISubtask[]>([]);
const taskLabels = ref<string[]>([]);
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

const filteredLabels = computed(() =>
  store.labels.filter(l =>
    l.name.toLowerCase().includes(labelSearch.value.toLowerCase()) &&
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
  const name = labelSearch.value.trim();
  if (!name) return;
  try {
    const { data } = await api.post('/labels', { name });
    store.upsertLabel(data);
    taskLabels.value.push(data._id);
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
    const payload: Partial<ITask> = {
      title: title.value,
      description: description.value,
      priority: priority.value,
      dueDate: dueDate.value || null,
      recurrence: recurrence.value,
      subtasks: subtasks.value,
      labels: taskLabels.value,
    };
    const { data } = await api.put(`/tasks/${task.value._id}`, payload);
    store.upsertTask(data);
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
            <button
              class="modal__toggle"
              :class="{ 'modal__toggle--done': task.completed }"
              @click="toggleComplete"
            >
              <i :class="['fas', task.completed ? 'fa-check-circle' : 'fa-circle']"></i>
              <span>{{ task.completed ? 'Completed' : 'Mark complete' }}</span>
            </button>
          </div>

          <!-- Priority -->
          <div class="modal__row">
            <label class="modal__label">Priority</label>
            <div class="modal__priority">
              <button
                v-for="p in [1, 2, 3, 4]"
                :key="p"
                class="priority-btn"
                :class="{ 'priority-btn--active': priority === p }"
                :style="{ '--pc': `var(--priority-${p})` }"
                @click="priority = priority === p ? null : (p as 1 | 2 | 3 | 4)"
              >
                {{ p }}
              </button>
            </div>
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
                    v-if="labelSearch.trim() && !filteredLabels.find(l => l.name.toLowerCase() === labelSearch.toLowerCase())"
                    class="label-dropdown__item label-dropdown__create"
                    @mousedown.prevent="createAndAddLabel()"
                  >
                    Create "{{ labelSearch.trim() }}"
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Due Date -->
          <div class="modal__row">
            <label class="modal__label">Due Date</label>
            <input
              v-model="dueDate"
              type="date"
              class="modal__date"
            />
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
            <i class="fas fa-archive"></i> Archive
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
