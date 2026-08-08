import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { modules } from "@/db/schema";

/**
 * Public, unauthenticated liveness/readiness check. Intentionally
 * reveals NOTHING about tenants, users or business data — just whether
 * the process is up and the database is reachable. Safe to expose to
 * uptime monitors even while PRIVATE_BETA=true.
 */
export async function GET() {
  try {
    const db = await getDb();
    await db.select().from(modules).limit(1);
    return NextResponse.json({ status: "ok", time: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "unknown" },
      { status: 503 }
    );
  }
}
