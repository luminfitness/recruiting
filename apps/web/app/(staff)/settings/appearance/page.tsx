import { requireUser } from "@/lib/auth";
import { getThemePref } from "@/lib/theme";
import { ThemePicker } from "./ThemePicker";

/**
 * Appearance — a per-user preference, available to every staff member (unlike
 * the org-configuration screens, which stay admin-only). Lets the user pick the
 * console Look: Light (the default warm-cream Flat), Dark (Flat-Dark), or
 * System. The choice persists in a cookie and re-themes only the staff console.
 */
export default async function AppearancePage() {
  await requireUser();
  const theme = await getThemePref();

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)", fontWeight: 700 }}>
        Profile
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 8px", fontWeight: 800 }}>Appearance</h1>
      <p style={{ color: "var(--usapt-text-muted)", fontSize: 13.5, marginBottom: 24, maxWidth: 620, lineHeight: 1.5 }}>
        Choose how the recruiting console looks for you. This preference is saved to your
        device and only affects your view — teammates keep their own.
      </p>

      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-faint)", fontWeight: 800, marginBottom: 12 }}>
        Theme
      </div>
      <ThemePicker initial={theme} />
    </div>
  );
}
