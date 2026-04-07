"use client";

import { useEffect } from "react";
import ClientCostAnalysis from "@/components/client/ClientCostAnalysis";
import { useClientStore } from "@/stores/clientStore";
import { EMPTY_STATUS } from "@/lib/constants";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

interface PageProps {
  params: { clientId: string };
}

export default function CostsPage({ params }: PageProps) {
  const { clientId } = params;
  const { dataMap, setStatus, setSnapshots } = useClientStore();
  const data = dataMap[clientId];

  useEffect(() => {
    fetch(`/api/clients/${clientId}/snapshots?hours=168`)
      .then((r) => r.json())
      .then((d) => setSnapshots(clientId, d.snapshots ?? []))
      .catch(() => {});

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
    <ClientCostAnalysis
      status={data?.status ?? EMPTY_STATUS}
      snapshots={data?.snapshots ?? []}
      loading={data?.loading ?? true}
    />
  );
}
