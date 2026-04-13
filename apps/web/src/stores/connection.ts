import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConnectionStatus } from '@openclaw-dashboard/shared';

interface ConnectionState {
  status: ConnectionStatus;
  deviceId: string | null;
  gatewayUrl: string;
  lastError: string | null;
  connectedAt: number | null;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setDeviceId: (id: string | null) => void;
  setGatewayUrl: (url: string) => void;
  setError: (error: string | null) => void;
  setConnected: () => void;
  disconnect: () => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      status: 'disconnected',
      deviceId: null,
      gatewayUrl: 'ws://localhost:18789',
      lastError: null,
      connectedAt: null,

      setStatus: (status) => set({ status, lastError: status === 'error' ? null : undefined }),
      setDeviceId: (deviceId) => set({ deviceId }),
      setGatewayUrl: (gatewayUrl) => set({ gatewayUrl }),
      setError: (lastError) => set({ lastError, status: 'error' }),
      setConnected: () => set({ status: 'connected', connectedAt: Date.now(), lastError: null }),
      disconnect: () => set({ status: 'disconnected', connectedAt: null }),
    }),
    {
      name: 'openclaw-connection',
      partialize: (state) => ({
        gatewayUrl: state.gatewayUrl,
        deviceId: state.deviceId,
      }),
    }
  )
);
