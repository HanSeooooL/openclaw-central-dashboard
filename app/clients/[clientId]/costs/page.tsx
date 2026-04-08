import { redirect } from "next/navigation";

export default function CostsRedirect({ params }: { params: { clientId: string } }) {
  redirect(`/clients/${params.clientId}/usage`);
}
