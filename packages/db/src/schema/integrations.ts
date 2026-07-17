import { boolean, jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./tenancy";
import { integrationCategoryEnum, providerKeyEnum } from "./enums";

/** One row per {org, category}. provider_key = 'mock' is first-class, not a placeholder. */
export const integrationConfigs = pgTable(
  "integration_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    category: integrationCategoryEnum("category").notNull(),
    providerKey: providerKeyEnum("provider_key").notNull().default("mock"),
    enabled: boolean("enabled").notNull().default(true),
    /** AES-GCM encrypted at the application layer before insert; never stored in plaintext. */
    credentialsEncrypted: jsonb("credentials_encrypted"),
    config: jsonb("config").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("integration_configs_org_category_idx").on(t.orgId, t.category)],
);

/** Everything the Mock MessagingProvider "sends" lands here instead of a real inbox — visible in an admin/dev view. */
export const messagesLog = pgTable("messages_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  channel: integrationCategoryEnum("channel").notNull(),
  toAddress: jsonb("to_address").notNull(),
  subjectOrTemplate: jsonb("subject_or_template").notNull(),
  body: jsonb("body").notNull(),
  providerKey: providerKeyEnum("provider_key").notNull(),
  externalMessageId: uuid("external_message_id").defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
