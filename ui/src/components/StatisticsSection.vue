<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import api from '../services/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

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

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
  plugins: {
    legend: {
      labels: {
        color: '#a0a0a0',
        boxWidth: 20,
        boxHeight: 2,
        padding: 12,
        font: { size: 11 },
      },
    },
    tooltip: {
      backgroundColor: '#1e1e2e',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      titleColor: '#ffffff',
      bodyColor: '#a0a0a0',
    },
  },
  scales: {
    x: {
      ticks: {
        color: '#a0a0a0',
        maxRotation: 0,
        autoSkip: true,
        maxTicksLimit: 7,
        font: { size: 10 },
      },
      grid: { color: 'rgba(255,255,255,0.05)' },
    },
  },
};

const countChartData = computed(() => ({
  labels: data.value?.dates.map(d => d.slice(5)) ?? [],
  datasets: [
    {
      label: 'Commitments',
      data: data.value?.commitments ?? [],
      borderColor: '#ff8c00',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
    },
    {
      label: 'Completions',
      data: data.value?.completions ?? [],
      borderColor: '#32cd32',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
    },
  ],
}));

const countChartOptions = computed(() => ({
  ...baseChartOptions,
  scales: {
    ...baseChartOptions.scales,
    y: {
      ticks: {
        color: '#a0a0a0',
        font: { size: 10 },
        precision: 0,
      },
      grid: { color: 'rgba(255,255,255,0.05)' },
      beginAtZero: true,
    },
  },
}));

const percentChartData = computed(() => ({
  labels: data.value?.dates.map(d => d.slice(5)) ?? [],
  datasets: [
    {
      label: 'Completion %',
      data: data.value?.percentages ?? [],
      borderColor: '#00ffff',
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.3,
    },
  ],
}));

const percentChartOptions = computed(() => ({
  ...baseChartOptions,
  plugins: {
    ...baseChartOptions.plugins,
    legend: { display: false },
  },
  scales: {
    ...baseChartOptions.scales,
    y: {
      ticks: {
        color: '#a0a0a0',
        font: { size: 10 },
        callback: (v: number | string) => `${v}%`,
      },
      grid: { color: 'rgba(255,255,255,0.05)' },
      beginAtZero: true,
      max: 100,
    },
  },
}));
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
          <div class="stats-section__chart">
            <Line :data="countChartData" :options="(countChartOptions as any)" />
          </div>
        </div>

        <!-- Chart 2: Completion % -->
        <div class="stats-section__chart-wrap">
          <div class="stats-section__chart-label">Completion %</div>
          <div class="stats-section__chart">
            <Line :data="percentChartData" :options="(percentChartOptions as any)" />
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
  min-height: 500px;
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
  height: 180px;
  position: relative;
}
</style>
