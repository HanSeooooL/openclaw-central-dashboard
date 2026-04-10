"use client";

import ClientDashboard from "@/components/client/ClientDashboard";
import { useClientData } from "@/lib/hooks/useClientData";
import { ErrorState } from "@/components/shared/EmptyState";
import { EMPTY_STATUS, EMPTY_SYSTEM } from "@/lib/constants";

interface PageProps {
  params: { clientId: string };
}

export default function DashboardPage({ params }: PageProps) {
  const { clientId } = params;
  const { data, load } = useClientData(clientId, { withHistory: true });

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
