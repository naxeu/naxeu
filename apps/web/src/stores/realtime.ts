import { defineStore } from "pinia";
import { ref } from "vue";
import type { RealtimeEvent } from "@naxeu/shared";
import { getToken, wsUrl } from "@/api/client";

/**
 * Maintains the realtime WebSocket connection. The PWA receives only minimal
 * event envelopes and reacts by refetching details from the REST API. Views
 * watch `lastEvent` to know when to refresh.
 */
export const useRealtimeStore = defineStore("realtime", () => {
  const connected = ref(false);
  const lastEvent = ref<RealtimeEvent | null>(null);
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    const token = getToken();
    if (!token || socket) return;
    socket = new WebSocket(`${wsUrl()}/ws?token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
      connected.value = true;
    };
    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as RealtimeEvent & { type?: string };
        if (data && (data as { entityType?: string }).entityType) {
          lastEvent.value = data;
        }
      } catch {
        /* ignore */
      }
    };
    socket.onclose = () => {
      connected.value = false;
      socket = null;
      // Auto-reconnect with a small delay.
      if (getToken()) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    };
    socket.onerror = () => socket?.close();
  }

  function disconnect(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.close();
    socket = null;
    connected.value = false;
  }

  return { connected, lastEvent, connect, disconnect };
});
