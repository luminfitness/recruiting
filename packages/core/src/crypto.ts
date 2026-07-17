import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM at the application layer for integration_configs.credentials_encrypted.
 * Key comes from INTEGRATION_CREDENTIALS_KEY (32 bytes, base64) — see .env.example.
 * Rotation: re-encrypt all rows with a new key in a background pass and swap the
 * env var; this module doesn't version keys yet — flagged in the plan as a Phase 11
 * concern to revisit once real credentials start flowing.
 */
function getKey(): Buffer {
  const b64 = process.env.INTEGRATION_CREDENTIALS_KEY;
  if (!b64) throw new Error("INTEGRATION_CREDENTIALS_KEY is not set — see .env.example");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("INTEGRATION_CREDENTIALS_KEY must decode to 32 bytes");
  return key;
}

export interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function encryptCredentials(plaintext: Record<string, unknown>): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plaintext), "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptCredentials(payload: EncryptedPayload): Record<string, unknown> {
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}
