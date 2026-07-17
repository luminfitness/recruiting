import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { integrationConfigs } from "@usapt/db/schema";
import { encryptCredentials } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

export type IntegrationCategory = "job_board_indeed" | "job_board_linkedin" | "messaging_email" | "messaging_sms" | "meeting";

export interface IntegrationView {
  category: IntegrationCategory;
  providerKey: string;
  hasCredentials: boolean;
  enabled: boolean;
}

export const CATEGORY_META: { category: IntegrationCategory; label: string; providers: { key: string; label: string; fields: string[] }[] }[] = [
  { category: "messaging_email", label: "Email", providers: [{ key: "mock", label: "Mock (dev)", fields: [] }, { key: "sendgrid", label: "SendGrid", fields: ["apiKey"] }] },
  { category: "messaging_sms", label: "SMS", providers: [{ key: "mock", label: "Mock (dev)", fields: [] }, { key: "twilio", label: "Twilio", fields: ["accountSid", "authToken", "fromNumber"] }] },
  { category: "meeting", label: "Meetings", providers: [{ key: "mock", label: "Mock (dev)", fields: [] }, { key: "zoom", label: "Zoom", fields: ["accountId", "clientId", "clientSecret"] }] },
  { category: "job_board_indeed", label: "Indeed", providers: [{ key: "mock", label: "Semi-auto (Mock)", fields: [] }] },
  { category: "job_board_linkedin", label: "LinkedIn", providers: [{ key: "mock", label: "Semi-auto (Mock)", fields: [] }] },
];

export async function listIntegrations(tx: Tx, orgId: string): Promise<IntegrationView[]> {
  const rows = await tx.select().from(integrationConfigs).where(eq(integrationConfigs.orgId, orgId));
  const byCat = new Map(rows.map((r) => [r.category, r]));
  return CATEGORY_META.map((m) => {
    const r = byCat.get(m.category);
    return {
      category: m.category,
      providerKey: r?.providerKey ?? "mock",
      hasCredentials: Boolean(r?.credentialsEncrypted),
      enabled: r?.enabled ?? true,
    };
  });
}

/**
 * Sets a category's provider and (for real providers) its credentials, which
 * are AES-GCM encrypted before insert — the plaintext never lands in the DB.
 * Passing mock clears any stored credentials.
 */
export async function setIntegration(tx: Tx, orgId: string, category: IntegrationCategory, providerKey: string, credentials: Record<string, string>): Promise<void> {
  const hasCreds = Object.values(credentials).some((v) => v.trim() !== "");
  const encrypted = providerKey !== "mock" && hasCreds ? encryptCredentials(credentials) : null;

  const [existing] = await tx.select().from(integrationConfigs).where(and(eq(integrationConfigs.orgId, orgId), eq(integrationConfigs.category, category)));
  if (existing) {
    await tx
      .update(integrationConfigs)
      .set({ providerKey: providerKey as (typeof integrationConfigs.$inferInsert)["providerKey"], credentialsEncrypted: providerKey === "mock" ? null : encrypted ?? existing.credentialsEncrypted, updatedAt: new Date() })
      .where(eq(integrationConfigs.id, existing.id));
  } else {
    await tx.insert(integrationConfigs).values({ orgId, category, providerKey: providerKey as (typeof integrationConfigs.$inferInsert)["providerKey"], credentialsEncrypted: encrypted });
  }
}
