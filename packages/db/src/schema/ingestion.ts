import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./tenancy";
import { candidates } from "./candidates";
import { parsedStatusEnum } from "./enums";

/**
 * Inbound-email-webhook ingestion (SendGrid Inbound Parse / Postmark / Mailgun),
 * not IMAP polling — see the plan's Email ingestion decision. parser_version is
 * tracked so a silent parse-rate drop (Indeed changing its notification format)
 * is a detectable incident, not a silent failure.
 */
export const inboundEmails = pgTable("inbound_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  providerMessageId: text("provider_message_id"),
  rawSource: jsonb("raw_source").notNull(),
  parserVersion: integer("parser_version").notNull(),
  parsedStatus: parsedStatusEnum("parsed_status").notNull().default("needs_review"),
  candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Generic inbound-webhook log for Zoom/Indeed/etc. — processed idempotently by external_id. */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  status: text("status").notNull().default("received"),
});
