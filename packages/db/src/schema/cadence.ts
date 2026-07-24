import { boolean, date, integer, jsonb, numeric, pgTable, text, time, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations, brands, markets } from "./tenancy";
import {
  cadenceActionEnum,
  cadenceOverrideEnum,
  postingChannelEnum,
  postingModeEnum,
  postingStatusEnum,
  roleTypeEnum,
} from "./enums";

/**
 * Per-brand, per-role posting package: the scheduling link and contact number
 * that go out on an ad for that brand's manager or trainer opening.
 *
 * Keyed on (brand, role) precisely so the FRD Section 8 invariant survives
 * configuration — resolveRolePackage() looks both fields up together under one
 * role_type, so a trainer ad still cannot pick up the manager line no matter
 * what an admin types. Null columns fall back to the derived defaults.
 */
export const brandRoleSettings = pgTable(
  "brand_role_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    roleType: roleTypeEnum("role_type").notNull(),
    /** Public phone number printed on the ad. Null → the built-in default. */
    contactNumber: text("contact_number"),
    /** Overrides the derived /apply/{slug}?role=… link. Null → derived. */
    schedulingLink: text("scheduling_link"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("brand_role_settings_brand_role_idx").on(t.brandId, t.roleType)],
);

/** Versioned; job_postings.copy_snapshot freezes resolved text so an edit never retroactively changes a scheduled instance. */
export const copyTemplates = pgTable("copy_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  roleType: roleTypeEnum("role_type").notNull(),
  channel: postingChannelEnum("channel").notNull(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cadenceRules = pgTable("cadence_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
  marketId: uuid("market_id").references(() => markets.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday .. 6=Saturday
  time: time("time").notNull(),
  /** true = fire in the market's own timezone; false = fire in the org's default_timezone. */
  usesMarketTimezone: boolean("uses_market_timezone").notNull().default(true),
  action: cadenceActionEnum("action").notNull(),
  roleType: roleTypeEnum("role_type").notNull(),
  channel: postingChannelEnum("channel").notNull(),
  copyTemplateId: uuid("copy_template_id").references(() => copyTemplates.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Lets a recruiting lead skip/shift one instance (e.g. a holiday) without editing the recurring rule. */
export const cadenceRuleOverrides = pgTable("cadence_rule_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  cadenceRuleId: uuid("cadence_rule_id")
    .notNull()
    .references(() => cadenceRules.id, { onDelete: "cascade" }),
  instanceDate: date("instance_date").notNull(),
  override: cadenceOverrideEnum("override").notNull(),
  shiftedToAt: timestamp("shifted_to_at", { withTimezone: true }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobPostings = pgTable("job_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id, { onDelete: "cascade" }),
  marketId: uuid("market_id").references(() => markets.id, { onDelete: "set null" }),
  roleType: roleTypeEnum("role_type").notNull(),
  channel: postingChannelEnum("channel").notNull(),
  status: postingStatusEnum("status").notNull().default("draft"),
  mode: postingModeEnum("mode").notNull().default("semi_auto"),
  copySnapshot: text("copy_snapshot").notNull(),
  schedulingLink: text("scheduling_link"),
  contactNumber: text("contact_number"),
  scheduledPostAt: timestamp("scheduled_post_at", { withTimezone: true }).notNull(),
  scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  spend: numeric("spend"),
  externalPostingId: text("external_posting_id"),
  cadenceRuleId: uuid("cadence_rule_id").references(() => cadenceRules.id),
  /** Populated when a JobBoardProvider returns requires_manual_action: { copy, schedulingLink, contactNumber, timing }. */
  manualActionPayload: jsonb("manual_action_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
