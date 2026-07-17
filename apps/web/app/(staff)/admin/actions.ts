"use server";

import { revalidatePath } from "next/cache";
import { withRequestContext } from "@usapt/db";
import { brands, markets, users, userRoles } from "@usapt/db/schema";
import { requireUser, hasRole } from "@/lib/auth";

async function requireAdmin() {
  const user = await requireUser();
  if (!hasRole(user, "admin")) {
    throw new Error("Only admins may perform this action");
  }
  return user;
}

export async function createBrandAction(formData: FormData) {
  const user = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const replyIdentityName = String(formData.get("replyIdentityName") ?? "").trim();
  const replyIdentityEmail = String(formData.get("replyIdentityEmail") ?? "").trim();
  if (!name || !slug || !replyIdentityName || !replyIdentityEmail) return;

  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    await tx.insert(brands).values({ orgId: user.orgId, name, slug, replyIdentityName, replyIdentityEmail });
  });
  revalidatePath("/admin");
}

export async function createMarketAction(formData: FormData) {
  const user = await requireAdmin();
  const brandId = String(formData.get("brandId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!brandId || !name || !timezone) return;

  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    await tx.insert(markets).values({ brandId, name, timezone });
  });
  revalidatePath("/admin");
}

export async function createUserAction(formData: FormData) {
  const user = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!name || !email || !role) return;

  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    const [newUser] = await tx.insert(users).values({ orgId: user.orgId, name, email }).returning();
    await tx.insert(userRoles).values({ userId: newUser.id, orgId: user.orgId, role: role as (typeof userRoles.$inferInsert)["role"] });
  });
  revalidatePath("/admin");
}
