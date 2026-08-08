"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type RegisterActionState } from "@/app/actions/register-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const initialState: RegisterActionState = null;

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">Criar conta na TEXAI 2.0</h1>
        <p className="mb-6 text-sm text-gray-500">
          Crie sua conta e a clínica em um só passo. Você será o(a) administrador(a) (OWNER) da clínica.
        </p>

        <form action={formAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Seu nome</label>
            <Input type="text" name="name" required autoComplete="name" placeholder="Seu nome completo" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">E-mail</label>
            <Input type="email" name="email" required autoComplete="email" placeholder="voce@exemplo.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Senha</label>
            <Input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Nome da clínica</label>
            <Input type="text" name="clinicName" required placeholder="Ex.: Clínica Sorriso" />
          </div>

          {state?.error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {state.error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Criando conta..." : "Criar conta"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-500">
          Já tem uma conta?{" "}
          <Link href="/login" className="font-medium text-gray-900 underline">
            Entrar
          </Link>
        </p>
      </Card>
    </main>
  );
}
