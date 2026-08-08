import { env } from "@/config/env";
import * as schema from "./schema";

type Db = Awaited<ReturnType<typeof buildRealDb>>;

async function buildRealDb() {
  if (env.DATABASE_URL.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dataDir = env.DATABASE_URL.replace("pglite://", "");
    if (dataDir !== "memory://" && dataDir.startsWith("./")) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dataDir, { recursive: true });
    }
    const client = new PGlite(dataDir === "memory://" ? undefined : dataDir);
    return drizzle(client, { schema });
  }

  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(env.DATABASE_URL, { max: 10 });
  return drizzle(client, { schema });
}

let dbPromise: Promise<Db> | null = null;
let testDb: Db | null = null;

/**
 * Returns a Drizzle client. In development/test (DATABASE_URL starting
 * with "pglite://"), we use PGlite — a real, embedded, WASM build of
 * Postgres with NO external server or native binary download required.
 * This is what lets Sprint 0 run migrations and tests fully offline in a
 * sandboxed environment. In staging/production, DATABASE_URL is a normal
 * postgres:// connection string and we use the postgres-js driver
 * against a real hosted Postgres instance.
 *
 * The schema/migrations are plain standard Postgres SQL either way, so
 * switching from PGlite to a real Postgres later requires ZERO code
 * changes — only an environment variable change (see prompt mestre,
 * "Migração futura").
 */
export function getDb(): Promise<Db> {
  if (testDb) return Promise.resolve(testDb);
  if (!dbPromise) dbPromise = buildRealDb();
  return dbPromise;
}

/**
 * TEST-ONLY escape hatch: injects an isolated database instance (e.g. a
 * fresh in-memory PGlite per test file) so every application function
 * that calls getDb() transparently uses it, with zero test-only
 * branching anywhere else in the codebase. Never called from
 * production/app code — see tests/helpers/create-test-db.ts.
 */
export function __setDbForTesting(db: Db | null) {
  testDb = db;
}
