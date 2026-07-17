import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { brands, candidates, candidateStatusHistory, markets } from "@usapt/db/schema";
import { generateCandidateToken, isActiveStatus, type CandidateStatus } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

/** The candidate fields an import can map CSV columns onto. */
export const IMPORT_FIELDS = ["firstName", "lastName", "email", "phone", "roleType", "brand", "market", "source", "status", "appliedAt"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

const VALID_STATUSES = new Set<string>([
  "applied", "invited", "no_show", "attended", "evaluated", "offer", "backup", "awaiting_review", "not_selected",
  "awaiting_reply", "referred_local", "working_interview", "local_declined", "confirmed_orientation", "in_class",
  "graduated", "declined", "never_started", "quit_after_orientation", "quit_during_class", "mia", "graduated_inactive",
]);

/** Minimal RFC-4180-ish CSV parser (handles quoted fields, embedded commas/quotes/newlines). */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const t = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const headers = nonEmpty.shift() ?? [];
  return { headers: headers.map((h) => h.trim()), rows: nonEmpty };
}

export type ColumnMapping = Partial<Record<ImportField, number>>; // field -> column index

export interface ImportResult {
  created: number;
  skippedDuplicates: number;
  errors: { rowIndex: number; reason: string }[];
}

function normalizeRole(v: string): "manager" | "trainer" | null {
  const s = v.toLowerCase();
  if (s.includes("manager")) return "manager";
  if (s.includes("train")) return "trainer";
  return null;
}
function normalizeSource(v: string): "indeed" | "linkedin" | "referral" | "other" {
  const s = v.toLowerCase();
  if (s.includes("indeed")) return "indeed";
  if (s.includes("linkedin")) return "linkedin";
  if (s.includes("refer")) return "referral";
  return "other";
}

/**
 * One-time historical import of a Master Tracker export (FR-1.10). Built as a
 * generic, reusable column-mapped importer (other orgs need it too), not a
 * USAPT-specific one-off. Each row:
 *  - resolves brand + market by name within the org (skips row if unresolved)
 *  - dedups on email against ACTIVE candidates (skips, never double-tokens)
 *  - INSERTs at the mapped historical status directly (INSERT isn't blocked by
 *    the status-guard trigger, which only guards UPDATEs) and synthesizes a
 *    single 'imported' status-history row so the timeline isn't empty
 *  - does NOT send invitations (historical rows are not live applicants)
 */
export async function importCandidates(tx: Tx, orgId: string, mapping: ColumnMapping, rows: string[][]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, skippedDuplicates: 0, errors: [] };
  const brandRows = await tx.select().from(brands).where(eq(brands.orgId, orgId));
  const brandByName = new Map(brandRows.map((b) => [b.name.toLowerCase(), b]));
  const marketRows = await tx.select().from(markets);
  const brandIds = new Set(brandRows.map((b) => b.id));
  const marketByName = new Map(marketRows.filter((m) => brandIds.has(m.brandId)).map((m) => [m.name.toLowerCase(), m]));

  const get = (row: string[], field: ImportField): string => {
    const idx = mapping[field];
    return idx != null ? (row[idx] ?? "").trim() : "";
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = get(row, "email").toLowerCase();
    const firstName = get(row, "firstName");
    const lastName = get(row, "lastName");
    if (!email || !firstName) {
      result.errors.push({ rowIndex: i, reason: "missing name or email" });
      continue;
    }
    const roleType = normalizeRole(get(row, "roleType")) ?? "trainer";
    const brand = brandByName.get(get(row, "brand").toLowerCase()) ?? brandRows[0];
    if (!brand) {
      result.errors.push({ rowIndex: i, reason: "no brand" });
      continue;
    }
    const market = marketByName.get(get(row, "market").toLowerCase()) ?? marketRows.find((m) => m.brandId === brand.id);
    if (!market) {
      result.errors.push({ rowIndex: i, reason: "no market for brand" });
      continue;
    }
    const statusRaw = get(row, "status").toLowerCase().replace(/[\s-]+/g, "_");
    const status = (VALID_STATUSES.has(statusRaw) ? statusRaw : "applied") as CandidateStatus;

    // Dedup against active candidates (same as live ingestion).
    const existing = await tx.select().from(candidates).where(and(eq(candidates.orgId, orgId), eq(candidates.email, email)));
    if (existing.some((c) => isActiveStatus(c.status as CandidateStatus))) {
      result.skippedDuplicates++;
      continue;
    }

    const appliedRaw = get(row, "appliedAt");
    // A bare YYYY-MM-DD parses as UTC midnight and can display a day early in
    // negative-offset timezones — pin it to local noon so the calendar date is stable.
    const appliedAt = appliedRaw && !Number.isNaN(Date.parse(appliedRaw))
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(appliedRaw) ? `${appliedRaw}T12:00:00` : appliedRaw)
      : new Date();

    const [created] = await tx
      .insert(candidates)
      .values({
        orgId,
        brandId: brand.id,
        marketId: market.id,
        firstName,
        lastName: lastName || firstName,
        email,
        phone: get(row, "phone") || null,
        roleType,
        source: normalizeSource(get(row, "source")),
        token: generateCandidateToken(),
        status,
        appliedAt,
      })
      .returning();

    await tx.insert(candidateStatusHistory).values({ candidateId: created.id, fromStatus: null, toStatus: status, event: "imported", reason: "Historical import" });
    result.created++;
  }

  return result;
}
