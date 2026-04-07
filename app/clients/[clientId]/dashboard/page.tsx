"use client";

import { useState, useEffect } from "react";
import ClientDashboard from "@/components/client/ClientDashboard";
import { useClientStore } from "@/stores/clientStore";
import { EMPTY_STATUS, EMPTY_SYSTEM } from "@/lib/constants";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

interface PageProps {
  params: { clientId: string };
}

export default function DashboardPage({ params }: PageProps) {
  const { clientId } = params;
  const { dataMap, setStatus, setSnapshots } = useClientStore();
  const data = dataMap[clientId];

  useEffect(() => {
    // 스냅샷 초기 로드
    fetch(`/api/clients/${clientId}/snapshots?hours=168`)
      .then((r) => r.json())
      .then((d) => setSnapshots(clientId, d.snapshots ?? []))
      .catch(() => {});

    // 최신 스냅샷에서 status/systemInfo 초기화
    fetch(`/api/clients/${clientId}/snapshots?hours=1`)
      .then((r) => r.json())
      .then((d) => {
        const snaps: Snapshot[] = d.snapshots ?? [];
        const latest = snaps[snaps.length - 1];
        if (latest?.full_status && latest?.system_info) {
          setStatus(clientId, latest.full_status as FullStatus, latest.system_info as SystemInfo);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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
