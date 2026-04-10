"use client";

import { useEffect, useCallback } from "react";
import ClientDashboard from "@/components/client/ClientDashboard";
import { useClientStore } from "@/stores/clientStore";
import { ErrorState } from "@/components/shared/EmptyState";
import { EMPTY_STATUS, EMPTY_SYSTEM } from "@/lib/constants";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

interface PageProps {
  params: { clientId: string };
}

export default function DashboardPage({ params }: PageProps) {
  const { clientId } = params;
  const { dataMap, setStatus, setSnapshots, setError } = useClientStore();
  const data = dataMap[clientId];

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/clients/${clientId}/snapshots?hours=168`).then((r) => r.json()),
      fetch(`/api/clients/${clientId}/snapshots?hours=1`).then((r) => r.json()),
    ])
      .then(([hist, recent]) => {
        setSnapshots(clientId, hist.snapshots ?? []);
        const snaps: Snapshot[] = recent.snapshots ?? [];
        const latest = snaps[snaps.length - 1];
        if (latest?.full_status && latest?.system_info) {
          setStatus(clientId, latest.full_status as FullStatus, latest.system_info as SystemInfo);
        } else {
          setError(clientId, null);
        }
      })
      .catch(() => setError(clientId, "스냅샷을 불러올 수 없습니다"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (data?.error) {
    return <ErrorState message={data.error} onRetry={load} />;
  }

  return (
    <ClientDashboard
      clientId={clientId}
      status={data?.status ?? EMPTY_STATUS}
      systemInfo={data?.systemInfo ?? EMPTY_SYSTEM}
      snapshots={data?.snapshots ?? []}
      loading={data?.loading ?? true}
    />
  );
}
