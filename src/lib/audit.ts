import { getDb } from "@/db/client";
import { auditLogs } from "@/db/schema";

export type AuditResult = "success" | "denied" | "error";

/**
 * Records a security/business-critical action. Called from every
 * sensitive code path (login, logout, clinic switch, permission checks
 * that fail, membership/role changes, etc). Never throws — a logging
 * failure must never break the calling request.
 */
export async function recordAudit(params: {
  userId?: string | null;
  clinicId?: string | null;
  action: string;
  objectType?: string;
  objectId?: string;
  result: AuditResult;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const db = await getDb();
    await db.insert(auditLogs).values({
      userId: params.userId ?? null,
      clinicId: params.clinicId ?? null,
      action: params.action,
      objectType: params.objectType,
      objectId: params.objectId,
      result: params.result,
      ipAddress: params.ipAddress ?? null,
      metadata: params.metadata ?? {},
    });
  } catch (err) {
    console.error("[audit] failed to record audit log", params.action, err);
  }
}
