import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import {
  auditLog,
  brands,
  cadenceRuleOverrides,
  cadenceRules,
  copyTemplates,
  jobPostings,
  markets,
  organizations,
} from "@usapt/db/schema";
import { getProvider } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

export type RoleType = "manager" | "trainer";
export type Channel = "indeed" | "linkedin" | "other";

/**
 * Role-correct scheduling link + contact number, derived TOGETHER from
 * role_type in ONE place. This is the structural enforcement of the FRD
 * Section 8 invariant: "a trainer ad can never carry the manager scheduling
 * link." Because both fields come out of this single function keyed on
 * roleType, there is no code path that can pair a manager link with a trainer
 * posting or vice versa. (Numbers are placeholders here — in production
 * they're per-org config; the point is the pairing, not the digits.)
 */
export function rolePackage(baseUrl: string, brandSlug: string, roleType: RoleType) {
  if (roleType === "manager") {
    return {
      schedulingLink: `${baseUrl}/apply/${brandSlug}?role=manager`,
      contactNumber: "(555) 100-0001", // manager support line
    };
  }
  return {
    schedulingLink: `${baseUrl}/apply/${brandSlug}?role=trainer`,
    contactNumber: "(555) 720-4180", // trainer line (separate by design)
  };
}

async function resolveCopy(tx: Tx, orgId: string, brandId: string, roleType: RoleType, channel: Channel, copyTemplateId: string | null): Promise<string> {
  if (copyTemplateId) {
    const [t] = await tx.select().from(copyTemplates).where(eq(copyTemplates.id, copyTemplateId));
    if (t) return t.body;
  }
  const [t] = await tx
    .select()
    .from(copyTemplates)
    .where(and(eq(copyTemplates.orgId, orgId), eq(copyTemplates.brandId, brandId), eq(copyTemplates.roleType, roleType), eq(copyTemplates.channel, channel)))
    .orderBy(desc(copyTemplates.version));
  return t?.body ?? `${roleType === "manager" ? "Manager" : "Personal Trainer"} opening — apply today!`;
}

export interface CreatePostingInput {
  orgId: string;
  brandId: string;
  marketId?: string | null;
  roleType: RoleType;
  channel: Channel;
  scheduledPostAt: Date;
  copyTemplateId?: string | null;
  cadenceRuleId?: string | null;
  spend?: string | null;
}

/**
 * Creates a job posting through the org's JobBoardProvider. Mock (and any
 * not-yet-integrated real provider) returns requires_manual_action, so the
 * posting lands in `pending_manual_action` with a paste-ready package and the
 * recruiting lead is notified (semi-auto, FRD Section 8 scenario 2). A future
 * real API returns `confirmed` and the same row goes straight to `live` — the
 * job_postings record is identical either way, so analytics never branch on mode.
 * copy_snapshot freezes the resolved text so later template edits don't mutate
 * this scheduled instance.
 */
export async function createPosting(tx: Tx, input: CreatePostingInput): Promise<string> {
  const [brand] = await tx.select().from(brands).where(eq(brands.id, input.brandId));
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const pkg = rolePackage(baseUrl, brand?.slug ?? "brand", input.roleType);
  const copy = await resolveCopy(tx, input.orgId, input.brandId, input.roleType, input.channel, input.copyTemplateId ?? null);

  const provider =
    input.channel === "linkedin"
      ? await getProvider(tx, input.orgId, "job_board_linkedin")
      : await getProvider(tx, input.orgId, "job_board_indeed");

  const outcome = await provider.createPosting({
    roleType: input.roleType,
    channel: input.channel,
    copy,
    schedulingLink: pkg.schedulingLink,
    contactNumber: pkg.contactNumber,
  });

  const isConfirmed = outcome.kind === "confirmed";
  const [posting] = await tx
    .insert(jobPostings)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      marketId: input.marketId ?? null,
      roleType: input.roleType,
      channel: input.channel,
      status: isConfirmed ? "live" : "pending_manual_action",
      mode: isConfirmed ? "full_auto" : "semi_auto",
      copySnapshot: copy,
      schedulingLink: pkg.schedulingLink,
      contactNumber: pkg.contactNumber,
      scheduledPostAt: input.scheduledPostAt,
      postedAt: isConfirmed ? new Date() : null,
      externalPostingId: outcome.kind === "confirmed" ? outcome.externalId : null,
      cadenceRuleId: input.cadenceRuleId ?? null,
      manualActionPayload: outcome.kind === "requires_manual_action" ? outcome.package : null,
      spend: input.spend ?? null,
    })
    .returning();

  return posting.id;
}

/** One-click "mark as posted" for a semi-auto posting — the human executed the paste. */
export async function markPosted(tx: Tx, orgId: string, postingId: string, actorUserId: string): Promise<void> {
  await tx.update(jobPostings).set({ status: "live", postedAt: new Date() }).where(eq(jobPostings.id, postingId));
  await tx.insert(auditLog).values({ orgId, actorUserId, action: "posting_marked_posted", resourceType: "job_posting", resourceId: postingId, metadata: {} });
}

export async function endPosting(tx: Tx, orgId: string, postingId: string, actorUserId: string): Promise<void> {
  await tx.update(jobPostings).set({ status: "ended", endedAt: new Date() }).where(eq(jobPostings.id, postingId));
  await tx.insert(auditLog).values({ orgId, actorUserId, action: "posting_ended", resourceType: "job_posting", resourceId: postingId, metadata: {} });
}

export async function setPostingSpend(tx: Tx, postingId: string, spend: string | null): Promise<void> {
  await tx.update(jobPostings).set({ spend }).where(eq(jobPostings.id, postingId));
}

/** Skip or shift a single rule instance without editing the recurring rule (holiday handling). */
export async function overrideRuleInstance(
  tx: Tx,
  cadenceRuleId: string,
  instanceDate: string,
  override: "skip" | "shift",
  shiftedToAt: Date | null,
  reason: string | null,
): Promise<void> {
  await tx.insert(cadenceRuleOverrides).values({ cadenceRuleId, instanceDate, override, shiftedToAt, reason });
}

/**
 * Seeds the default USAPT weekly ruleset (FRD Section 8): Sunday post manager
 * ads, Tuesday manager reminder + switch active mode to trainer, Thursday end
 * trainer ads. Friday is left as a free slot for ad-hoc manual postings.
 */
export async function seedDefaultCadence(tx: Tx, orgId: string, brandId: string): Promise<void> {
  await tx.insert(cadenceRules).values([
    { orgId, brandId, dayOfWeek: 0, time: "09:00", action: "post", roleType: "manager", channel: "indeed" },
    { orgId, brandId, dayOfWeek: 2, time: "09:00", action: "remind", roleType: "manager", channel: "indeed" },
    { orgId, brandId, dayOfWeek: 2, time: "09:30", action: "switch_mode", roleType: "trainer", channel: "indeed" },
    { orgId, brandId, dayOfWeek: 4, time: "09:00", action: "end", roleType: "trainer", channel: "indeed" },
  ]);
}

export async function createCadenceRule(tx: Tx, orgId: string, input: { brandId: string | null; marketId: string | null; dayOfWeek: number; time: string; action: "post" | "switch_mode" | "end" | "remind"; roleType: RoleType; channel: Channel }): Promise<void> {
  await tx.insert(cadenceRules).values({ orgId, ...input });
}

export async function setCadenceRuleActive(tx: Tx, ruleId: string, active: boolean): Promise<void> {
  await tx.update(cadenceRules).set({ active }).where(eq(cadenceRules.id, ruleId));
}

export async function createCopyTemplate(tx: Tx, orgId: string, input: { brandId: string; roleType: RoleType; channel: Channel; name: string; body: string }): Promise<void> {
  const [latest] = await tx
    .select({ version: copyTemplates.version })
    .from(copyTemplates)
    .where(and(eq(copyTemplates.orgId, orgId), eq(copyTemplates.brandId, input.brandId), eq(copyTemplates.roleType, input.roleType), eq(copyTemplates.channel, input.channel)))
    .orderBy(desc(copyTemplates.version));
  await tx.insert(copyTemplates).values({ orgId, ...input, version: (latest?.version ?? 0) + 1 });
}

/** {dayOfWeek 0-6 (Sun=0), "HH:MM", "YYYY-MM-DD"} for `now` in the given IANA timezone. */
function zonedParts(now: Date, timeZone: string): { dow: number; hhmm: string; date: string } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { dow: dowMap[parts.weekday], hhmm: `${hour}:${parts.minute}`, date: `${parts.year}-${parts.month}-${parts.day}` };
}

/**
 * Cron entrypoint for the posting cadence (FR-1.1). For each active rule,
 * fires when the current time in the rule's timezone (market tz for
 * market-scoped rules, org default tz otherwise) is at/after the rule's
 * day+time and it hasn't already fired for that local date and isn't skipped.
 * Idempotency is by (cadence_rule_id, local instance date) recorded on the
 * job_postings the fire produces. Returns the number of rule instances fired.
 */
export async function fireCadenceRules(tx: Tx, client: PoolClient, now: Date): Promise<number> {
  const rules = await tx.select().from(cadenceRules).where(eq(cadenceRules.active, true));
  let fired = 0;

  for (const rule of rules) {
    // Resolve the rule's timezone.
    let tz = "America/Chicago";
    if (rule.usesMarketTimezone && rule.marketId) {
      const [m] = await tx.select().from(markets).where(eq(markets.id, rule.marketId));
      if (m) tz = m.timezone;
    } else {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, rule.orgId));
      if (org) tz = org.defaultTimezone;
    }

    const { dow, hhmm, date } = zonedParts(now, tz);
    const ruleTime = rule.time.slice(0, 5); // "HH:MM"

    // Check for a skip/shift override for today's instance.
    const [override] = await tx
      .select()
      .from(cadenceRuleOverrides)
      .where(and(eq(cadenceRuleOverrides.cadenceRuleId, rule.id), eq(cadenceRuleOverrides.instanceDate, date)));
    if (override?.override === "skip") continue;

    const dueByShift = override?.override === "shift" && override.shiftedToAt && now >= override.shiftedToAt;
    const dueBySchedule = dow === rule.dayOfWeek && hhmm >= ruleTime;
    if (!dueByShift && !dueBySchedule) continue;

    // Idempotency: has this rule already produced a posting for this local date?
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(jobPostings)
      .where(and(eq(jobPostings.cadenceRuleId, rule.id), sql`(${jobPostings.scheduledPostAt} AT TIME ZONE ${tz})::date = ${date}::date`));
    if (count > 0) continue;

    if (rule.action === "post" || rule.action === "switch_mode") {
      // switch_mode ends the other role's live postings for this brand first
      // (the atomic mode swap — the new postings only ever carry role-correct
      // links via rolePackage()).
      if (rule.action === "switch_mode") {
        const otherRole: RoleType = rule.roleType === "manager" ? "trainer" : "manager";
        await tx
          .update(jobPostings)
          .set({ status: "ended", endedAt: now })
          .where(and(eq(jobPostings.orgId, rule.orgId), rule.brandId ? eq(jobPostings.brandId, rule.brandId) : sql`true`, eq(jobPostings.roleType, otherRole), eq(jobPostings.status, "live")));
      }

      const brandId = rule.brandId ?? (await tx.select().from(brands).where(eq(brands.orgId, rule.orgId)).limit(1))[0]?.id;
      if (!brandId) continue;
      await createPosting(tx, {
        orgId: rule.orgId,
        brandId,
        marketId: rule.marketId,
        roleType: rule.roleType,
        channel: rule.channel,
        scheduledPostAt: now,
        copyTemplateId: rule.copyTemplateId,
        cadenceRuleId: rule.id,
      });
      // Notify the recruiting lead a semi-auto package is ready.
      const email = await getProvider(tx, rule.orgId, "messaging_email");
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, rule.orgId));
      await email.sendEmail({
        to: "recruiting-lead@internal", // routed to the lead; Mock logs it
        fromName: "USAPT Platform",
        fromEmail: "no-reply@usapt-platform.example",
        subject: `Posting ready to publish — ${rule.roleType} on ${rule.channel}`,
        body: `A ${rule.action === "switch_mode" ? "mode-switch " : ""}${rule.roleType} posting for ${org?.name ?? ""} is prepared and waiting for one-click publish in the Postings screen.`,
        templateKey: "cadence_posting_ready",
      });
      fired++;
    } else if (rule.action === "end") {
      await tx
        .update(jobPostings)
        .set({ status: "ended", endedAt: now })
        .where(and(eq(jobPostings.orgId, rule.orgId), eq(jobPostings.roleType, rule.roleType), eq(jobPostings.channel, rule.channel), eq(jobPostings.status, "live")));
      // Record a marker posting so the (rule, date) idempotency check trips next tick.
      await tx.insert(jobPostings).values({
        orgId: rule.orgId,
        brandId: rule.brandId ?? (await tx.select().from(brands).where(eq(brands.orgId, rule.orgId)).limit(1))[0]?.id ?? "",
        marketId: rule.marketId,
        roleType: rule.roleType,
        channel: rule.channel,
        status: "ended",
        mode: "semi_auto",
        copySnapshot: "(cadence end marker)",
        scheduledPostAt: now,
        endedAt: now,
        cadenceRuleId: rule.id,
      });
      fired++;
    }
    // 'remind' actions are handled by the reminder sequence (Phase 7).
  }

  return fired;
}
