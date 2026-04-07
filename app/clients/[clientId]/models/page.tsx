"use client";

import { useEffect } from "react";
import ClientModelsPanel from "@/components/client/ClientModelsPanel";
import { useClientStore } from "@/stores/clientStore";
import type { FullStatus, SystemInfo, Snapshot } from "@/lib/types";

const emptyStatus: FullStatus = {
  runtime_version: "...", os_label: "", gateway_online: false, gateway_url: "",
  gateway_host: "", gateway_ip: "", gateway_latency_ms: null, gateway_pid: null,
  gateway_service_running: false, gateway_uptime: "...", gateway_platform: "",
  channels: [], default_agent_id: "main", agents: [], session_count: 0,
  default_model: "unknown", default_context_tokens: 200000, sessions: [],
  tasks: { total: 0, active: 0, running: 0, succeeded: 0, failed: 0, timed_out: 0 },
  heartbeat_agents: [], memory_plugin_enabled: false, memory_plugin_slot: "",
  memory_files_count: 0, debug_bin: "", debug_status_error: null,
  debug_health_error: null, debug_gateway_error: null,
};

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

  return <ClientModelsPanel status={data?.status ?? emptyStatus} />;
}
