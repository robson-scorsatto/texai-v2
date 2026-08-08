import Link from "next/link";
import { Card } from "@/components/ui/card";

/**
 * Shown after a successful sign-up while PRIVATE_BETA=true. The user
 * and clinic were created for real (see register-service.ts), but no
 * session was started — isAllowedInPrivateBeta defaults to false for
 * every new user, so logging them in immediately would just show a
 * "not allowed" error on the next page. A platform admin must grant
 * access via /admin before this account can log in.
 */
export default function SignupPendentePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">Conta criada com sucesso</h1>
        <p className="mb-4 text-sm text-gray-500">
          A TEXAI 2.0 está em Private Beta. Sua conta e sua clínica já foram criadas, mas o acesso
          precisa ser liberado por um administrador antes que você possa entrar.
        </p>
        <p className="mb-6 text-xs text-gray-400">
          Você receberá acesso assim que for aprovado(a). Tente novamente mais tarde.
        </p>
        <Link href="/login" className="text-sm font-medium text-gray-900 underline">
          Voltar para o login
        </Link>
      </Card>
    </main>
  );
}
