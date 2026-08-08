"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { login as loginService, logout as logoutService } from "@/lib/auth/auth-service";
import { switchActiveClinic, listUserClinics } from "@/lib/tenant/resolve-tenant";

export type LoginActionState = { error?: string } | null;

export async function loginAction(_prev: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/select-clinic");

  if (!email || !password) return { error: "Informe e-mail e senha." };

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? null;

  const result = await loginService(email, password, ip);
  if (!result.ok) {
    const messages: Record<string, string> = {
      invalid_credentials: "E-mail ou senha incorretos.",
      inactive: "Esta conta está desativada.",
      not_allowed_in_beta: "Sua conta ainda não tem acesso ao Private Beta da TEXAI 2.0.",
    };
    return { error: messages[result.reason] ?? "Não foi possível entrar." };
  }

  redirect(next || "/select-clinic");
}

export async function logoutAction() {
  await logoutService();
  redirect("/login");
}

export async function switchClinicAction(clinicId: string) {
  await switchActiveClinic(clinicId);
  redirect("/dashboard");
}

export async function getMyClinicsAction() {
  return listUserClinics();
}
