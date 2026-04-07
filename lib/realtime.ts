"use client";

import { createBrowserClient } from "./supabase";
import type { ClientAlert, Snapshot, FullStatus, SystemInfo } from "./types";

export interface ClientStoreUpdater {
  setStatus: (clientId: string, fullStatus: FullStatus, systemInfo: SystemInfo) => void;
}

export interface AlertStoreUpdater {
  addAlert: (alert: ClientAlert) => void;
}

/**
 * 특정 고객사의 Supabase Realtime 구독을 설정합니다.
 * snapshots INSERT → clientStore 업데이트
 * alerts INSERT → alertStore 업데이트
 * @returns cleanup 함수
 */
export function subscribeToClient(
  clientId: string,
  clientStore: ClientStoreUpdater,
  alertStore: AlertStoreUpdater
) {
  const supabase = createBrowserClient();

  const snapChannel = supabase
    .channel(`snap-${clientId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "snapshots",
        filter: `client_id=eq.${clientId}`,
      },
      (payload) => {
        const row = payload.new as Snapshot;
        if (row.full_status && row.system_info) {
          clientStore.setStatus(clientId, row.full_status as FullStatus, row.system_info as SystemInfo);
        }
      }
    )
    .subscribe();

  const alertChannel = supabase
    .channel(`alert-${clientId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "alerts",
        filter: `client_id=eq.${clientId}`,
      },
      (payload) => {
        alertStore.addAlert(payload.new as ClientAlert);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(snapChannel);
    supabase.removeChannel(alertChannel);
  };
}
