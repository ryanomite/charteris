<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import { useSelection } from '../composables/useSelection';
import VerticalList from './VerticalList.vue';
import api from '../services/api';
import type { ISection, ICard, IList } from '../types';

const props = defineProps<{ section: ISection }>();
const emit = defineEmits<{
  (e: 'openCard', card: ICard): void;
  (e: 'openImport', payload?: { listId?: string }): void;
}>();
const store = useTaskStore();
const { clearSelection } = useSelection();

const sectionLists = computed(() => store.listsForSection(props.section._id));
const menuOpen = ref(false);

const bgVar = computed(() => {
  const map: Record<string, string> = {
    inbox: 'var(--bg-section-inbox)',
    planning: 'var(--bg-section-planning)',
    board: 'var(--bg-section-board)',
  };
  return map[props.section.slug] || 'var(--bg-section-board)';
});

const sectionClass = computed(() => `section section--${props.section.slug}`);
const displaySectionName = computed(() => (props.section.slug === 'planning' ? 'Counter' : props.section.name));

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenu() {
  menuOpen.value = false;
}

async function addList() {
  closeMenu();
  const name = prompt('List name:');
  if (!name?.trim()) return;
  try {
    const { data } = await api.post('/lists', { name: name.trim(), sectionId: props.section._id });
    store.upsertList(data);
  } catch (err) {
    console.error('Add list failed:', err);
  }
}

async function moveAllToList(fromName: string, toName: string) {
  closeMenu();
  const fromList = sectionLists.value.find((l: IList) => l.name === fromName);
  const toList = sectionLists.value.find((l: IList) => l.name === toName);
  if (!fromList || !toList) return;

  const cards = store.cardsForList(fromList._id);
  const BATCH = 5;
  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = cards.slice(i, i + BATCH);
    await Promise.all(batch.map((card: ICard, idx: number) =>
      api.patch(`/cards/${card._id}/move`, {
        targetListId: toList._id,
        order: store.cardsForList(toList._id).length + idx,
      })
    ));
  }
  await store.refreshListCards([fromList._id, toList._id]);
}

async function adjourn() {
  try {
    const { data } = await api.post('/sections/planning/adjourn');
    await store.refreshListCards(data.listIds);
  } catch (err) {
    console.error('Adjourn failed:', err);
  }
}

async function cast() {
  try {
    const now = new Date();
    const { data } = await api.post('/sections/board/cast', {
      localHour: now.getHours(),
      localWeekday: now.getDay(),
    });
    await store.refreshListCards(data.listIds);
  } catch (err) {
    console.error('Cast failed:', err);
  }
}
</script>

<template>
  <section :class="sectionClass" :style="{ background: bgVar }">
    <div class="section__header">
      <div class="section__title">
        <i :class="['fas', section.icon]"></i>
        <span>{{ displaySectionName }}</span>
      </div>
      <div class="section__actions">
        <!-- Briefing: Adjourn button -->
        <button
          v-if="section.slug === 'planning'"
          class="section__action-btn"
          title="Adjourn: clear Today list"
          @click="adjourn"
        >
          <i class="fas fa-times-circle"></i>
          Adjourn
        </button>
        <!-- Briefing: Cast button -->
        <button
          v-if="section.slug === 'planning'"
          class="section__action-btn"
          title="Cast: pull overdue/priority tasks into Today"
          @click="cast"
        >
          <i class="fas fa-arrow-left"></i>
          Cast
        </button>
      </div>
      <div
        v-if="section.slug === 'board' || section.slug === 'planning'"
        class="section__menu-wrap"
        @keydown.escape="closeMenu"
      >
        <button
          class="section__menu"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
          :title="`${displaySectionName} menu`"
          @click="toggleMenu"
        >
          <i class="fas fa-ellipsis-h"></i>
        </button>
        <ul v-if="menuOpen" class="dropdown" role="menu" @click.stop>
          <template v-if="section.slug === 'board'">
            <li role="none">
              <button role="menuitem" class="dropdown__item" @click="addList">
                <i class="fas fa-plus"></i>
                Add new list
              </button>
            </li>
          </template>
          <template v-if="section.slug === 'planning'">
            <li role="none">
              <button role="menuitem" class="dropdown__item" @click="moveAllToList('Today', 'Next')">
                <i class="fas fa-arrow-right"></i>
                Move all to Next
              </button>
            </li>
            <li role="none">
              <button role="menuitem" class="dropdown__item" @click="moveAllToList('Next', 'Today')">
                <i class="fas fa-arrow-left"></i>
                Move all to Today
              </button>
            </li>
          </template>
        </ul>
        <div v-if="menuOpen" class="dropdown__backdrop" @click="closeMenu"></div>
      </div>
    </div>
    <div class="section__body" @click.self="clearSelection">
      <VerticalList
        v-for="list in sectionLists"
        :key="list._id"
        :list="list"
        :section="section"
        @open-card="(c: ICard) => emit('openCard', c)"
        @open-import="(payload?: { listId?: string }) => emit('openImport', payload)"
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

.section__menu-wrap {
  position: relative;
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

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 200px;
  background: #1e1e2e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 4px;
  list-style: none;
  z-index: 200;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.dropdown__item {
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
}

.dropdown__item:hover,
.dropdown__item:focus {
  background: rgba(255, 255, 255, 0.08);
  outline: none;
}

.dropdown__item i {
  width: 16px;
  text-align: center;
  color: var(--icon-ui);
}

.dropdown__backdrop {
  position: fixed;
  inset: 0;
  z-index: 199;
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
  scroll-snap-type: x proximity;
  scroll-padding-left: calc(var(--gap-main)*1);
}

/* Inbox: single list, no horizontal scroll */
.section__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  margin-right: 6px;
}

.section__action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.15);
  transition: background var(--transition-default), box-shadow var(--transition-default);
}

.section__action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.section__action-btn i {
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.75rem;
}

.section__action-btn:hover {
  opacity: 0.85;
}

/* Planning: exactly 2 lists, no horizontal scroll on desktop (wide screens only) */
@media (min-width: 1025px) {
  .section--planning .section__body {
    overflow-x: hidden;
  }
}

/* Tablet + mobile */
@media (max-width: 1024px) {
  .section--inbox,
  .section--planning,
  .section--board {
    width: 100%;
    min-width: 100%;
  }

  .section--planning .section__body {
    overflow-x: auto;
  }
}
</style>
