<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import api from '../services/api';
import { parseTaskMacros } from '../utils/taskMacros';
import { resolveLabelIds, findTodayList, findNextList, ensureCabinetList, addCardIfMissing } from '../utils/taskHelpers';

const store = useTaskStore();

const open = ref(false);
const text = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const submitting = ref(false);
const error = ref('');

const topLabels = computed(() => {
  const counts = new Map<string, number>();
  for (const t of store.tasks) {
    for (const lid of t.labels || []) counts.set(lid, (counts.get(lid) || 0) + 1);
  }
  return [...store.labels]
    .sort((a, b) => (counts.get(b._id) || 0) - (counts.get(a._id) || 0))
    .slice(0, 8);
});

function appendMacro(macro: string) {
  const trimmed = text.value.trimEnd();
  text.value = trimmed ? `${trimmed} ${macro}` : macro;
  nextTick(() => inputRef.value?.focus());
}

function reset() {
  text.value = '';
  error.value = '';
}

function close() {
  reset();
  open.value = false;
}

function openModal() {
  open.value = true;
  nextTick(() => inputRef.value?.focus());
}

async function submit() {
  const rawInput = text.value.trim();
  if (!rawInput) {
    close();
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    const { title, priority, labelNames, addToToday, addToNext, dueDate, targetListName } = parseTaskMacros(rawInput);
    if (!title) {
      close();
      return;
    }

    const labelIds = await resolveLabelIds(store, labelNames);

    const todayList = findTodayList(store);
    const nextList = findNextList(store);
    const targetCabinetList = targetListName ? await ensureCabinetList(store, targetListName) : null;

    // Default destination: Today list, then first board list.
    let primaryListId: string | null = null;
    if (targetCabinetList) {
      primaryListId = targetCabinetList._id;
    } else if (todayList) {
      primaryListId = todayList._id;
    } else {
      const board = store.sections.find(s => s.slug === 'board');
      const lists = board ? store.listsForSection(board._id) : [];
      primaryListId = lists.length ? lists[0]._id : null;
    }
    if (!primaryListId) {
      error.value = 'No destination list available.';
      return;
    }

    const taskPayload: Record<string, unknown> = { title, listId: primaryListId };
    if (priority !== null) taskPayload.priority = priority;
    if (labelIds.length) taskPayload.labels = labelIds;
    if (dueDate) taskPayload.dueDate = dueDate;

    const { data: task } = await api.post('/tasks', taskPayload);
    store.upsertTask(task);
    await store.refreshListCards([primaryListId]);

    if (targetCabinetList && targetCabinetList._id !== primaryListId) {
      await addCardIfMissing(store, task._id, targetCabinetList._id);
    }

    if (addToToday && todayList && todayList._id !== primaryListId) {
      await addCardIfMissing(store, task._id, todayList._id);
    }

    if (addToNext && nextList && nextList._id !== primaryListId) {
      await addCardIfMissing(store, task._id, nextList._id);
    }

    close();
  } catch (err) {
    console.error('Quick add failed:', err);
    error.value = 'Failed to create task.';
  } finally {
    submitting.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
}

onMounted(() => {
  window.addEventListener('charteris:quick-add-modal', openModal as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('charteris:quick-add-modal', openModal as EventListener);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click="close" @keydown="onKeydown">
      <div class="modal" @click.stop>
        <div class="modal__header">
          <h3>Quick Add</h3>
          <button class="modal__close" @click="close" :disabled="submitting" title="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal__body">
          <p class="modal__hint">
            Use macros: @label, #list, p1–p5, dates (today/tomorrow/Friday), ! (today), &gt; (next).
          </p>
          <input
            ref="inputRef"
            v-model="text"
            class="modal__input"
            type="text"
            placeholder="Task title..."
            @keydown.enter.prevent="submit"
            @keydown.escape.prevent="close"
          />
          <div class="modal__macros">
            <button
              v-for="label in topLabels"
              :key="label._id"
              type="button"
              class="modal__macro"
              @click="appendMacro('@' + label.name)"
            >@{{ label.name }}</button>
            <button type="button" class="modal__macro" @click="appendMacro('#home')">#home</button>
            <button type="button" class="modal__macro" @click="appendMacro('#alarm')">#alarm</button>
          </div>
          <p v-if="error" class="modal__error">{{ error }}</p>
        </div>
        <div class="modal__footer">
          <button class="modal__btn" @click="close" :disabled="submitting">Cancel</button>
          <button class="modal__btn modal__btn--primary" @click="submit" :disabled="submitting">
            <i class="fas fa-plus"></i>
            {{ submitting ? 'Adding...' : 'Add' }}
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
  z-index: 1200;
}
.modal {
  width: min(480px, 96vw);
  background: var(--bg-card);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.modal__header h3 {
  margin: 0;
  font-size: 1rem;
}
.modal__close {
  color: var(--icon-ui);
  padding: 4px 6px;
  border-radius: 4px;
}
.modal__body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.modal__hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.85rem;
}
.modal__input {
  width: 100%;
  background: #111;
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 10px;
  font-size: 0.9rem;
  outline: none;
}
.modal__error {
  margin: 0;
  color: #ff7070;
  font-size: 0.85rem;
}

.modal__macros {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.modal__macro {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: background var(--transition-default), color var(--transition-default);
}

.modal__macro:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-primary);
}
.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.modal__btn {
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}
.modal__btn--primary {
  background: var(--accent, #457B9D);
}
</style>
