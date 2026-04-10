"use client";

import { useEffect, useCallback } from "react";
import ClientGatewayPanel from "@/components/client/ClientGatewayPanel";
import { useClientStore } from "@/stores/clientStore";
import { ErrorState } from "@/components/shared/EmptyState";
import { EMPTY_STATUS } from "@/lib/constants";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

interface PageProps {
  params: { clientId: string };
}

export default function GatewayPage({ params }: PageProps) {
  const { clientId } = params;
  const { dataMap, setStatus, setError } = useClientStore();
  const data = dataMap[clientId];

  const load = useCallback(() => {
    fetch(`/api/clients/${clientId}/snapshots?hours=1`)
      .then((r) => r.json())
      .then((d) => {
        const snaps: Snapshot[] = d.snapshots ?? [];
        const latest = snaps[snaps.length - 1];
        if (latest?.full_status && latest?.system_info) {
          setStatus(clientId, latest.full_status as FullStatus, latest.system_info as SystemInfo);
        } else {
          setError(clientId, null);
        }
      })
      .catch(() => setError(clientId, "게이트웨이 데이터를 불러올 수 없습니다"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (data?.error) {
    return <ErrorState message={data.error} onRetry={load} />;
  }

  return (
    <ClientGatewayPanel
      clientId={clientId}
      status={data?.status ?? EMPTY_STATUS}
    />
  );
}
