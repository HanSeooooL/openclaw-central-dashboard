"use client";

import { useEffect } from "react";
import { subscribeToClient } from "@/lib/realtime";
import { useClientStore } from "@/stores/clientStore";
import { useAlertStore } from "@/stores/alertStore";

export default function ClientRealtimeProvider({ clientId }: { clientId: string }) {
  const { setStatus } = useClientStore();
  const alertStore = useAlertStore();

  useEffect(() => {
    const cleanup = subscribeToClient(clientId, { setStatus }, alertStore);
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return null;
}
