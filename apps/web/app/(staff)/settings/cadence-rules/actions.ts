"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { brands } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";
import { createCadenceRule, createCopyTemplate, seedDefaultCadence, setCadenceRuleActive, type Channel, type RoleType } from "@/lib/cadence";

export async function seedDefaultCadenceAction() {
  await withUser(async (tx, _client, user) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.orgId, user.orgId));
    if (brand) await seedDefaultCadence(tx, user.orgId, brand.id);
  });
  revalidatePath("/settings/cadence-rules");
}

export async function createRuleAction(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "") || null;
  const dayOfWeek = parseInt(String(formData.get("dayOfWeek") ?? "0"), 10);
  const time = String(formData.get("time") ?? "09:00");
  const action = String(formData.get("action") ?? "post") as "post" | "switch_mode" | "end" | "remind";
  const roleType = String(formData.get("roleType") ?? "trainer") as RoleType;
  const channel = String(formData.get("channel") ?? "indeed") as Channel;
  await withUser((tx, _client, user) => createCadenceRule(tx, user.orgId, { brandId, marketId: null, dayOfWeek, time, action, roleType, channel }));
  revalidatePath("/settings/cadence-rules");
}

export async function toggleRuleAction(ruleId: string, active: boolean) {
  await withUser((tx) => setCadenceRuleActive(tx, ruleId, active));
  revalidatePath("/settings/cadence-rules");
}

export async function createTemplateAction(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const roleType = String(formData.get("roleType") ?? "trainer") as RoleType;
  const channel = String(formData.get("channel") ?? "indeed") as Channel;
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!brandId || !name || !body) return;
  await withUser((tx, _client, user) => createCopyTemplate(tx, user.orgId, { brandId, roleType, channel, name, body }));
  revalidatePath("/settings/cadence-rules");
}
