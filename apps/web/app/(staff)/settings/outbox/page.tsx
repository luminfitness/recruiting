import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { messagesLog } from "@usapt/db/schema";
import { requireUser, hasRole } from "@/lib/auth";
import { withUser } from "@/lib/db-context";

export default async function OutboxPage() {
  const authed = await requireUser();
  if (!hasRole(authed, "admin")) redirect("/settings/appearance");

  const rows = await withUser((tx) => tx.select().from(messagesLog).orderBy(desc(messagesLog.createdAt)).limit(100));

  const td: React.CSSProperties = { padding: "12px", borderBottom: "1px solid var(--usapt-border)", fontSize: 13, verticalAlign: "top" };
  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--usapt-text-muted)",
    padding: "8px 12px",
    borderBottom: "1px solid var(--usapt-border)",
  };

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Dev · Mock provider outbox
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 8px" }}>Messages log</h1>
      <p style={{ color: "var(--usapt-text-muted)", fontSize: 13.5, marginBottom: 20, maxWidth: 620 }}>
        Everything the Mock messaging provider &quot;sends&quot; lands here instead of a real inbox — invitations,
        reminders, offers, confirmations. When a real Twilio/SendGrid provider is configured (Phase 11), these go out
        for real and this view shows the send log.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>When</th>
            <th style={th}>Channel</th>
            <th style={th}>To</th>
            <th style={th}>Subject / template</th>
            <th style={th}>Body</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const to = (m.toAddress as { to?: string })?.to ?? "";
            const subj = m.subjectOrTemplate as { subject?: string; templateKey?: string };
            const body = (m.body as { body?: string })?.body ?? "";
            return (
              <tr key={m.id}>
                <td style={{ ...td, color: "var(--usapt-text-muted)", whiteSpace: "nowrap" }}>{new Date(m.createdAt).toLocaleString()}</td>
                <td style={{ ...td }}>{m.channel === "messaging_email" ? "Email" : "SMS"}</td>
                <td style={{ ...td }}>{to}</td>
                <td style={{ ...td }}>{subj.subject ?? subj.templateKey}</td>
                <td style={{ ...td, color: "var(--usapt-text-muted)", whiteSpace: "pre-wrap", maxWidth: 420 }}>{body}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td style={{ ...td, color: "var(--usapt-text-muted)" }} colSpan={5}>
                No messages yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
