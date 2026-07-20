<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import api from '../services/api';
import type { IViewPreset } from '../types';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const store = useTaskStore();

const saving = ref(false);
const deduping = ref(false);
const error = ref('');
const hideCommittedCards = ref(false);
const hideRainyDayCards = ref(false);
const castingRulesToday = ref('');
const castingRulesNext = ref('');
const cssOverrides = ref('');
const viewPresets = ref<IViewPreset[]>([]);

const newPresetName = ref('');
const newPresetIcon = ref('');

const hasChanges = computed(() => (
  hideCommittedCards.value !== store.globalSettings.hideCommittedCards
  || castingRulesToday.value !== store.globalSettings.castingRulesToday
  || castingRulesNext.value !== store.globalSettings.castingRulesNext
  || cssOverrides.value !== store.globalSettings.cssOverrides
  || JSON.stringify(viewPresets.value) !== JSON.stringify(store.globalSettings.viewPresets || [])
));

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    error.value = '';
    hideCommittedCards.value = store.globalSettings.hideCommittedCards;
    castingRulesToday.value = store.globalSettings.castingRulesToday;
    castingRulesNext.value = store.globalSettings.castingRulesNext;
    cssOverrides.value = store.globalSettings.cssOverrides;
    viewPresets.value = [...(store.globalSettings.viewPresets || [])];
  },
  { immediate: true },
);

async function save() {
  error.value = '';
  saving.value = true;
  try {
    await store.updateGlobalSettings({
      hideCommittedCards: hideCommittedCards.value,
      castingRulesToday: castingRulesToday.value.trim(),
      castingRulesNext: castingRulesNext.value.trim(),
      cssOverrides: cssOverrides.value,
      viewPresets: viewPresets.value,
    });
    emit('close');
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Failed to save settings';
  } finally {
    saving.value = false;
  }
}

function generateId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function addPreset() {
  const name = newPresetName.value.trim();
  const icon = newPresetIcon.value.trim();
  if (!name || !icon) return;
  const hash = location.hash.slice(1);
  viewPresets.value = [...viewPresets.value, { _id: generateId(), name, icon, hash }];
  newPresetName.value = '';
  newPresetIcon.value = '';
}

function removePreset(id: string) {
  viewPresets.value = viewPresets.value.filter(p => p._id !== id);
}

async function removeDuplicates() {
  if (saving.value || deduping.value) return;
  if (!confirm('Remove duplicate cards and duplicate-titled tasks? Keeps only the most recent occurrence.')) return;
  error.value = '';
  deduping.value = true;
  try {
    await api.post('/admin/deduplicate');
    await store.fetchDashboard();
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Failed to remove duplicates';
  } finally {
    deduping.value = false;
  }
}

function close() {
  if (saving.value) return;
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click="close">
      <div class="modal" @click.stop>
        <div class="modal__header">
          <h3>Global Settings</h3>
          <button class="modal__close" @click="close" :disabled="saving" title="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="modal__body">
          <label class="setting-row">
            <input type="checkbox" v-model="hideCommittedCards" />
            <span>Hide committed cards in Cabinet</span>
          </label>

          <label class="setting-row">
            <input type="checkbox" v-model="hideRainyDayCards" />
            <span>Hide rainy day cards (non-persistent)</span>
          </label>

          <div class="setting-block">
            <label for="casting-today">Casting Rule: Today</label>
            <textarea
              id="casting-today"
              v-model="castingRulesToday"
              rows="3"
              class="setting-input"
              placeholder="priority === 1 || isOverdue() || isDueToday()"
            ></textarea>
          </div>

          <div class="setting-block">
            <label for="casting-next">Casting Rule: Next</label>
            <textarea
              id="casting-next"
              v-model="castingRulesNext"
              rows="3"
              class="setting-input"
              placeholder="isDueTomorrow()"
            ></textarea>
          </div>

          <details class="setting-help">
            <summary>Expression help</summary>
            <p>Available fields: <code>title</code>, <code>description</code>, <code>priority</code>, <code>dueDate</code>, <code>completed</code>, <code>archived</code>, <code>recurrence</code>, <code>master</code>, <code>parentId</code></p>
            <p>Available helpers: <code>hasLabel(name)</code>, <code>inList(name)</code>, <code>regex(pattern, value, flags)</code>, <code>isDueToday()</code>, <code>isDueTomorrow()</code>, <code>isOverdue()</code>, <code>daysUntilDue()</code>, <code>today()</code>, <code>tomorrow()</code>, <code>currentHour()</code>, <code>currentWeekday()</code></p>
            <p>Examples:</p>
            <pre class="setting-code">priority === 1 || isOverdue() || isDueToday()

hasLabel('Work') && !completed && (isDueToday() || isDueTomorrow())

regex('security|audit', title) && inList('Backlog')

currentWeekday() >= 1 && currentWeekday() <= 5 && currentHour() < 17</pre>
          </details>

          <div class="setting-block">
            <label for="css-overrides">Global CSS overrides</label>
            <textarea
              id="css-overrides"
              v-model="cssOverrides"
              rows="6"
              class="setting-input"
              placeholder=".label-home { background-color: #245 !important; }\n.list-workstuff { box-shadow: 0 0 20px #4af; }"
            ></textarea>
          </div>

          <div class="setting-block">
            <label>View Presets</label>
            <p class="setting-hint">Save the current view (visible sections, filter, stats) as quick-access icons in the nav bar.</p>
            <div v-if="viewPresets.length" class="preset-list">
              <div v-for="preset in viewPresets" :key="preset._id" class="preset-row">
                <i :class="['fas', preset.icon]"></i>
                <span class="preset-row__name">{{ preset.name }}</span>
                <span class="preset-row__hash">{{ preset.hash }}</span>
                <button class="preset-row__remove" @click="removePreset(preset._id)" title="Remove preset">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            </div>
            <div class="preset-add">
              <input
                v-model="newPresetName"
                class="setting-input preset-add__input"
                placeholder="Name"
                @keydown.enter="addPreset"
              />
              <input
                v-model="newPresetIcon"
                class="setting-input preset-add__input"
                placeholder="fa-icon-name"
                @keydown.enter="addPreset"
              />
              <button class="modal__btn preset-add__btn" @click="addPreset" :disabled="!newPresetName.trim() || !newPresetIcon.trim()">
                <i class="fas fa-plus"></i> Save current view
              </button>
            </div>
          </div>

          <p v-if="error" class="modal__error">{{ error }}</p>
        </div>

        <div class="modal__footer">
          <button class="modal__btn modal__btn--danger" @click="removeDuplicates" :disabled="saving || deduping">
            {{ deduping ? 'Removing duplicates...' : 'Remove duplicates' }}
          </button>
          <button class="modal__btn" @click="close" :disabled="saving">Cancel</button>
          <button class="modal__btn modal__btn--primary" @click="save" :disabled="saving || !hasChanges">
            {{ saving ? 'Saving...' : 'Save settings' }}
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
  z-index: 1300;
}

.modal {
  width: min(760px, 96vw);
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
  gap: 12px;
  overflow: auto;
}

.setting-row {
  display: flex;
  gap: 10px;
  align-items: center;
}

.setting-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-input {
  width: 100%;
  background: #111;
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.setting-help {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
}

.setting-help summary {
  cursor: pointer;
  color: var(--text-secondary);
}

.setting-code {
  margin-top: 8px;
  padding: 10px;
  border-radius: 6px;
  background: #111;
  border: 1px solid rgba(255, 255, 255, 0.1);
  white-space: pre-wrap;
}

.modal__error {
  margin: 0;
  color: #ff7070;
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

.modal__btn--danger {
  margin-right: auto;
  background: rgba(220, 70, 70, 0.22);
  color: #ffd6d6;
}

.setting-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.85rem;
}

.preset-row i:first-child {
  width: 16px;
  text-align: center;
  color: var(--icon-ui);
}

.preset-row__name {
  color: var(--text-primary);
}

.preset-row__hash {
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.preset-row__remove {
  color: var(--icon-ui);
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
}

.preset-row__remove:hover {
  color: #ff7070;
}

.preset-add {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}

.preset-add__input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px !important;
  font-size: 0.85rem !important;
}

.preset-add__btn {
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
