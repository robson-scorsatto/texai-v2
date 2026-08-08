"use client";

import { useState } from "react";
import type { BetaUserSummary } from "@/lib/platform-admin/platform-admin-service";
import { setUserBetaAccessAction } from "@/app/actions/platform-admin-actions";
import { Button } from "@/components/ui/button";

export function AdminBetaAllowlist({ initialUsers }: { initialUsers: BetaUserSummary[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleToggle(userId: string, currentlyAllowed: boolean) {
    setError(null);
    setBusyId(userId);
    const result = await setUserBetaAccessAction(userId, !currentlyAllowed);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isAllowedInPrivateBeta: !currentlyAllowed } : u))
    );
  }

  if (users.length === 0) {
    return <p className="text-sm text-gray-500">Nenhum usuário não-administrador cadastrado ainda.</p>;
  }

  return (
    <div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase text-gray-400">
            <th className="pb-2">Nome</th>
            <th className="pb-2">E-mail</th>
            <th className="pb-2">Status</th>
            <th className="pb-2">Beta</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-gray-100">
              <td className="py-2">{u.name}</td>
              <td className="py-2 text-gray-500">{u.email}</td>
              <td className="py-2">
                <span className={u.isActive ? "text-green-600" : "text-red-600"}>
                  {u.isActive ? "Ativo" : "Inativo"}
                </span>
              </td>
              <td className="py-2">
                <span className={u.isAllowedInPrivateBeta ? "text-green-600" : "text-gray-400"}>
                  {u.isAllowedInPrivateBeta ? "Permitido" : "Bloqueado"}
                </span>
              </td>
              <td className="py-2 text-right">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyId === u.id}
                  onClick={() => handleToggle(u.id, u.isAllowedInPrivateBeta)}
                >
                  {u.isAllowedInPrivateBeta ? "Revogar" : "Permitir"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
