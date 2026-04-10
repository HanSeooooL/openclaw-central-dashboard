"use client";

import { useEffect, useCallback } from "react";
import { useClientStore } from "@/stores/clientStore";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

interface UseClientDataOptions {
  withHistory?: boolean;
}

export function useClientData(clientId: string, opts?: UseClientDataOptions) {
  const { dataMap, setStatus, setSnapshots, setError } = useClientStore();
  const data = dataMap[clientId];
  const withHistory = opts?.withHistory ?? false;

  const load = useCallback(() => {
    const fetches: Promise<{ snapshots?: Snapshot[] }>[] = [];

    if (withHistory) {
      fetches.push(fetch(`/api/clients/${clientId}/snapshots?hours=168`).then((r) => r.json()));
    }
    fetches.push(fetch(`/api/clients/${clientId}/snapshots?hours=1`).then((r) => r.json()));

    Promise.all(fetches)
      .then((results) => {
        if (withHistory) {
          setSnapshots(clientId, results[0].snapshots ?? []);
        }
        const recent = withHistory ? results[1] : results[0];
        const snaps: Snapshot[] = recent.snapshots ?? [];
        const latest = snaps[snaps.length - 1];
        if (latest?.full_status && latest?.system_info) {
          setStatus(clientId, latest.full_status as FullStatus, latest.system_info as SystemInfo);
        } else {
          setError(clientId, null);
        }
      })
      .catch(() => setError(clientId, "데이터를 불러올 수 없습니다"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, withHistory]);

  useEffect(() => { load(); }, [load]);

  return { data, load };
}
