// Ensures env validation (src/config/env.ts) has everything it needs
// when the test suite boots, without depending on a local .env file.
process.env.DATABASE_URL = "pglite://memory://"; // overridden per-test via createTestDb()
process.env.SESSION_SECRET = "test-secret-not-for-production-use-only";
process.env.PRIVATE_BETA = process.env.PRIVATE_BETA ?? "true";
