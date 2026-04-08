import { redirect } from "next/navigation";

export default function AlertsRedirect({ params }: { params: { clientId: string } }) {
  redirect(`/clients/${params.clientId}/history`);
}
