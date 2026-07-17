"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db-context";
import { CATEGORY_META, setIntegration, type IntegrationCategory } from "@/lib/integrations";
import { hasRole } from "@/lib/auth";

export async function setIntegrationAction(category: IntegrationCategory, formData: FormData) {
  const providerKey = String(formData.get("providerKey") ?? "mock");
  const meta = CATEGORY_META.find((m) => m.category === category);
  const provider = meta?.providers.find((p) => p.key === providerKey);
  const credentials: Record<string, string> = {};
  for (const f of provider?.fields ?? []) credentials[f] = String(formData.get(f) ?? "");

  await withUser(async (tx, _client, user) => {
    if (!hasRole(user, "admin")) throw new Error("Admins only");
    await setIntegration(tx, user.orgId, category, providerKey, credentials);
  });
  revalidatePath("/settings/integrations");
}
