import { redirect } from "next/navigation";

export default function LogsRedirect({ params }: { params: { clientId: string } }) {
  redirect(`/clients/${params.clientId}/history`);
}
