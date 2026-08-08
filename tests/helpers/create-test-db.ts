import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/db/schema";
import { __setDbForTesting } from "@/db/client";

/**
 * Spins up a brand-new, fully-migrated, in-memory PGlite database and
 * installs it as the active db for every getDb() call in the app. Call
 * this in beforeEach() so every test starts from a clean, isolated
 * database — this is what makes the cross-tenant tests trustworthy
 * (no leakage of rows between test cases).
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  __setDbForTesting(db);
  return db;
}

export function resetTestDb() {
  __setDbForTesting(null);
}
