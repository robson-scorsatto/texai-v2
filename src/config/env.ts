import { z } from "zod";

/**
 * All environment variables are validated here, once, at boot. Never read
 * process.env directly elsewhere in the codebase — import `env` from this
 * file instead, so a missing/invalid var fails fast and loudly.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // "development" (PGlite, in-process, file-backed) or a real Postgres
  // connection string (postgres://...). See src/db/client.ts.
  DATABASE_URL: z.string().default("pglite://./.data/texai-dev"),

  SESSION_SECRET: z
    .string()
    .min(16, "SESSION_SECRET must be set to a long random value in production"),

  // Master private-beta switch. MUST be validated on the backend
  // (src/lib/auth/private-beta.ts) — never trust a client-side check.
  PRIVATE_BETA: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  APP_URL: z.string().default("http://localhost:3000"),

  // 32 raw bytes, base64-encoded — used to encrypt third-party
  // integration credentials at rest (see src/lib/crypto/secret-box.ts).
  // Generate with: openssl rand -base64 32. Separate from
  // SESSION_SECRET on purpose — rotating one must never affect the
  // other. Dev fallback below is INSECURE and must never be used in
  // production.
  INTEGRATIONS_ENCRYPTION_KEY: z.string().default("MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me-32chars",
  PRIVATE_BETA: process.env.PRIVATE_BETA,
  APP_URL: process.env.APP_URL,
  INTEGRATIONS_ENCRYPTION_KEY: process.env.INTEGRATIONS_ENCRYPTION_KEY,
});
