"use client";

import { create } from "zustand";
import type { ClientAlert } from "@/lib/types";

interface AlertWithClient extends ClientAlert {
  client_name?: string;
}

interface AlertStoreState {
  alerts: AlertWithClient[];
  unreadCount: number;

  setAlerts: (clientId: string, alerts: ClientAlert[]) => void;
  addAlert: (alert: ClientAlert) => void;
  markRead: (id: number) => void;
  markAllRead: (clientId?: string) => void;
  dismiss: (id: number) => void;
}

export const useAlertStore = create<AlertStoreState>((set, get) => ({
  alerts: [],
  unreadCount: 0,

  setAlerts: (clientId, newAlerts) => {
    set((state) => {
      // 해당 clientId의 기존 알림을 교체
      const others = state.alerts.filter((a) => a.client_id !== clientId);
      const combined = [...newAlerts, ...others];
      return {
        alerts: combined,
        unreadCount: combined.filter((a) => !a.read).length,
      };
    });
  },

  addAlert: (alert) => {
    set((state) => {
      const combined = [alert, ...state.alerts].slice(0, 200);
      return {
        alerts: combined,
        unreadCount: combined.filter((a) => !a.read).length,
      };
    });
  },

  markRead: (id) => {
    set((state) => {
      const alerts = state.alerts.map((a) =>
        a.id === id ? { ...a, read: true } : a
      );
      return { alerts, unreadCount: alerts.filter((a) => !a.read).length };
    });
  },

  markAllRead: (clientId) => {
    set((state) => {
      const alerts = state.alerts.map((a) =>
        !clientId || a.client_id === clientId ? { ...a, read: true } : a
      );
      return { alerts, unreadCount: alerts.filter((a) => !a.read).length };
    });
  },

  dismiss: (id) => {
    set((state) => {
      const alerts = state.alerts.filter((a) => a.id !== id);
      return { alerts, unreadCount: alerts.filter((a) => !a.read).length };
    });
  },
}));

// 특정 고객사의 미읽음 수 조회 헬퍼
export function getClientUnreadCount(state: AlertStoreState, clientId: string): number {
  return state.alerts.filter((a) => a.client_id === clientId && !a.read).length;
}
