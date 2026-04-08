import { redirect } from "next/navigation";

export default function ModelsRedirect({ params }: { params: { clientId: string } }) {
  redirect(`/clients/${params.clientId}/usage`);
}
