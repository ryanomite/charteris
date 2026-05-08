<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import api from '../services/api';
import { parseTaskMacros } from '../utils/taskMacros';
import { resolveLabelIds, findTodayList, findNextList, ensureCabinetList, addCardIfMissing } from '../utils/taskHelpers';
import type { IList } from '../types';

interface RawImportTask {
  title?: string;
  description?: string;
  priority?: number | null;
  labels?: string[];
  dueDate?: string | null;
  recurrence?: string;
  completed?: boolean;
  archived?: boolean;
  master?: boolean;
  parentId?: string | null;
  subtasks?: Array<{ title: string; completed?: boolean }>;
  listId?: string;
  list?: string;
  listName?: string;
}

const props = defineProps<{
  open: boolean;
  targetListId?: string | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();
const store = useTaskStore();

const text = ref('');
const importing = ref(false);
const error = ref('');
const stats = ref<{ created: number; failed: number }>({ created: 0, failed: 0 });

const targetList = computed(() =>
  props.targetListId ? store.lists.find(l => l._id === props.targetListId) ?? null : null
);

function resetState() {
  text.value = '';
  importing.value = false;
  error.value = '';
  stats.value = { created: 0, failed: 0 };
}

function close() {
  if (importing.value) return;
  resetState();
  emit('close');
}

function parseInput(raw: string): RawImportTask[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed as RawImportTask[];
    if (parsed && typeof parsed === 'object') return [parsed as RawImportTask];
  } catch {
    // Fallback to line-based text list.
  }

  return trimmed
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(title => ({ title }));
}

async function resolvePrimaryList(rawTask: RawImportTask, macroListName: string | null): Promise<IList | null> {
  if (targetList.value) return targetList.value;

  if (rawTask.listId) {
    const direct = store.lists.find(l => l._id === rawTask.listId);
    if (direct) return direct;
  }

  const byName = rawTask.listName || rawTask.list || macroListName;
  if (byName) {
    const cabinetList = await ensureCabinetList(store, byName);
    if (cabinetList) return cabinetList;
  }

  return findTodayList(store);
}

async function importOne(rawTask: RawImportTask): Promise<void> {
  const baseTitle = rawTask.title?.trim() || '';
  const macros = parseTaskMacros(baseTitle);
  const finalTitle = macros.title || baseTitle;
  if (!finalTitle) throw new Error('Task title is required');

  const labelIds = await resolveLabelIds(store, [...(rawTask.labels || []), ...macros.labelNames]);
  const primaryList = await resolvePrimaryList(rawTask, macros.targetListName);
  if (!primaryList) throw new Error('No destination list available');

  const taskPayload: Record<string, unknown> = {
    title: finalTitle,
    description: rawTask.description || '',
    priority: (macros.priority ?? rawTask.priority ?? null),
    dueDate: (macros.dueDate ?? rawTask.dueDate ?? null),
    recurrence: rawTask.recurrence || '',
    completed: rawTask.completed || false,
    archived: rawTask.archived || false,
    master: rawTask.master || false,
    parentId: rawTask.parentId || null,
    subtasks: (rawTask.subtasks || []).map(s => ({ title: s.title, completed: !!s.completed })),
    listId: primaryList._id,
  };
  if (labelIds.length) taskPayload.labels = labelIds;

  const { data: task } = await api.post('/tasks', taskPayload);
  store.upsertTask(task);

  // If importing into planning and a #list macro exists, also add to that cabinet list.
  if (!targetList.value && macros.targetListName && primaryList.sectionId !== (store.sections.find(s => s.slug === 'board')?._id || '')) {
    const cabinetList = await ensureCabinetList(store, macros.targetListName);
    if (cabinetList) await addCardIfMissing(store, task._id, cabinetList._id);
  }

  if (macros.addToToday) {
    const todayList = findTodayList(store);
    if (todayList) await addCardIfMissing(store, task._id, todayList._id);
  }

  if (macros.addToNext) {
    const nextList = findNextList(store);
    if (nextList) await addCardIfMissing(store, task._id, nextList._id);
  }
}

async function doImport() {
  error.value = '';
  stats.value = { created: 0, failed: 0 };
  const items = parseInput(text.value);
  if (!items.length) {
    error.value = 'Provide JSON task data or one title per line.';
    return;
  }

  importing.value = true;
  try {
    for (const item of items) {
      try {
        await importOne(item);
        stats.value.created += 1;
      } catch (err) {
        console.error('Import item failed:', err);
        stats.value.failed += 1;
      }
    }
    if (stats.value.failed === 0) {
      close();
    }
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click="close">
      <div class="modal" @click.stop>
        <div class="modal__header">
          <h3>Import Tasks</h3>
          <button class="modal__close" @click="close" :disabled="importing" title="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="modal__body">
          <p class="modal__hint">
            Paste a JSON task object, JSON array of tasks, or plain text titles (one per line).
          </p>
          <p v-if="targetList" class="modal__hint">
            All imported tasks will be added to <strong>{{ targetList.name }}</strong>.
          </p>

          <textarea
            v-model="text"
            class="modal__input"
            rows="12"
            placeholder='{"title":"Pay rent p1 @Home Tomorrow"}'
          ></textarea>

          <details class="modal__examples">
            <summary>JSON format examples</summary>
            <p class="modal__hint">You can pass these examples to an AI to generate import data:</p>
            <pre class="modal__example-code">// Minimal
{ "title": "Buy groceries" }

// With macros in title
{ "title": "Book dentist !p2 @Health Friday" }

// Full object
{
  "title": "Quarterly report",
  "description": "Export from Notion and format",
  "priority": 1,
  "labels": ["Work", "Admin"],
  "dueDate": "2026-06-01",
  "recurrence": "monthly",
  "completed": false,
  "archived": false,
  "master": false,
  "subtasks": [
    { "title": "Export data", "completed": false },
    { "title": "Write summary", "completed": false }
  ]
}

// Array of tasks
[
  { "title": "Call bank", "priority": 2, "labels": ["Finance"] },
  { "title": "Renew passport", "dueDate": "2026-09-15", "labels": ["Admin"] }
]</pre>
          </details>

          <p v-if="error" class="modal__error">{{ error }}</p>
          <p v-if="stats.created || stats.failed" class="modal__stats">
            Created {{ stats.created }} · Failed {{ stats.failed }}
          </p>
        </div>

        <div class="modal__footer">
          <button class="modal__btn" @click="close" :disabled="importing">Cancel</button>
          <button class="modal__btn modal__btn--primary" @click="doImport" :disabled="importing">
            <i class="fas fa-file-import"></i>
            {{ importing ? 'Importing...' : 'Import' }}
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
  width: min(680px, 96vw);
  max-height: 90vh;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  resize: vertical;
}

.modal__error {
  margin: 0;
  color: #ff7070;
  font-size: 0.85rem;
}

.modal__stats {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.modal__examples {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 12px;
}

.modal__examples summary {
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.85rem;
  user-select: none;
}

.modal__examples summary:hover {
  color: var(--text-primary);
}

.modal__example-code {
  margin: 10px 0 4px;
  padding: 10px;
  background: #111;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.78rem;
  color: var(--text-secondary);
  white-space: pre;
  overflow-x: auto;
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
