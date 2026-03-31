<script setup lang="ts">
import { computed } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import VerticalList from './VerticalList.vue';
import type { ISection, ICard } from '../types';

const props = defineProps<{ section: ISection }>();
const emit = defineEmits<{ (e: 'openCard', card: ICard): void }>();
const store = useTaskStore();

const sectionLists = computed(() => store.listsForSection(props.section._id));

const bgVar = computed(() => {
  const map: Record<string, string> = {
    inbox: 'var(--bg-section-inbox)',
    planning: 'var(--bg-section-planning)',
    board: 'var(--bg-section-board)',
  };
  return map[props.section.slug] || 'var(--bg-section-board)';
});

const sectionClass = computed(() => `section section--${props.section.slug}`);
</script>

<template>
  <section :class="sectionClass" :style="{ background: bgVar }">
    <div class="section__header">
      <div class="section__title">
        <i :class="['fas', section.icon]"></i>
        <span>{{ section.name }}</span>
      </div>
      <button class="section__menu" title="Section menu">
        <i class="fas fa-ellipsis-h"></i>
      </button>
    </div>
    <div class="section__body">
      <VerticalList
        v-for="list in sectionLists"
        :key="list._id"
        :list="list"
        :section="section"
        @open-card="(c: ICard) => emit('openCard', c)"
      />
    </div>
  </section>
</template>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-section);
  overflow: hidden;
  min-height: 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 40px rgba(0, 0, 0, 0.2);
}

.section--inbox {
}

.section--planning {
}

.section--board {
  flex: 1;
  min-width: 300px;
}

.section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  flex-shrink: 0;
}

.section__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 1rem;
}

.section__title i {
  color: var(--text-primary);
}

.section__menu {
  color: var(--icon-ui);
  padding: 4px 8px;
  border-radius: 4px;
  transition: background var(--transition-default);
}

.section__menu:hover {
  background: rgba(255, 255, 255, 0.1);
}

.section__body {
  display: flex;
  gap: var(--gap-main);
  padding: 0 12px 12px;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
  min-height: 0;
  align-items: flex-start;
}

/* Inbox: single list, no horizontal scroll */
.section--inbox .section__body {
  overflow-x: hidden;
}

/* Planning: exactly 2 lists, no horizontal scroll */
.section--planning .section__body {
  overflow-x: hidden;
}

/* Mobile */
@media (max-width: 768px) {
  .section--inbox,
  .section--planning,
  .section--board {
    width: 100%;
    min-width: 100%;
  }
}
</style>
