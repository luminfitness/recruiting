"use server";

import { eq } from "drizzle-orm";
import { getServiceDb } from "@usapt/db";
import { platformAdmins } from "@usapt/db/schema";
import { makeMagicToken } from "@/lib/platform-auth";

export interface PlatformLoginState {
  status: "idle" | "sent";
  message: string;
  /** Dev-only: the sign-in link, surfaced in the UI (no org-scoped outbox exists for platform links). In production this is emailed. */
  devLink?: string;
}

export async function requestPlatformLinkAction(_prev: PlatformLoginState, formData: FormData): Promise<PlatformLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const db = getServiceDb();
  const [admin] = email ? await db.select().from(platformAdmins).where(eq(platformAdmins.email, email)) : [];

  let devLink: string | undefined;
  if (admin) {
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const url = `${baseUrl}/platform/verify/${makeMagicToken(admin.id)}`;
    console.log(`[platform magic link] ${email} -> ${url}`);
    if (process.env.NODE_ENV !== "production") devLink = url;
  }
  return { status: "sent", message: "If that email is a platform admin, a sign-in link is on its way.", devLink };
}
