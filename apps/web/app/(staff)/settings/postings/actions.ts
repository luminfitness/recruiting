"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { withRequestContext } from "@usapt/db";
import { auditLog, brandRoleSettings, brands, copyTemplates } from "@usapt/db/schema";
import { requireUser, hasRole } from "@/lib/auth";

const MAX_BODY = 20_000;

/**
 * Saves a brand's default ad language for one role, plus that role's scheduling
 * link and contact number.
 *
 * The copy is stored as a NEW version rather than an in-place edit — the table
 * is versioned on purpose, and job_postings.copy_snapshot freezes what actually
 * went out, so neither history nor a scheduled posting is disturbed by an edit.
 */
export async function savePostingCopyAction(formData: FormData) {
  const user = await requireUser();
  if (!hasRole(user, "admin")) throw new Error("Only admins may edit posting language");

  const brandId = String(formData.get("brandId") ?? "");
  const roleType = String(formData.get("roleType") ?? "");
  if (!brandId || (roleType !== "manager" && roleType !== "trainer")) return;

  // Browsers normalise textarea values to CRLF on submit; store LF so the copy
  // matches the shipped defaults byte-for-byte and diffs stay readable.
  const body = String(formData.get("body") ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, MAX_BODY);
  const contactNumber = String(formData.get("contactNumber") ?? "").trim().slice(0, 60) || null;
  const schedulingLink = String(formData.get("schedulingLink") ?? "").trim().slice(0, 500) || null;

  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    // Brand must belong to the caller's org (RLS also enforces this; the explicit
    // check keeps the failure legible instead of a silent no-op).
    const [brand] = await tx.select().from(brands).where(and(eq(brands.id, brandId), eq(brands.orgId, user.orgId)));
    if (!brand) throw new Error("Unknown brand");

    if (body) {
      const [latest] = await tx
        .select({ version: copyTemplates.version })
        .from(copyTemplates)
        .where(and(eq(copyTemplates.orgId, user.orgId), eq(copyTemplates.brandId, brandId), eq(copyTemplates.roleType, roleType)))
        .orderBy(desc(copyTemplates.version));

      await tx.insert(copyTemplates).values({
        orgId: user.orgId,
        brandId,
        roleType,
        // Stored against the primary channel; resolveCopy falls back across
        // channels, so this one edit covers every board.
        channel: "indeed",
        name: `${roleType === "manager" ? "Manager" : "Trainer"} ad — ${brand.name}`,
        body,
        version: (latest?.version ?? 0) + 1,
      });
    }

    const [existing] = await tx
      .select()
      .from(brandRoleSettings)
      .where(and(eq(brandRoleSettings.brandId, brandId), eq(brandRoleSettings.roleType, roleType)));

    if (existing) {
      await tx
        .update(brandRoleSettings)
        .set({ contactNumber, schedulingLink, updatedAt: new Date() })
        .where(eq(brandRoleSettings.id, existing.id));
    } else {
      await tx.insert(brandRoleSettings).values({ orgId: user.orgId, brandId, roleType, contactNumber, schedulingLink });
    }

    await tx.insert(auditLog).values({
      orgId: user.orgId,
      actorUserId: user.userId,
      action: "posting_copy_updated",
      resourceType: "brand",
      resourceId: brandId,
      metadata: { roleType, bodyChanged: Boolean(body) },
    });
  });

  revalidatePath("/settings/postings");
  revalidatePath("/sourcing");
}
