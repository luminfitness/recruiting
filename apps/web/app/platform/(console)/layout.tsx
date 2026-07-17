import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform-auth";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  return (
    <div style={{ minHeight: "100vh", background: "var(--usapt-bg)", fontFamily: "var(--font-archivo), system-ui, sans-serif" }}>
      <div style={{ background: "var(--usapt-ink)", color: "#fff", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "3px solid var(--usapt-brand-red)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <strong style={{ fontFamily: "var(--font-archivo-black)" }}>Grounded Labs</strong>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-neutral-400)" }}>Platform console</span>
          <Link href="/platform" style={{ color: "#fff", fontSize: 13, textDecoration: "none" }}>Organizations</Link>
        </div>
        <span style={{ fontSize: 12, color: "var(--usapt-neutral-400)" }}>{admin.email}</span>
      </div>
      <div style={{ padding: "28px 24px" }}>{children}</div>
    </div>
  );
}
