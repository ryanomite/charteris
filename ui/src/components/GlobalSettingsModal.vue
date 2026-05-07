<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useTaskStore } from '../stores/taskStore';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
const store = useTaskStore();

const saving = ref(false);
const error = ref('');
const hideCommittedCards = ref(false);
const castingRulesToday = ref('');
const castingRulesNext = ref('');

const hasChanges = computed(() => (
  hideCommittedCards.value !== store.globalSettings.hideCommittedCards
  || castingRulesToday.value !== store.globalSettings.castingRulesToday
  || castingRulesNext.value !== store.globalSettings.castingRulesNext
));

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    error.value = '';
    hideCommittedCards.value = store.globalSettings.hideCommittedCards;
    castingRulesToday.value = store.globalSettings.castingRulesToday;
    castingRulesNext.value = store.globalSettings.castingRulesNext;
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
    });
    emit('close');
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Failed to save settings';
  } finally {
    saving.value = false;
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
            <p>Available helpers: <code>hasLabel(name)</code>, <code>inList(name)</code>, <code>regex(pattern, value, flags)</code>, <code>isDueToday()</code>, <code>isDueTomorrow()</code>, <code>isOverdue()</code>, <code>daysUntilDue()</code>, <code>today()</code>, <code>tomorrow()</code></p>
            <p>Examples:</p>
            <pre class="setting-code">priority === 1 || isOverdue() || isDueToday()

hasLabel('Work') && !completed && (isDueToday() || isDueTomorrow())

regex('security|audit', title) && inList('Backlog')</pre>
          </details>

          <p v-if="error" class="modal__error">{{ error }}</p>
        </div>

        <div class="modal__footer">
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
</style>
