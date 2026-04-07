import ClientsGrid from "@/components/overview/ClientsGrid";
import type { Client, Snapshot } from "@/lib/types";

async function getClients(): Promise<(Client & { latestSnapshot: Snapshot | null })[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/clients`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.clients ?? [];
  } catch {
    return [];
  }
}

export default async function ClientsPage() {
  const clients = await getClients();
  return <ClientsGrid initialClients={clients} />;
}
