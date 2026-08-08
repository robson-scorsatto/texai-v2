"use server";

import { redirect } from "next/navigation";
import { registerAndCreateClinic } from "@/lib/auth/register-service";

export type RegisterActionState = { error?: string } | null;

function toRegisterError(err: string): string {
  if (err === "VALIDATION:name_required") return "Informe seu nome.";
  if (err === "VALIDATION:invalid_email") return "Informe um e-mail válido.";
  if (err === "VALIDATION:weak_password") return "A senha deve ter pelo menos 8 caracteres.";
  if (err === "VALIDATION:clinic_name_required") return "Informe o nome da clínica.";
  if (err === "CONFLICT:email_already_registered") return "Já existe uma conta com este e-mail.";
  return "Não foi possível concluir o cadastro.";
}

export async function registerAction(
  _prev: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const clinicName = String(formData.get("clinicName") ?? "");

  const result = await registerAndCreateClinic({ name, email, password, clinicName });
  if (!result.ok) {
    return { error: toRegisterError(result.error) };
  }

  if (result.sessionStarted) {
    redirect("/select-clinic");
  }
  redirect("/signup/pendente");
}
