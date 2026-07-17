import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, brands, markets } from "./tenancy";
import { candidates } from "./candidates";

export const classCohorts = pgTable("class_cohorts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  marketId: uuid("market_id").references(() => markets.id, { onDelete: "set null" }),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  orientationAt: timestamp("orientation_at", { withTimezone: true }).notNull(),
  classStartAt: timestamp("class_start_at", { withTimezone: true }).notNull(),
  graduationAt: timestamp("graduation_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cohortMembers = pgTable(
  "cohort_members",
  {
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => classCohorts.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.cohortId, t.candidateId] })],
);
