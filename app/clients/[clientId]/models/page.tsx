"use client";

import { useEffect } from "react";
import ClientModelsPanel from "@/components/client/ClientModelsPanel";
import { useClientStore } from "@/stores/clientStore";
import { EMPTY_STATUS } from "@/lib/constants";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

interface PageProps {
  params: { clientId: string };
}

export default function ModelsPage({ params }: PageProps) {
  const { clientId } = params;
  const { dataMap, setStatus } = useClientStore();
  const data = dataMap[clientId];

  useEffect(() => {
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

  return <ClientModelsPanel status={data?.status ?? EMPTY_STATUS} />;
}
