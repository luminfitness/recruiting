import { desc, eq } from "drizzle-orm";
import { classCohorts } from "@usapt/db/schema";
import { StatusPill } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";
import { listAssignable, listCohortMembers } from "@/lib/cohorts";
import { addMembersAction, createCohortAction, startClassAction, transitionMemberAction } from "./actions";

export default async function CohortsPage() {
  const { cohorts, assignable } = await withUser(async (tx, _client, user) => {
    const cohortRows = await tx.select().from(classCohorts).where(eq(classCohorts.orgId, user.orgId)).orderBy(desc(classCohorts.classStartAt));
    const cohorts = await Promise.all(cohortRows.map(async (c) => ({ ...c, members: await listCohortMembers(tx, c.id) })));
    const assignable = await listAssignable(tx);
    return { cohorts, assignable };
  });

  const inputStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13, border: "1px solid var(--usapt-border)", background: "var(--usapt-surface-raised)" };
  const btn = (bg: string, fg: string): React.CSSProperties => ({ padding: "5px 10px", fontFamily: "inherit", fontWeight: 600, fontSize: 12, color: fg, background: bg, border: "1px solid var(--usapt-border)", cursor: "pointer" });

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 900 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        The funnel · step 5
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Classes</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 20, maxWidth: 620 }}>
        Group confirmed hires into a class, start the class, and track graduation. Post-hire status changes here flow
        straight into the live pipeline and analytics.
      </p>

      <section style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 10px", borderBottom: "1px solid var(--usapt-border)", paddingBottom: 8 }}>New cohort</h3>
        <form action={createCohortAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "var(--usapt-text-muted)" }}>Orientation</label>
          <input name="orientationAt" type="datetime-local" required style={inputStyle} />
          <label style={{ fontSize: 12, color: "var(--usapt-text-muted)" }}>Class start</label>
          <input name="classStartAt" type="datetime-local" required style={inputStyle} />
          <button type="submit" style={{ ...btn("var(--usapt-brand-blue)", "#fff"), padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Create cohort</button>
        </form>
      </section>

      {cohorts.map((c) => {
        // Cohort phase, derived from where its members actually are — not a
        // stored field, so it can never drift from the members' real statuses.
        const inClass = c.members.filter((m) => m.status === "in_class").length;
        const graduated = c.members.filter((m) => ["graduated", "graduated_inactive"].includes(m.status)).length;
        const settled = ["graduated", "graduated_inactive", "never_started", "quit_during_class", "quit_after_orientation"];
        const phase =
          c.members.length > 0 && c.members.every((m) => settled.includes(m.status))
            ? { label: "Completed", fill: "var(--status-positive-fill)", fg: "var(--status-positive-text)" }
            : inClass > 0
              ? { label: "In progress", fill: "var(--status-motion-fill)", fg: "var(--status-motion-text)" }
              : { label: "Upcoming", fill: "var(--status-negative-fill)", fg: "var(--status-negative-text)" };

        return (
        <section key={c.id} style={{ marginBottom: 28, border: "1px solid var(--usapt-border)", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <strong style={{ fontSize: 15 }}>Class starting {new Date(c.classStartAt).toLocaleDateString()}</strong>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: "var(--usapt-radius-pill)", background: phase.fill, color: phase.fg }}>
                  {phase.label}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--usapt-text-muted)" }}>
                Orientation {new Date(c.orientationAt).toLocaleDateString()} · {c.members.length} members
                {c.members.length ? ` · ${inClass} in class · ${graduated} graduated` : ""}
              </div>
            </div>
            {c.members.some((m) => m.status === "confirmed_orientation") ? (
              <form action={startClassAction.bind(null, c.id)}>
                <button type="submit" style={{ ...btn("var(--usapt-brand-blue)", "#fff"), padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>Start class →</button>
              </form>
            ) : null}
          </div>

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {c.members.map((m) => (
              <li key={m.candidateId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--usapt-neutral-200)" }}>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{m.name}</span>
                <StatusPill status={m.status} />
                {m.status === "confirmed_orientation" ? (
                  <>
                    <form action={transitionMemberAction.bind(null, m.candidateId, "class_started")}>
                      <button type="submit" style={btn("var(--status-motion-fill)", "var(--status-motion-text)")}>Start</button>
                    </form>
                    <form action={transitionMemberAction.bind(null, m.candidateId, "never_started")}>
                      <button type="submit" style={btn("var(--status-negative-fill)", "var(--status-negative-text)")}>Never started</button>
                    </form>
                  </>
                ) : null}
                {m.status === "in_class" ? (
                  <>
                    <form action={transitionMemberAction.bind(null, m.candidateId, "graduated")}>
                      <button type="submit" style={btn("var(--status-positive-fill)", "var(--status-positive-text)")}>Graduate</button>
                    </form>
                    <form action={transitionMemberAction.bind(null, m.candidateId, "quit_during_class")}>
                      <button type="submit" style={btn("var(--status-negative-fill)", "var(--status-negative-text)")}>Quit</button>
                    </form>
                  </>
                ) : null}
              </li>
            ))}
            {c.members.length === 0 ? <li style={{ fontSize: 13, color: "var(--usapt-text-muted)", padding: "8px 0" }}>No members yet.</li> : null}
          </ul>

          {assignable.length ? (
            <form action={addMembersAction.bind(null, c.id)} style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginBottom: 6 }}>Add confirmed hires:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                {assignable.map((a) => (
                  <label key={a.candidateId} style={{ fontSize: 13, display: "flex", gap: 5, alignItems: "center" }}>
                    <input type="checkbox" name="candidateId" value={a.candidateId} /> {a.name}
                  </label>
                ))}
              </div>
              <button type="submit" style={{ ...btn("var(--usapt-surface-raised)", "var(--usapt-ink)"), fontWeight: 700 }}>Add selected</button>
            </form>
          ) : null}
        </section>
        );
      })}
      {cohorts.length === 0 ? <p style={{ fontSize: 13, color: "var(--usapt-text-muted)" }}>No cohorts yet.</p> : null}
    </div>
  );
}
