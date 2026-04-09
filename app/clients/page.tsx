import ClientsGrid from "@/components/overview/ClientsGrid";
import { createAuthedServerClient, isInternalOperator } from "@/lib/supabase-server";
import type { Client, Snapshot } from "@/lib/types";

async function getClients(): Promise<(Client & { latestSnapshot: Snapshot | null })[]> {
  try {
    const supabase = await createAuthedServerClient();
    const { data } = await supabase.rpc("get_clients_with_latest_snapshot");
    return (data ?? []).map((row: {
      id: string; name: string; slug: string;
      created_at: string; notes: string | null;
      latest_snapshot: Snapshot | null;
    }) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      created_at: row.created_at,
      notes: row.notes,
      latestSnapshot: row.latest_snapshot ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function ClientsPage() {
  const [clients, isOperator] = await Promise.all([
    getClients(),
    isInternalOperator(),
  ]);
  return <ClientsGrid initialClients={clients} isOperator={isOperator} />;
}
