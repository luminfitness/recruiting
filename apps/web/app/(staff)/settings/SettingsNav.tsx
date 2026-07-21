"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SettingsSection = { label: string; href: string };

export function SettingsNav({ sections }: { sections: SettingsSection[] }) {
  const pathname = usePathname();
  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "2px solid var(--usapt-border-strong)" }}>
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
              borderBottom: `3px solid ${active ? "var(--usapt-brand-red)" : "transparent"}`,
              marginBottom: -2,
            }}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
