<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTaskStore } from '../stores/taskStore';

const props = defineProps<{ hiddenSlugs: Set<string> }>();
const emit = defineEmits<{ (e: 'toggle', slug: string): void }>();

const store = useTaskStore();
const sections = computed(() => store.sortedSections);

const settingsOpen = ref(false);

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value;
}

function closeSettings() {
  settingsOpen.value = false;
}

async function archiveAllCompleted() {
  closeSettings();
  if (!confirm('Archive all completed tasks?')) return;
  await store.archiveAllCompleted();
}
</script>

<template>
  <nav class="section-nav">
    <button
      v-for="section in sections"
      :key="section._id"
      :class="['section-nav__btn', { 'section-nav__btn--hidden': hiddenSlugs.has(section.slug) }]"
      @click="emit('toggle', section.slug)"
      :title="hiddenSlugs.has(section.slug) ? `Show ${section.name}` : `Hide ${section.name}`"
    >
      <i :class="['fas', section.icon || 'fa-folder']"></i>
    </button>

    <!-- Settings gear -->
    <div class="section-nav__settings-wrap" @keydown.escape="closeSettings">
      <button
        class="section-nav__btn"
        :aria-expanded="settingsOpen"
        aria-haspopup="menu"
        title="Settings"
        @click="toggleSettings"
      >
        <i class="fas fa-cog"></i>
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
          <button role="menuitem" class="settings-dropdown__item" @click="archiveAllCompleted">
            <i class="fas fa-archive"></i>
            Archive completed tasks
          </button>
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

@media (max-width: 768px) {
  .section-nav {
    top: 10px;
    right: var(--gap-main);
  }
}
</style>
