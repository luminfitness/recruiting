"use server";

import { headers } from "next/headers";
import { submitApplication, type ApplyResult } from "@/lib/public-apply";

export type ApplyState = ApplyResult | { ok: null };

/**
 * Public, unauthenticated. Everything trust-related happens inside
 * submitApplication — this only pulls the form values and the caller IP.
 */
export async function submitApplicationAction(
  brandSlug: string,
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();

  return submitApplication(
    {
      brandSlug,
      roleType: String(formData.get("roleType") ?? ""),
      marketId: String(formData.get("marketId") ?? ""),
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      source: String(formData.get("source") ?? ""),
      honeypot: String(formData.get("company") ?? ""),
    },
    ip,
  );
}
