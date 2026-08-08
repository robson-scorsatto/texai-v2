import crypto from "node:crypto";
import { env } from "@/config/env";

/**
 * Symmetric encryption for third-party integration credentials at rest
 * (WhatsApp/Meta access tokens, Stripe secret keys) — see
 * docs/GUIA_INTEGRACAO.md. AES-256-GCM: a fresh random IV per encrypt
 * call, auth tag verified on decrypt (tampering/corruption throws
 * instead of silently returning garbage).
 *
 * The key comes from INTEGRATIONS_ENCRYPTION_KEY (32 raw bytes,
 * base64-encoded) — completely separate from SESSION_SECRET, so
 * rotating one never touches the other. In development, a fixed
 * insecure fallback key is used (mirrors the SESSION_SECRET dev
 * fallback pattern in src/config/env.ts) so `npm run dev` works out of
 * the box; production MUST set a real key or encryption will use a
 * value everyone reading this repo already knows.
 */

function getKey(): Buffer {
  const raw = env.INTEGRATIONS_ENCRYPTION_KEY;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `INTEGRATIONS_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${key.length}). Generate one with: openssl rand -base64 32`
    );
  }
  return key;
}

/** Encrypts a plaintext string. Returns a single opaque string safe to store in a text column. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM standard IV size
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // format: base64(iv).base64(authTag).base64(ciphertext)
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

/** Decrypts a string produced by encryptSecret(). Throws if the value is malformed or was tampered with. */
export function decryptSecret(stored: string): string {
  const key = getKey();
  const parts = stored.split(".");
  if (parts.length !== 3) throw new Error("INVALID_ENCRYPTED_VALUE");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Masks a secret for display purposes — shows only the last 4 characters, e.g. "••••••••ab12". Never sends the real value to the client. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return `••••••••${plaintext.slice(-4)}`;
}
