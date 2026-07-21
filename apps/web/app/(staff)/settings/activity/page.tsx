import { desc, eq } from "drizzle-orm";
import { auditLog, users } from "@usapt/db/schema";
import { requireUser, hasRole } from "@/lib/auth";
import { withUser } from "@/lib/db-context";

const ACTION_LABEL: Record<string, string> = {
  decision_recorded: "Decision recorded",
  disclosure_viewed: "Disclosure viewed",
  offer_sent: "Offer sent",
  offer_accepted: "Offer accepted",
  offer_declined: "Offer declined",
  offer_resent: "Offer resent",
  offer_retracted: "Offer retracted",
  referred_local: "Referred to local",
  local_outcome_hired: "Local outcome: hired",
  local_outcome_declined: "Local outcome: declined",
  local_outcome_no_show: "Local outcome: no-show",
  market_reassigned: "Market reassigned",
  posting_marked_posted: "Posting published",
  posting_ended: "Posting ended",
  tm_rebooked: "TM: rebooked",
  tm_unresponsive: "TM: unresponsive",
  parser_incident: "Parser incident",
  user_deactivated: "User deactivated",
};

export default async function AuditPage() {
  const authed = await requireUser();
  if (!hasRole(authed, "admin")) {
    return (
      <div style={{ padding: "34px 40px" }}>
        <h1 style={{ fontSize: 24 }}>Audit log</h1>
        <p style={{ color: "var(--usapt-text-muted)" }}>Admins only.</p>
      </div>
    );
  }

  const rows = await withUser(async (tx) =>
    tx
      .select({
        id: auditLog.id,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        metadata: auditLog.metadata,
        createdAt: auditLog.createdAt,
        actorName: users.name,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .orderBy(desc(auditLog.createdAt))
      .limit(200),
  );

  const th: React.CSSProperties = { textAlign: "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "8px 12px", borderBottom: "1px solid var(--usapt-border)" };
  const td: React.CSSProperties = { padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, verticalAlign: "top" };

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Compliance
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Audit log</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 20, maxWidth: 640 }}>
        Every decision, offer action, local outcome, and — critically — every felony-disclosure view is recorded here
        with who and when. This is the accountability record for the most sensitive actions in the system.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["When", "Action", "Actor", "Resource", "Detail"].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = r.metadata as Record<string, unknown>;
            const metaStr = Object.keys(meta ?? {}).length ? JSON.stringify(meta) : "";
            const isSensitive = r.action === "disclosure_viewed";
            return (
              <tr key={r.id}>
                <td style={{ ...td, whiteSpace: "nowrap", color: "var(--usapt-text-muted)" }}>{new Date(r.createdAt).toLocaleString()}</td>
                <td style={td}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", background: isSensitive ? "var(--status-action-fill)" : "var(--usapt-surface)", color: isSensitive ? "var(--status-action-text)" : "var(--usapt-ink)" }}>
                    {ACTION_LABEL[r.action] ?? r.action}
                  </span>
                </td>
                <td style={td}>{r.actorName ?? "system"}</td>
                <td style={{ ...td, color: "var(--usapt-text-muted)" }}>{r.resourceType}</td>
                <td style={{ ...td, color: "var(--usapt-text-muted)", maxWidth: 320, wordBreak: "break-word" }}>{metaStr}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr><td colSpan={5} style={{ ...td, color: "var(--usapt-text-muted)" }}>No audit entries yet.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
