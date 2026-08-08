import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit's own migration-generation step only reads the schema
    // (doesn't need a live connection for `generate`), but a value is
    // required by the config type.
    url: process.env.DATABASE_URL_MIGRATE ?? "postgres://placeholder/placeholder",
  },
});
