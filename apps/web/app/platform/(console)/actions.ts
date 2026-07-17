"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/platform-auth";
import { createOrganization, createSupportGrant } from "@/lib/platform";

export async function createOrgAction(formData: FormData) {
  await requirePlatformAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const adminName = String(formData.get("adminName") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  if (!name || !slug || !adminName || !adminEmail) return;
  await createOrganization({ name, slug, adminName, adminEmail });
  revalidatePath("/platform");
}

export async function createSupportGrantAction(formData: FormData) {
  const admin = await requirePlatformAdmin();
  const orgId = String(formData.get("orgId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const hours = parseInt(String(formData.get("hours") ?? "4"), 10);
  if (!orgId || !reason) return;
  await createSupportGrant(admin.id, orgId, reason, Number.isNaN(hours) ? 4 : hours);
  revalidatePath("/platform");
}
