"use client";

import { create } from "zustand";
import type { FullStatus, SystemInfo, Client, Snapshot } from "@/lib/types";

interface ClientData {
  status: FullStatus | null;
  systemInfo: SystemInfo | null;
  snapshots: Snapshot[];
  loading: boolean;
  error: string | null;
  lastSeen: string | null;
}

interface ClientStoreState {
  // 고객사 목록
  clients: (Client & { latestSnapshot: Snapshot | null })[];
  clientsLoading: boolean;

  // 고객사별 상세 데이터 (clientId → data)
  dataMap: Record<string, ClientData>;

  // Actions
  setClients: (clients: (Client & { latestSnapshot: Snapshot | null })[]) => void;
  setClientsLoading: (loading: boolean) => void;
  updateClientSnapshot: (clientId: string, snapshot: Snapshot) => void;
  setStatus: (clientId: string, fullStatus: FullStatus, systemInfo: SystemInfo) => void;
  setSnapshots: (clientId: string, snapshots: Snapshot[]) => void;
  setLoading: (clientId: string, loading: boolean) => void;
  setError: (clientId: string, error: string | null) => void;
  clearClient: (clientId: string) => void;
}

const defaultClientData = (): ClientData => ({
  status: null,
  systemInfo: null,
  snapshots: [],
  loading: true,
  error: null,
  lastSeen: null,
});

export const useClientStore = create<ClientStoreState>((set) => ({
  clients: [],
  clientsLoading: true,
  dataMap: {},

  setClients: (clients) => set({ clients, clientsLoading: false }),
  setClientsLoading: (loading) => set({ clientsLoading: loading }),
  updateClientSnapshot: (clientId, snapshot) =>
    set((state) => ({
      clients: state.clients.map((c) =>
        c.id === clientId ? { ...c, latestSnapshot: snapshot } : c
      ),
    })),

  setStatus: (clientId, fullStatus, systemInfo) =>
    set((state) => ({
      dataMap: {
        ...state.dataMap,
        [clientId]: {
          ...(state.dataMap[clientId] ?? defaultClientData()),
          status: fullStatus,
          systemInfo,
          loading: false,
          error: null,
          lastSeen: new Date().toISOString(),
        },
      },
    })),

  setSnapshots: (clientId, snapshots) =>
    set((state) => ({
      dataMap: {
        ...state.dataMap,
        [clientId]: {
          ...(state.dataMap[clientId] ?? defaultClientData()),
          snapshots,
          loading: false,
          error: null,
        },
      },
    })),

  setLoading: (clientId, loading) =>
    set((state) => ({
      dataMap: {
        ...state.dataMap,
        [clientId]: {
          ...(state.dataMap[clientId] ?? defaultClientData()),
          loading,
        },
      },
    })),

  setError: (clientId, error) =>
    set((state) => ({
      dataMap: {
        ...state.dataMap,
        [clientId]: {
          ...(state.dataMap[clientId] ?? defaultClientData()),
          error,
          loading: false,
        },
      },
    })),

  clearClient: (clientId) =>
    set((state) => {
      const { [clientId]: _, ...rest } = state.dataMap;
      return { dataMap: rest };
    }),
}));
