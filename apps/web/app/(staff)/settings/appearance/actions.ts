"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { THEME_COOKIE, isThemePref, type ThemePref } from "@/lib/theme";

/**
 * Persists the caller's appearance preference. Available to any authenticated
 * staff user (not admin-gated) — it only writes their own cookie, never org
 * data, so it touches no schema, RLS, or service logic.
 */
export async function setThemeAction(theme: ThemePref) {
  await requireUser();
  if (!isThemePref(theme)) return;

  const jar = await cookies();
  jar.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Re-render server components (the (staff) shell reads the cookie) so a full
  // navigation reflects the choice; the picker also retheme the shell inline.
  revalidatePath("/", "layout");
}
