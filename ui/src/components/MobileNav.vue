<script setup lang="ts">
import { computed } from 'vue';
import { useTaskStore } from '../stores/taskStore';

const props = defineProps<{ hiddenSlugs: Set<string> }>();
const emit = defineEmits<{ (e: 'toggle', slug: string): void }>();

const store = useTaskStore();

const sections = computed(() => store.sortedSections);
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
  </nav>
</template>

<style scoped>
.section-nav {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
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

@media (max-width: 768px) {
  .section-nav {
    bottom: 12px;
  }
}
</style>
