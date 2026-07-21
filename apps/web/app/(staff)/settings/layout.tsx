import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { landingPathForRoles } from "@/lib/roles";
import { SettingsNav, type SettingsSection } from "./SettingsNav";

/**
 * Settings console — the configuration surface, visually distinct from the
 * daily funnel work. Admin-only; grouped section tabs over the re-homed
 * org/integrations/cadence/activity/outbox screens.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!hasRole(user, "admin")) redirect(landingPathForRoles(user.roles));

  const sections: SettingsSection[] = [
    { label: "Organization", href: "/settings/organization" },
    { label: "Integrations", href: "/settings/integrations" },
    { label: "Cadence rules", href: "/settings/cadence-rules" },
    { label: "Activity log", href: "/settings/activity" },
    ...(isDemoMode() ? [{ label: "Message outbox", href: "/settings/outbox" }] : []),
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
