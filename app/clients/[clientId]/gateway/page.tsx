"use client";

import ClientGatewayPanel from "@/components/client/ClientGatewayPanel";
import { useClientData } from "@/lib/hooks/useClientData";
import { ErrorState } from "@/components/shared/EmptyState";
import { EMPTY_STATUS } from "@/lib/constants";

interface PageProps {
  params: { clientId: string };
}

export default function GatewayPage({ params }: PageProps) {
  const { clientId } = params;
  const { data, load } = useClientData(clientId);

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
