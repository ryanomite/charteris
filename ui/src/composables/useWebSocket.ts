import { ref, onMounted, onUnmounted } from 'vue';
import { useTaskStore } from '../stores/taskStore';

const WS_RECONNECT_DELAY = 3000;

export function useWebSocket() {
  const store = useTaskStore();
  const connected = ref(false);
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function getWsUrl(): string {
    const rt = (window as any).__CHARTERIS__ || {};
    const apiBase = import.meta.env.VITE_API_BASE_URL || '';
    const token = rt.token || import.meta.env.VITE_API_TOKEN || '';

    let wsBase: string;
    if (apiBase) {
      wsBase = apiBase.replace(/^http/, 'ws');
    } else {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsBase = `${proto}//${window.location.host}`;
    }

    const url = new URL(wsBase);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }

  function connect() {
    if (stopped) return;
    try {
      ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        connected.value = true;
        console.log('[WS] Connected');
      };

      ws.onclose = () => {
        connected.value = false;
        console.log('[WS] Disconnected — reconnecting...');
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        ws?.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (stopped) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY);
  }

  function handleMessage(msg: { event: string; data: any }) {
    const { event, data } = msg;

    switch (event) {
      case 'task:created':
      case 'task:updated':
        store.upsertTask(data);
        break;
      case 'task:deleted':
        store.removeTask(data._id);
        break;

      case 'card:created':
      case 'card:updated':
      case 'card:moved':
      case 'card:reordered':
        store.upsertCard(data);
        break;
      case 'card:deleted':
        store.removeCard(data._id);
        break;

      case 'cards:bulk-updated':
        store.refreshListCards(data.listIds);
        break;

      case 'list:created':
      case 'list:updated':
      case 'list:reordered':
        store.upsertList(data);
        break;
      case 'list:deleted':
        store.removeList(data._id);
        break;

      case 'label:created':
      case 'label:updated':
        store.upsertLabel(data);
        break;
      case 'label:deleted':
        store.removeLabel(data._id);
        break;

      default:
        console.log('[WS] Unknown event:', event);
    }
  }

  function disconnect() {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  }

  onMounted(() => {
    connect();
  });

  onUnmounted(() => {
    disconnect();
  });

  return { connected };
}
