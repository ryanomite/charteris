<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import { renderMarkdown } from '../utils/markdown';

const store = useTaskStore();

const emit = defineEmits<{ (e: 'hide'): void }>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const draft = ref('');
const editing = ref(false);
const status = ref<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>('idle');
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const preview = computed(() => renderMarkdown(draft.value));

const statusLabel = computed(() => {
  switch (status.value) {
    case 'saving': return 'Saving…';
    case 'unsaved': return 'Unsaved changes';
    case 'saved': return 'Saved';
    case 'error': return 'Save failed';
    default: return '';
  }
});

async function save() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (draft.value === store.notes.content) {
    if (status.value !== 'idle') status.value = 'saved';
    return;
  }
  status.value = 'saving';
  try {
    await store.updateNotes(draft.value);
    status.value = 'saved';
  } catch (err) {
    console.error('Notes save failed:', err);
    status.value = 'error';
  }
}

function scheduleSave() {
  status.value = 'unsaved';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 800);
}

function onInput(e: Event) {
  draft.value = (e.target as HTMLTextAreaElement).value;
  scheduleSave();
}

function applyText(next: string, selStart: number, selEnd: number) {
  draft.value = next;
  requestAnimationFrame(() => {
    const el = textareaRef.value;
    if (!el) return;
    el.focus();
    el.setSelectionRange(selStart, selEnd);
  });
  scheduleSave();
}

function surround(before: string, after: string = before) {
  const el = textareaRef.value;
  if (!el) return;
  const { selectionStart: start, selectionEnd: end } = el;
  const selected = draft.value.slice(start, end);
  const body = selected || 'text';
  applyText(
    draft.value.slice(0, start) + before + body + after + draft.value.slice(end),
    start + before.length,
    start + before.length + body.length
  );
}

function prefixLine(prefix: string) {
  const el = textareaRef.value;
  if (!el) return;
  const start = el.selectionStart;
  const lineStart = draft.value.lastIndexOf('\n', start - 1) + 1;
  applyText(
    draft.value.slice(0, lineStart) + prefix + draft.value.slice(lineStart),
    start + prefix.length,
    start + prefix.length
  );
}

function insertLink() {
  const el = textareaRef.value;
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = draft.value.slice(start, end) || 'text';
  const snippet = `[${selected}](url)`;
  const urlStart = start + selected.length + 3;
  applyText(
    draft.value.slice(0, start) + snippet + draft.value.slice(end),
    urlStart,
    urlStart + 3
  );
}

watch(
  () => store.notes.content,
  (value) => {
    if (status.value === 'saving' || status.value === 'unsaved') return;
    if (value !== draft.value) draft.value = value;
  }
);

watch(editing, (value) => {
  if (value) nextTick(() => textareaRef.value?.focus());
});

onMounted(async () => {
  try {
    await store.fetchNotes();
  } catch (err) {
    console.error('Notes fetch failed:', err);
  }
  draft.value = store.notes.content;
  status.value = 'idle';
});

onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    if (draft.value !== store.notes.content) save();
  }
});
</script>

<template>
  <section class="notes-section" :class="{ 'notes-section--editing': editing }">
    <div class="notes-section__header">
      <div class="notes-section__title" title="Hide Notes" @click="emit('hide')">
        <i class="fas fa-note-sticky"></i>
        <span>Notes</span>
      </div>
      <div class="notes-section__header-actions">
        <span class="notes-section__status" :class="`notes-section__status--${status}`">
          {{ statusLabel }}
        </span>
        <button
          type="button"
          class="notes-section__edit"
          :class="{ 'notes-section__edit--active': editing }"
          :title="editing ? 'Hide editor' : 'Edit notes'"
          @click="editing = !editing"
        >
          <i :class="['fas', editing ? 'fa-eye' : 'fa-pen']"></i>
        </button>
      </div>
    </div>

    <div class="notes-section__body">
      <div v-show="editing" class="notes-section__pane">
        <div class="notes-section__toolbar">
          <button type="button" title="Heading 1" @click="prefixLine('# ')"><i class="fas fa-heading"></i><sub class="notes-section__sub">1</sub></button>
          <button type="button" title="Heading 2" @click="prefixLine('## ')"><i class="fas fa-heading"></i><sub class="notes-section__sub">2</sub></button>
          <button type="button" title="Bold" @click="surround('**')"><i class="fas fa-bold"></i></button>
          <button type="button" title="Italic" @click="surround('*')"><i class="fas fa-italic"></i></button>
          <button type="button" title="Bulleted list" @click="prefixLine('- ')"><i class="fas fa-list-ul"></i></button>
          <button type="button" title="Numbered list" @click="prefixLine('1. ')"><i class="fas fa-list-ol"></i></button>
          <button type="button" title="Link" @click="insertLink"><i class="fas fa-link"></i></button>
          <button type="button" title="Inline code" @click="surround('`')"><i class="fas fa-code"></i></button>
        </div>
        <textarea
          ref="textareaRef"
          class="notes-section__textarea"
          placeholder="Write your notes in Markdown…&#10;&#10;# Heading&#10;## Heading 2&#10;**bold**  *italic*&#10;- bullet&#10;[link](https://example.com)"
          spellcheck="false"
          :value="draft"
          @input="onInput"
        ></textarea>
      </div>

      <div class="notes-section__preview-wrap" @click="editing = !editing">
        <div v-if="draft.trim()" class="notes-section__preview markdown-body" v-html="preview"></div>
        <div v-else class="notes-section__preview notes-section__preview--empty">Nothing to preview yet.</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.notes-section {
  display: flex;
  flex-direction: column;
  background: #f5a62322;
  border-radius: var(--radius-section);
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 40px rgba(0, 0, 0, 0.2);
  height: auto;
  flex: 0 0 auto;
}

.notes-section--editing {
  height: 320px;
}

.notes-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  flex-shrink: 0;
}

.notes-section__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-primary);
  cursor: pointer;
  transition: opacity var(--transition-default);
}

.notes-section__title:hover {
  opacity: 0.7;
}

.notes-section__status {
  font-size: 0.72rem;
  color: var(--text-secondary);
  letter-spacing: 0.03em;
}

.notes-section__header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notes-section__edit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--icon-ui);
  font-size: 0.8rem;
  transition: background var(--transition-default), color var(--transition-default);
}

.notes-section__edit:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.notes-section__edit--active {
  background: rgba(245, 166, 35, 0.2);
  color: #f5a623;
}

.notes-section__status--saved {
  color: #6bd968;
}

.notes-section__status--error {
  color: #ff6b6b;
}

.notes-section__body {
  display: flex;
  gap: 12px;
  padding: 0 16px 16px;
  flex: 1;
  min-height: 0;
}

.notes-section__pane {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
}

.notes-section__toolbar {
  display: flex;
  gap: 2px;
  padding-bottom: 6px;
  flex-wrap: wrap;
}

.notes-section__toolbar button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  width: 30px;
  height: 28px;
  border-radius: 6px;
  color: var(--icon-ui);
  font-size: 0.8rem;
  transition: background var(--transition-default);
}

.notes-section__toolbar button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.notes-section__sub {
  font-size: 0.6rem;
  margin-left: -2px;
}

.notes-section__textarea {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.25);
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
  line-height: 1.5;
}

.notes-section__textarea:focus {
  outline: none;
  border-color: rgba(245, 166, 35, 0.6);
}

.notes-section__preview-wrap {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
}

.notes-section__preview {
  flex: 1 1 auto;
  min-height: 2.6em;
  max-height: 360px;
  overflow-y: auto;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  font-size: 0.85rem;
  line-height: 1.55;
  cursor: pointer;
  transition: border-color var(--transition-default);
}

.notes-section__preview:hover {
  border-color: rgba(245, 166, 35, 0.5);
}

.notes-section--editing .notes-section__preview {
  min-height: 0;
  max-height: none;
  cursor: default;
}

.notes-section__preview--empty {
  color: var(--text-secondary);
  font-style: italic;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 0.6em 0 0.3em;
  line-height: 1.25;
  color: var(--text-primary);
}

.markdown-body :deep(h1) { font-size: 1.4rem; }
.markdown-body :deep(h2) { font-size: 1.2rem; }
.markdown-body :deep(h3) { font-size: 1.05rem; }

.markdown-body :deep(p) {
  margin: 0.35em 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.4em;
}

.markdown-body :deep(li) {
  margin: 0.15em 0;
}

.markdown-body :deep(a) {
  color: #f5a623;
}

.markdown-body :deep(code) {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
}

@media (max-width: 768px) {
  .notes-section--editing {
    height: auto;
  }

  .notes-section__body {
    flex-direction: column;
  }

  .notes-section__textarea {
    min-height: 180px;
  }

  .notes-section__preview {
    max-height: 240px;
  }
}
</style>
