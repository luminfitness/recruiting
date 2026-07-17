import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ImportWizard } from "./ImportWizard";

export default async function ImportPage() {
  await requireUser();
  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 760 }}>
      <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginBottom: 12 }}>
        <Link href="/pipeline" style={{ color: "inherit" }}>Pipeline</Link> → Import
      </div>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Historical import
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Import candidates from a spreadsheet</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 20, maxWidth: 620 }}>
        One-time Master Tracker import. Map your columns to the platform&apos;s fields — historical rows are created at
        their existing status (with a synthesized timeline entry), deduplicated against active candidates by email, and
        do <strong>not</strong> trigger invitations.
      </p>
      <ImportWizard />
    </div>
  );
}
