import { and, desc, eq, sql } from "drizzle-orm";
import { getServiceDb, withServiceTransaction } from "@usapt/db";
import { auditLog, brands, inboundEmails, markets, organizations } from "@usapt/db/schema";
import { createCandidate } from "./candidates";

/**
 * Bumped whenever the parser changes. Stored on every inbound_emails row so a
 * silent parse-rate drop (Indeed changing its notification format) is a
 * detectable incident tied to a parser version, not a silent failure — FR-1.2.
 */
export const PARSER_VERSION = 1;

export interface ParsedApplication {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roleType: "manager" | "trainer";
  brandName?: string;
  marketName?: string;
}

/**
 * Parses an Indeed-style applicant-notification email body. Tolerant of the
 * loose "label: value" shape those emails use. Returns null when the essentials
 * (name + email) can't be found — the caller routes that to the triage queue.
 */
export function parseIndeedEmail(text: string): ParsedApplication | null {
  const grab = (re: RegExp) => text.match(re)?.[1]?.trim();
  const name = grab(/Applicant:\s*([^\n]+?)(?:\.|\n|$)/i);
  // Strip trailing sentence punctuation the label-value format leaves on the value
  // (e.g. "Email: a@b.com. Phone:" would otherwise capture "a@b.com.").
  const email = grab(/Email:\s*([^\s,\n]+@[^\s,\n]+)/i)?.replace(/[.,;:]+$/, "");
  if (!name || !email) return null;

  const parts = name.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || parts[0];

  const position = grab(/Position:\s*([^\n]+)/i) ?? "";
  const roleType: "manager" | "trainer" = /manager/i.test(position) ? "manager" : "trainer";
  const phone = grab(/Phone:\s*([+\d][\d\s().-]{6,})/i)?.replace(/[.\s]+$/, "");

  // Position often reads "<Title> — <Brand> (<Market>)".
  const brandMatch = position.match(/—\s*([^(]+?)\s*(?:\(|$)/);
  const marketMatch = position.match(/\(([^)]+)\)/);

  return {
    firstName,
    lastName,
    email,
    phone: phone || undefined,
    roleType,
    brandName: brandMatch?.[1]?.trim(),
    marketName: marketMatch?.[1]?.trim(),
  };
}

export interface InboundPayload {
  to: string; // e.g. apply+usapt@inbound.usapt-platform.example
  from: string;
  subject: string;
  text: string;
  providerMessageId?: string;
}

function orgSlugFromRecipient(to: string): string | null {
  return to.match(/apply\+([a-z0-9-]+)@/i)?.[1]?.toLowerCase() ?? null;
}

export interface IngestResult {
  status: "parsed" | "needs_review" | "failed";
  candidateId?: string;
}

/**
 * Inbound-email-webhook ingestion (SendGrid Inbound Parse / Postmark), the
 * FR-1.2 baseline path. Resolves the org from the recipient address, parses the
 * body, and — on success — funnels into the SAME createCandidate pipeline as
 * manual-add and (future) Indeed API, so dedup + token issuance + auto-invite
 * all happen identically. Unparseable or missing-contact mail lands in the
 * triage queue (inbound_emails with parsed_status != 'parsed').
 */
export async function ingestInboundEmail(payload: InboundPayload): Promise<IngestResult> {
  const slug = orgSlugFromRecipient(payload.to);
  const db = getServiceDb();
  const [org] = slug ? await db.select().from(organizations).where(eq(organizations.slug, slug)) : [];

  const parsed = parseIndeedEmail(payload.text);

  return withServiceTransaction(async (tx, client) => {
    // No org or no parse → store for triage, unresolved.
    if (!org || !parsed) {
      await tx.insert(inboundEmails).values({
        orgId: org?.id ?? null,
        providerMessageId: payload.providerMessageId ?? null,
        rawSource: payload,
        parserVersion: PARSER_VERSION,
        parsedStatus: parsed ? "needs_review" : "failed",
      });
      await maybeAlertParseRate(org?.id ?? null);
      return { status: parsed ? "needs_review" : "failed" };
    }

    // Resolve brand + market within the org (best-effort; fall back to the first).
    const brandRows = await tx.select().from(brands).where(eq(brands.orgId, org.id));
    const brand =
      brandRows.find((b) => parsed.brandName && b.name.toLowerCase() === parsed.brandName.toLowerCase()) ?? brandRows[0];
    if (!brand) {
      await tx.insert(inboundEmails).values({ orgId: org.id, providerMessageId: payload.providerMessageId ?? null, rawSource: payload, parserVersion: PARSER_VERSION, parsedStatus: "needs_review" });
      return { status: "needs_review" };
    }
    const marketRows = await tx.select().from(markets).where(eq(markets.brandId, brand.id));
    const market =
      marketRows.find((m) => parsed.marketName && m.name.toLowerCase() === parsed.marketName.toLowerCase()) ?? marketRows[0];
    if (!market) {
      await tx.insert(inboundEmails).values({ orgId: org.id, providerMessageId: payload.providerMessageId ?? null, rawSource: payload, parserVersion: PARSER_VERSION, parsedStatus: "needs_review" });
      return { status: "needs_review" };
    }

    const { candidateId } = await createCandidate(tx, client, org.id, {
      brandId: brand.id,
      marketId: market.id,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      phone: parsed.phone,
      roleType: parsed.roleType,
      source: "indeed",
    });

    await tx.insert(inboundEmails).values({
      orgId: org.id,
      providerMessageId: payload.providerMessageId ?? null,
      rawSource: payload,
      parserVersion: PARSER_VERSION,
      parsedStatus: "parsed",
      candidateId,
    });

    return { status: "parsed", candidateId };
  });
}

/**
 * Parse-rate-drop alerting: if recent inbound mail for an org is failing to
 * parse at a high rate, record an incident (a silent drop must be treated as an
 * incident, not swallowed — FR-1.2). Uses the last 8 inbound emails.
 */
async function maybeAlertParseRate(orgId: string | null): Promise<void> {
  if (!orgId) return;
  const db = getServiceDb();
  const recent = await db
    .select({ parsedStatus: inboundEmails.parsedStatus })
    .from(inboundEmails)
    .where(eq(inboundEmails.orgId, orgId))
    .orderBy(desc(inboundEmails.createdAt))
    .limit(8);
  if (recent.length < 4) return;
  const failures = recent.filter((r) => r.parsedStatus === "failed").length;
  if (failures / recent.length >= 0.5) {
    await db.insert(auditLog).values({
      orgId,
      action: "parser_incident",
      resourceType: "inbound_email",
      resourceId: orgId,
      metadata: { parserVersion: PARSER_VERSION, recentFailureRate: failures / recent.length, sample: recent.length },
    });
  }
}

/** Triage queue: inbound emails that didn't fully resolve to a candidate. */
export async function listTriage(tx: Parameters<Parameters<typeof withServiceTransaction>[0]>[0], orgId: string) {
  return tx
    .select()
    .from(inboundEmails)
    .where(and(eq(inboundEmails.orgId, orgId), sql`${inboundEmails.parsedStatus} <> 'parsed'`))
    .orderBy(desc(inboundEmails.createdAt));
}
