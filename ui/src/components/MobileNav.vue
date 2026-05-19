<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import type { ISection, IList } from '../types';

const props = defineProps<{ hiddenSlugs: Set<string>; modelValue?: string; statsVisible?: boolean }>();
const emit = defineEmits<{
  (e: 'toggle', slug: string): void;
  (e: 'openImport', payload?: { listId?: string }): void;
  (e: 'openGlobalSettings'): void;
  (e: 'update:modelValue', value: string): void;
  (e: 'toggle-stats'): void;
}>();

const store = useTaskStore();
const sections = computed(() => {
  return store.sortedSections.filter((s: ISection) => {
    if (s.slug !== 'inbox') return true;
    const inboxLists = store.listsForSection(s._id);
    const draftList = inboxLists.find((l: IList) => l.name === 'Draft');
    return draftList ? store.cardsForList(draftList._id).length > 0 : false;
  });
});

const settingsOpen = ref(false);
const filterOpen = ref(false);
const filterInputRef = ref<HTMLInputElement | null>(null);
const runtimeInfo = (window as any).__CHARTERIS__ || {};
const buildVersion = runtimeInfo.version || 'dev';
const buildCommit = runtimeInfo.commit || '';
const buildDisplay = buildCommit ? `v${buildVersion} ${buildCommit}` : `v${buildVersion}`;

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value;
}

function closeSettings() {
  settingsOpen.value = false;
}

function toggleFilter() {
  filterOpen.value = !filterOpen.value;
  if (filterOpen.value) {
    nextTick(() => filterInputRef.value?.focus());
  } else {
    emit('update:modelValue', '');
  }
}

function closeFilter() {
  filterOpen.value = false;
  emit('update:modelValue', '');
}

function clearFilter() {
  emit('update:modelValue', '');
  if (filterOpen.value) {
    nextTick(() => filterInputRef.value?.focus());
  }
}

async function archiveAllCompleted() {
  closeSettings();
  if (!confirm('Archive all completed tasks?')) return;
  await store.archiveAllCompleted();
}

function displaySectionName(name: string, slug: string) {
  return slug === 'planning' ? 'Counter' : name;
}

function openGlobalImport() {
  closeSettings();
  emit('openImport');
}

async function toggleHideCommittedCards() {
  closeSettings();
  await store.updateGlobalSettings({ hideCommittedCards: !store.globalSettings.hideCommittedCards });
}

function openGlobalSettings() {
  closeSettings();
  emit('openGlobalSettings');
}
</script>

<template>
  <nav class="section-nav">
    <button
      v-for="section in sections"
      :key="section._id"
      :class="['section-nav__btn', { 'section-nav__btn--hidden': hiddenSlugs.has(section.slug) }]"
      @click="emit('toggle', section.slug)"
      :title="hiddenSlugs.has(section.slug) ? `Show ${displaySectionName(section.name, section.slug)}` : `Hide ${displaySectionName(section.name, section.slug)}`"
    >
      <i :class="['fas', section.icon || 'fa-folder']"></i>
    </button>

    <!-- Stats toggle -->
    <button
      class="section-nav__btn"
      :class="{ 'section-nav__btn--active': statsVisible }"
      title="Statistics"
      @click="emit('toggle-stats')"
    >
      <i class="fas fa-chart-line"></i>
    </button>

    <!-- Filter -->
    <div class="section-nav__filter-wrap">
      <button
        class="section-nav__btn"
        :class="{ 'section-nav__btn--active': filterOpen || !!modelValue }"
        title="Filter"
        @click="toggleFilter"
      >
        <i class="fas fa-search"></i>
      </button>
      <input
        v-if="filterOpen"
        ref="filterInputRef"
        class="section-nav__filter-input"
        type="text"
        placeholder="Filter..."
        :value="modelValue"
        @input="(e) => emit('update:modelValue', (e.target as HTMLInputElement).value)"
        @keydown.escape="closeFilter"
        @keydown.enter="filterOpen = false"
      />
      <button
        v-if="filterOpen || modelValue"
        class="section-nav__btn"
        title="Clear filter"
        @click="clearFilter"
      >
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Settings hamburger -->
    <div class="section-nav__settings-wrap" @keydown.escape="closeSettings">
      <button
        class="section-nav__btn"
        :aria-expanded="settingsOpen"
        aria-haspopup="menu"
        title="Menu"
        @click="toggleSettings"
      >
        <i class="fas fa-bars"></i>
      </button>
      <ul v-if="settingsOpen" class="settings-dropdown" role="menu" @click.stop>
        <li role="none">
          <button
            role="menuitem"
            class="settings-dropdown__item"
            @click="store.showArchived = !store.showArchived; closeSettings()"
          >
            <i :class="['fas', store.showArchived ? 'fa-eye-slash' : 'fa-eye']"></i>
            {{ store.showArchived ? 'Hide archived tasks' : 'Show archived tasks' }}
          </button>
        </li>
        <li role="none">
          <button
            role="menuitem"
            class="settings-dropdown__item"
            @click="store.showArchivedLists = !store.showArchivedLists; closeSettings()"
          >
            <i :class="['fas', store.showArchivedLists ? 'fa-eye-slash' : 'fa-eye']"></i>
            {{ store.showArchivedLists ? 'Hide archived lists' : 'Show archived lists' }}
          </button>
        </li>
        <li role="none">
          <button role="menuitem" class="settings-dropdown__item" @click="toggleHideCommittedCards">
            <i :class="['fas', store.globalSettings.hideCommittedCards ? 'fa-eye-slash' : 'fa-eye']"></i>
            {{ store.globalSettings.hideCommittedCards ? 'Show committed cards' : 'Hide committed cards' }}
          </button>
        </li>
        <li role="none">
          <button role="menuitem" class="settings-dropdown__item" @click="openGlobalSettings">
            <i class="fas fa-sliders-h"></i>
            Global settings
          </button>
        </li>
        <li role="none">
          <button role="menuitem" class="settings-dropdown__item" @click="archiveAllCompleted">
            <i class="fas fa-archive"></i>
            Archive completed tasks
          </button>
        </li>
        <li role="none">
          <button role="menuitem" class="settings-dropdown__item" @click="openGlobalImport">
            <i class="fas fa-file-import"></i>
            Import tasks
          </button>
        </li>
        <li role="none" class="settings-dropdown__meta-row">
          <span class="settings-dropdown__meta">{{ buildDisplay }}</span>
        </li>
      </ul>
      <div v-if="settingsOpen" class="settings-dropdown__backdrop" @click="closeSettings"></div>
    </div>
  </nav>
</template>

<style scoped>
.section-nav {
  position: fixed;
  top: 10px;
  right: var(--gap-main);
  display: flex;
  gap: 4px;
  background: rgba(30, 30, 30, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 6px 8px;
  z-index: 100;
}

.section-nav__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--text-primary);
  border-radius: 8px;
  font-size: 1rem;
  transition: background var(--transition-default), color var(--transition-default), opacity var(--transition-default);
}

.section-nav__btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.section-nav__btn--hidden {
  opacity: 0.35;
}

.section-nav__btn--active {
  background: rgba(0, 255, 255, 0.15);
  color: #00ffff;
}

.section-nav__filter-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.section-nav__filter-input {
  width: 140px;
  height: 36px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 0 10px;
  font-size: 0.875rem;
  outline: none;
  transition: border-color var(--transition-default);
}

.section-nav__filter-input:focus {
  border-color: rgba(0, 255, 255, 0.5);
}

.section-nav__filter-input::placeholder {
  color: var(--text-secondary);
}

.section-nav__settings-wrap {
  position: relative;
}

.settings-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 4px;
  list-style: none;
  z-index: 200;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.settings-dropdown__item {
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
  white-space: nowrap;
}

.settings-dropdown__item:hover,
.settings-dropdown__item:focus {
  background: rgba(255, 255, 255, 0.08);
  outline: none;
}

.settings-dropdown__item i {
  width: 16px;
  text-align: center;
  color: var(--icon-ui);
}

.settings-dropdown__backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
}

.settings-dropdown__meta-row {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 4px;
  padding: 8px 12px 4px;
}

.settings-dropdown__meta {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

@media (max-width: 768px) {
  .section-nav {
    top: 10px;
    right: var(--gap-main);
  }
}
</style>
