"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/clients");
}

export async function signOut() {
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);
  await supabase.auth.signOut();
  redirect("/login");
}
