"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type LoginActionState } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const initialState: LoginActionState = null;

function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/select-clinic";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">E-mail</label>
        <Input type="email" name="email" required autoComplete="email" placeholder="voce@exemplo.com" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">Senha</label>
        <Input type="password" name="password" required autoComplete="current-password" />
      </div>

      {state?.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

function SignupLink() {
  return (
    <p className="mt-4 text-center text-xs text-gray-500">
      Ainda não tem conta?{" "}
      <Link href="/signup" className="font-medium text-gray-900 underline">
        Criar conta
      </Link>
    </p>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">TEXAI 2.0</h1>
        <p className="mb-6 text-sm text-gray-500">Ambiente privado de desenvolvimento — acesso restrito.</p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <SignupLink />
      </Card>
    </main>
  );
}
