import { cookies } from "next/headers";

/**
 * Staff console appearance preference — persisted in a cookie (no DB schema
 * change). Read server-side in the (staff) layout to set data-theme on the
 * console shell before first paint, so there's no light→dark flash. Only the
 * staff console reads this; candidate / field / platform surfaces keep their
 * own looks. See packages/design-tokens/tokens.css for the Flat-Dark palette.
 */
export const THEME_COOKIE = "usapt-theme";

export type ThemePref = "light" | "dark" | "system";

const VALID: readonly ThemePref[] = ["light", "dark", "system"];

export function isThemePref(value: string | undefined | null): value is ThemePref {
  return value != null && (VALID as readonly string[]).includes(value);
}

/** The persisted preference, defaulting to "light" (the flat cream default). */
export async function getThemePref(): Promise<ThemePref> {
  const raw = (await cookies()).get(THEME_COOKIE)?.value;
  return isThemePref(raw) ? raw : "light";
}
