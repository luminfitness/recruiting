import { createHash, randomBytes } from "node:crypto";

/** Raw tokens are shown to the user exactly once (in the magic-link URL / session cookie); only the hash is persisted. */
export function generateAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const MAGIC_LINK_TTL_MINUTES = 15;
export const SESSION_TTL_DAYS = 30;
