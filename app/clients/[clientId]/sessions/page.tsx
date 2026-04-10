"use client";

import ClientSessionList from "@/components/client/ClientSessionList";
import { useClientData } from "@/lib/hooks/useClientData";
import { ErrorState } from "@/components/shared/EmptyState";
import { EMPTY_STATUS } from "@/lib/constants";

interface PageProps {
  params: { clientId: string };
}

export default function SessionsPage({ params }: PageProps) {
  const { clientId } = params;
  const { data, load } = useClientData(clientId);

  if (data?.error) {
    return <ErrorState message={data.error} onRetry={load} />;
  }

  return <ClientSessionList status={data?.status ?? EMPTY_STATUS} />;
}
