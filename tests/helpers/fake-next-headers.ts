/**
 * Minimal in-memory stand-in for `next/headers`'s `cookies()`, used only
 * in the Vitest environment (aliased in vitest.config.ts). This lets
 * src/lib/auth/session.ts run unmodified under both the real Next.js
 * server runtime AND plain Node test runs, without any test-only
 * branching in production code.
 */
type StoredCookie = { value: string };

const store = new Map<string, StoredCookie>();

export function __resetFakeCookies() {
  store.clear();
}

export async function cookies() {
  return {
    get(name: string) {
      const c = store.get(name);
      return c ? { name, value: c.value } : undefined;
    },
    set(name: string, value: string, _opts?: unknown) {
      store.set(name, { value });
    },
    delete(name: string) {
      store.delete(name);
    },
  };
}
