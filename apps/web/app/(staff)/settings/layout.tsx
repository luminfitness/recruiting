import { requireUser, hasRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { SettingsNav, type SettingsSection } from "./SettingsNav";

/**
 * Settings console — the configuration surface, visually distinct from the
 * daily funnel work. Every staff member gets Appearance (a per-user
 * preference); the org-configuration tabs are admin-only and each of those
 * pages guards itself, so no non-admin can read them directly.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const sections: SettingsSection[] = [
    { label: "Appearance", href: "/settings/appearance" },
    ...(hasRole(user, "admin")
      ? [
          { label: "Organization", href: "/settings/organization" },
          { label: "Grading", href: "/settings/grading" },
          { label: "Integrations", href: "/settings/integrations" },
          { label: "Cadence rules", href: "/settings/cadence-rules" },
          { label: "Activity log", href: "/settings/activity" },
          ...(isDemoMode() ? [{ label: "Message outbox", href: "/settings/outbox" }] : []),
        ]
      : []),
  ];

  return (
    <div>
      <div style={{ padding: "30px 40px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden style={{ fontSize: 18 }}>⚙</span>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>Settings</div>
        </div>
        <div style={{ marginTop: 14 }}>
          <SettingsNav sections={sections} />
        </div>
      </div>
      {children}
    </div>
  );
}
