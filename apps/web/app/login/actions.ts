"use server";

import { requestMagicLink } from "@/lib/magic-link";

export interface MagicLinkFormState {
  status: "idle" | "error" | "sent";
  message: string;
}

export async function requestMagicLinkAction(_prevState: MagicLinkFormState, formData: FormData): Promise<MagicLinkFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { status: "error", message: "Enter your email." };

  const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  await requestMagicLink(email, appBaseUrl);

  // Same response whether or not the email matched a user — don't leak account existence.
  return { status: "sent", message: "If that email has an account, a sign-in link is on its way." };
}
