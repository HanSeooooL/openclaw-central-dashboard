import { notFound } from "next/navigation";
import ClientSidebar from "@/components/client/ClientSidebar";
import { createServiceClient } from "@/lib/supabase";

interface ClientLayoutProps {
  children: React.ReactNode;
  params: { clientId: string };
}

async function getClient(clientId: string) {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("clients")
      .select("id, name, slug")
      .eq("id", clientId)
      .single();
    return data;
  } catch {
    return null;
  }
}

export default async function ClientLayout({ children, params }: ClientLayoutProps) {
  const client = await getClient(params.clientId);
  if (!client) notFound();

  return (
    <div className="flex h-screen bg-white text-nearblack">
      <ClientSidebar clientId={params.clientId} clientName={client.name} />
      <main className="flex-1 overflow-auto bg-[#f7f7f7]">{children}</main>
    </div>
  );
}
