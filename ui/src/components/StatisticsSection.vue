<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import api from '../services/api';

interface StatsData {
  dates: string[];
  commitments: number[];
  completions: number[];
  percentages: number[];
}

const data = ref<StatsData | null>(null);
const loading = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function fetchStats() {
  loading.value = true;
  try {
    const { data: d } = await api.get<StatsData>('/stats');
    data.value = d;
  } catch (err) {
    console.error('Stats fetch failed:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchStats();
  pollTimer = setInterval(fetchStats, 3_600_000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

// SVG chart helpers
const CHART_W = 320;
const CHART_H = 90;
const PAD_X = 4;
const PAD_Y = 6;

function toPoints(values: number[], maxVal: number): string {
  if (values.length < 2 || maxVal === 0) return '';
  return values
    .map((v, i) => {
      const x = PAD_X + (i / (values.length - 1)) * (CHART_W - 2 * PAD_X);
      const y = PAD_Y + (1 - v / maxVal) * (CHART_H - 2 * PAD_Y);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const commitMaxVal = computed(() => {
  if (!data.value) return 1;
  return Math.max(1, ...data.value.commitments, ...data.value.completions);
});

const commitPoints = computed(() =>
  data.value ? toPoints(data.value.commitments, commitMaxVal.value) : ''
);
const completionPoints = computed(() =>
  data.value ? toPoints(data.value.completions, commitMaxVal.value) : ''
);
const percentPoints = computed(() =>
  data.value ? toPoints(data.value.percentages, 100) : ''
);

// Label every ~7 dates for x-axis ticks
const xLabels = computed(() => {
  if (!data.value) return [];
  const n = data.value.dates.length;
  const step = Math.ceil(n / 5);
  const result: { x: number; label: string }[] = [];
  for (let i = 0; i < n; i += step) {
    const x = PAD_X + (i / (n - 1)) * (CHART_W - 2 * PAD_X);
    result.push({ x, label: data.value.dates[i].slice(5) }); // MM-DD
  }
  return result;
});
</script>

<template>
  <section class="stats-section">
    <div class="stats-section__header">
      <div class="stats-section__title">
        <i class="fas fa-chart-line"></i>
        <span>Statistics</span>
      </div>
      <button class="stats-section__refresh" title="Refresh" @click="fetchStats" :disabled="loading">
        <i :class="['fas', loading ? 'fa-spinner fa-spin' : 'fa-sync-alt']"></i>
      </button>
    </div>

    <div class="stats-section__body">
    <div v-if="!data && !loading" class="stats-section__empty">No data yet.</div>

    <template v-if="data">
      <!-- Chart 1: Commitments + Completions -->
      <div class="stats-section__chart-wrap">
        <div class="stats-section__chart-label">Commitments &amp; Completions</div>
        <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="stats-section__chart" preserveAspectRatio="none">
          <polyline
            v-if="commitPoints"
            :points="commitPoints"
            fill="none"
            stroke="#ff8c00"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <polyline
            v-if="completionPoints"
            :points="completionPoints"
            fill="none"
            stroke="#32cd32"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </svg>
        <div class="stats-section__chart-legend">
          <span class="stats-section__legend-item stats-section__legend-item--commit">Commitments</span>
          <span class="stats-section__legend-item stats-section__legend-item--complete">Completions</span>
        </div>
      </div>

      <!-- Chart 2: Completion % -->
      <div class="stats-section__chart-wrap">
        <div class="stats-section__chart-label">Completion %</div>
        <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="stats-section__chart" preserveAspectRatio="none">
          <polyline
            v-if="percentPoints"
            :points="percentPoints"
            fill="none"
            stroke="#00ffff"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </svg>
        <div class="stats-section__x-axis">
          <span v-for="tick in xLabels" :key="tick.label" class="stats-section__x-tick">{{ tick.label }}</span>
        </div>
      </div>
    </template>
    </div>
  </section>
</template>

<style scoped>
.stats-section {
  display: flex;
  flex-direction: column;
  background: #02a0f022;
  border-radius: var(--radius-section);
  overflow: hidden;
  min-height: 0;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 40px rgba(0, 0, 0, 0.2);
  min-width: 220px;
  flex: 1 1 0;
}

.stats-section__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 16px 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 240px;
}

.stats-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  flex-shrink: 0;
}

.stats-section__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-primary);
}

.stats-section__refresh {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--icon-ui);
  font-size: 0.8rem;
  transition: background var(--transition-default);
}

.stats-section__refresh:hover {
  background: rgba(255, 255, 255, 0.08);
}

.stats-section__refresh:disabled {
  opacity: 0.5;
  cursor: default;
}

.stats-section__empty {
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-align: center;
  padding: 24px 0;
}

.stats-section__chart-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stats-section__chart-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.stats-section__chart {
  width: 100%;
  height: 90px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: block;
}

.stats-section__chart-legend {
  display: flex;
  gap: 12px;
  font-size: 0.72rem;
}

.stats-section__legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
}

.stats-section__legend-item::before {
  content: '';
  display: inline-block;
  width: 20px;
  height: 2px;
  border-radius: 1px;
}

.stats-section__legend-item--commit::before {
  background: #ff8c00;
}

.stats-section__legend-item--complete::before {
  background: #32cd32;
}

.stats-section__x-axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--text-secondary);
  padding: 0 2px;
}

.stats-section__x-tick {
  opacity: 0.7;
}
</style>
