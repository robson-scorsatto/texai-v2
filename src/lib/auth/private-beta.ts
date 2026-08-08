import { env } from "@/config/env";
import type { User } from "@/db/schema";

/**
 * THE Private Beta gate. This must be called on the BACKEND for every
 * authenticated request path (never only in a frontend route guard —
 * see prompt mestre item 3 e 58: "Não implementar essa mudança
 * simplesmente no frontend. A validação deverá ocorrer no backend.").
 *
 * Rules:
 *  - Platform admins (isPlatformAdmin) always pass, beta or not — they
 *    need access to operate the platform regardless of its public state.
 *  - When PRIVATE_BETA=false, everyone with an active account passes
 *    (public launch state).
 *  - When PRIVATE_BETA=true (default), only users explicitly allowlisted
 *    via isAllowedInPrivateBeta may pass.
 */
export function isAllowedToUsePlatform(user: Pick<User, "isPlatformAdmin" | "isAllowedInPrivateBeta" | "isActive">): boolean {
  if (!user.isActive) return false;
  if (user.isPlatformAdmin) return true;
  if (!env.PRIVATE_BETA) return true;
  return user.isAllowedInPrivateBeta;
}
