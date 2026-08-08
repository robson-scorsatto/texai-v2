import "dotenv/config";
import { migrate as pgliteMigrate } from "drizzle-orm/pglite/migrator";
import { migrate as pgMigrate } from "drizzle-orm/postgres-js/migrator";
import { env } from "@/config/env";
import { getDb } from "./client";

async function main() {
  const db = await getDb();
  if (env.DATABASE_URL.startsWith("pglite://")) {
    // @ts-expect-error - db is the pglite-flavoured drizzle instance here
    await pgliteMigrate(db, { migrationsFolder: "./drizzle" });
  } else {
    // @ts-expect-error - db is the postgres-js-flavoured drizzle instance here
    await pgMigrate(db, { migrationsFolder: "./drizzle" });
  }
  console.log("✅ Migrations applied to", env.DATABASE_URL);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
