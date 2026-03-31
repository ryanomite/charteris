<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import { useWebSocket } from '../composables/useWebSocket';
import SectionPanel from '../components/SectionPanel.vue';
import MobileNav from '../components/MobileNav.vue';
import TaskEditModal from '../components/TaskEditModal.vue';
import type { ICard } from '../types';

const store = useTaskStore();
const editingCard = ref<ICard | null>(null);
const hiddenSlugs = ref(new Set<string>());

function openCard(card: ICard) {
  editingCard.value = card;
}

function isSectionVisible(slug: string) {
  return !hiddenSlugs.value.has(slug);
}

function toggleSection(slug: string) {
  const next = new Set(hiddenSlugs.value);
  if (next.has(slug)) {
    next.delete(slug);
  } else {
    next.add(slug);
  }
  hiddenSlugs.value = next;
}

useKeyboardShortcuts(openCard);
const { connected } = useWebSocket();

onMounted(() => {
  store.fetchDashboard();
});
</script>

<template>
  <div class="starfield" aria-hidden="true">
    <div class="stars stars--small"></div>
    <div class="stars stars--medium"></div>
    <div class="stars stars--large"></div>
  </div>
  <div class="app-shell" v-if="!store.loading">
    <header class="app-header">
      <img src="/charteris-white.svg" alt="Charteris" class="app-header__logo" />
    </header>
    <div class="dashboard">
      <SectionPanel
        v-for="section in store.sortedSections"
        v-show="isSectionVisible(section.slug)"
        :key="section._id"
        :section="section"
        @open-card="openCard"
      />
    </div>
  </div>
  <div class="dashboard-loading" v-else>
    <i class="fas fa-spinner fa-spin"></i> Loading...
  </div>
  <MobileNav :hiddenSlugs="hiddenSlugs" @toggle="toggleSection" />
  <TaskEditModal :card="editingCard" @close="editingCard = null" />
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  display: flex;
  align-items: center;
  padding: 10px 16px 0;
  flex-shrink: 0;
}

.app-header__logo {
  height: 56px;
  opacity: 0.85;
}

.dashboard {
  display: flex;
  flex: 1;
  gap: var(--gap-main);
  padding: var(--gap-main);
  overflow: hidden;
  min-height: 0;
}

.dashboard-loading {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 1.2rem;
  gap: 8px;
  position: relative;
  z-index: 1;
}

/* Responsive: mobile stacks vertically */
@media (max-width: 768px) {
  .app-shell {
    height: auto;
    min-height: 100vh;
  }

  .dashboard {
    flex-direction: column;
    overflow: visible;
    padding-bottom: 72px; /* space for mobile nav */
  }
}

/* Star field effect */
.starfield {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.app-shell {
  position: relative;
  z-index: 1;
}

.stars {
  position: absolute;
  inset: 0;
  background-repeat: repeat;
  animation: twinkle 8s ease-in-out infinite alternate;
}

.stars--small {
  background-image:
    radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.3), transparent),
    radial-gradient(1px 1px at 80px 120px, rgba(255,255,255,0.25), transparent),
    radial-gradient(1px 1px at 160px 60px, rgba(255,255,255,0.2), transparent),
    radial-gradient(1px 1px at 240px 180px, rgba(255,255,255,0.3), transparent),
    radial-gradient(1px 1px at 320px 90px, rgba(255,255,255,0.15), transparent),
    radial-gradient(1px 1px at 400px 200px, rgba(255,255,255,0.25), transparent),
    radial-gradient(1px 1px at 50px 250px, rgba(255,255,255,0.2), transparent),
    radial-gradient(1px 1px at 180px 300px, rgba(255,255,255,0.3), transparent),
    radial-gradient(1px 1px at 350px 280px, rgba(255,255,255,0.15), transparent),
    radial-gradient(1px 1px at 450px 50px, rgba(255,255,255,0.25), transparent);
  background-size: 500px 350px;
}

.stars--medium {
  background-image:
    radial-gradient(1.5px 1.5px at 100px 150px, rgba(255,255,255,0.4), transparent),
    radial-gradient(1.5px 1.5px at 300px 80px, rgba(255,255,255,0.35), transparent),
    radial-gradient(1.5px 1.5px at 200px 250px, rgba(255,255,255,0.3), transparent),
    radial-gradient(1.5px 1.5px at 450px 180px, rgba(255,255,255,0.4), transparent),
    radial-gradient(1.5px 1.5px at 50px 320px, rgba(255,255,255,0.25), transparent),
    radial-gradient(1.5px 1.5px at 380px 340px, rgba(255,255,255,0.35), transparent);
  background-size: 550px 400px;
  animation-delay: -3s;
  animation-duration: 12s;
}

.stars--large {
  background-image:
    radial-gradient(2px 2px at 150px 200px, rgba(255,255,255,0.5), transparent),
    radial-gradient(2px 2px at 400px 100px, rgba(255,255,255,0.45), transparent),
    radial-gradient(2px 2px at 250px 350px, rgba(255,255,255,0.4), transparent);
  background-size: 600px 450px;
  animation-delay: -5s;
  animation-duration: 16s;
}

@keyframes twinkle {
  0% { opacity: 0.6; }
  100% { opacity: 1; }
}
</style>
