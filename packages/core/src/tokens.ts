import { randomBytes } from "node:crypto";

/** Unique, unguessable candidate identity token — embedded in every candidate-facing URL. */
export function generateCandidateToken(): string {
  return randomBytes(24).toString("base64url");
}
