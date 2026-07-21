"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SettingsSection = { label: string; href: string };

export function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const pathname = usePathname();
  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "1px solid var(--usapt-border)" }}>
      {sections.map((s) => {
        const active = pathname === s.href || pathname.startsWith(s.href + "/");
        return (
          <Link
            key={s.href}
            href={s.href}
            style={{
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
              color: active ? "var(--usapt-brand-blue)" : "var(--usapt-text-muted)",
              borderBottom: `2px solid ${active ? "var(--usapt-brand-blue)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
