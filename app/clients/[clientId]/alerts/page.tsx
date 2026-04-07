"use client";

import { useEffect, useState } from "react";
import ClientAlertsPanel from "@/components/client/ClientAlertsPanel";
import type { ClientAlert } from "@/lib/types";

interface PageProps {
  params: { clientId: string };
}

export default function AlertsPage({ params }: PageProps) {
  const { clientId } = params;
  const [alerts, setAlerts] = useState<ClientAlert[]>([]);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/alerts`)
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts ?? []))
      .catch(() => {});
  }, [clientId]);

  return <ClientAlertsPanel clientId={clientId} initialAlerts={alerts} />;
}
