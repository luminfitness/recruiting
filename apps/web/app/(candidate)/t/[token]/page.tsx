import { notFound } from "next/navigation";
import { BrandThemeProvider } from "@usapt/design-tokens";
import { getServiceDb } from "@usapt/db";
import { resolveCandidateToken } from "@/lib/candidate-token";
import { listBookableSessions } from "@/lib/sessions";
import { BookingForm, type SessionOption } from "./BookingForm";

function fmtDay(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default async function CandidateBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const candidate = await resolveCandidateToken(token);
  if (!candidate) notFound();

  const db = getServiceDb();
  const sessions = await listBookableSessions(db, {
    id: candidate.id,
    orgId: candidate.orgId,
    roleType: candidate.roleType,
    marketId: candidate.marketId,
  });

  const current = sessions.find((s) => s.isCurrentBooking);
  const roleLabel = candidate.roleType === "manager" ? "Manager" : "Personal Trainer";
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const joinUrl = `${baseUrl}/join/${token}`;

  const options: SessionOption[] = sessions
    .filter((s) => !s.isCurrentBooking)
    .map((s) => ({
      id: s.id,
      dayLabel: fmtDay(s.scheduledAt),
      timeLabel: fmtTime(s.scheduledAt),
      spotsLabel: s.booked >= s.capacity ? "Full" : `${s.capacity - s.booked} spots left`,
      full: s.booked >= s.capacity,
    }));

  return (
    <BrandThemeProvider theme={candidate.theme}>
      <div style={{ minHeight: "100vh", background: "#1a1a1a", padding: "28px 20px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: 390, maxWidth: "100%", background: "#fff", boxShadow: "var(--usapt-shadow-lg)" }}>
          <div style={{ background: "var(--brand-primary)", padding: "20px 22px 22px" }}>
            <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "#fff", opacity: 0.9 }}>
              {candidate.brandName}
            </div>
            <div style={{ fontFamily: "var(--font-archivo-black)", fontSize: 27, lineHeight: 1.02, color: "#fff", marginTop: 12 }}>
              {current ? "YOU'RE BOOKED!" : "BOOK YOUR INTERVIEW"}
            </div>
          </div>

          {current ? (
            <div style={{ padding: "22px" }}>
              <p style={{ fontSize: 13.5, color: "var(--usapt-neutral-800)", margin: "0 0 16px", lineHeight: 1.55 }}>
                A confirmation and calendar invite are on their way by email{candidate ? " and text" : ""}.
              </p>
              <div style={{ border: "1px solid var(--usapt-border)", padding: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-neutral-600)" }}>
                  Your session
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{fmtDay(current.scheduledAt)}</div>
                <div style={{ fontSize: 14, color: "var(--usapt-neutral-800)" }}>{fmtTime(current.scheduledAt)}</div>
                <div style={{ height: 1, background: "var(--usapt-border)", margin: "12px 0" }} />
                <div style={{ fontSize: 12.5, color: "var(--usapt-neutral-700)", lineHeight: 1.6 }}>
                  Virtual group interview · ~45 min
                  <br />
                  Your join link is personal to you — don&apos;t forward it.
                </div>
              </div>

              {/* Demo aid: in production the join link is time-gated and delivered ~1h before. */}
              <a
                href={joinUrl}
                style={{
                  display: "block",
                  textAlign: "center",
                  width: "100%",
                  marginTop: 14,
                  padding: "14px 0",
                  boxSizing: "border-box",
                  fontFamily: "var(--font-archivo-black), sans-serif",
                  fontSize: 14,
                  color: "#fff",
                  background: "var(--brand-primary)",
                  textDecoration: "none",
                }}
              >
                JOIN NOW (DEMO)
              </a>

              {options.length > 0 ? (
                <details style={{ marginTop: 16 }}>
                  <summary style={{ fontSize: 12.5, color: "var(--usapt-neutral-600)", cursor: "pointer" }}>
                    Need a different time? Rebook →
                  </summary>
                  <div style={{ marginTop: 8, margin: "8px -22px -24px" }}>
                    <BookingForm token={token} sessions={options} />
                  </div>
                </details>
              ) : null}

              <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "var(--usapt-neutral-400)", letterSpacing: "0.08em" }}>
                RECRUITING POWERED BY USA PT
              </div>
            </div>
          ) : options.length > 0 ? (
            <>
              <div style={{ padding: "20px 22px 0" }}>
                <p style={{ fontSize: 15, margin: "0 0 4px" }}>Hi {candidate.firstName} —</p>
                <p style={{ fontSize: 13.5, color: "var(--usapt-neutral-800)", margin: 0, lineHeight: 1.55 }}>
                  You applied to be a <strong>{roleLabel}</strong> at {candidate.brandName}
                  {candidate.marketName ? `, ${candidate.marketName}` : ""}. Pick a virtual group interview below. No
                  account needed.
                </p>
              </div>
              <BookingForm token={token} sessions={options} />
              <div style={{ textAlign: "center", padding: "0 22px 20px", fontSize: 10, color: "var(--usapt-neutral-400)", letterSpacing: "0.08em" }}>
                RECRUITING POWERED BY USA PT
              </div>
            </>
          ) : (
            <div style={{ padding: "22px" }}>
              <p style={{ fontSize: 15, margin: "0 0 8px" }}>Hi {candidate.firstName} —</p>
              <p style={{ fontSize: 13.5, color: "var(--usapt-neutral-800)", lineHeight: 1.55 }}>
                There aren&apos;t any interview sessions open for your role right now. Our team will reach out with times
                shortly — no action needed.
              </p>
              <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "var(--usapt-neutral-400)", letterSpacing: "0.08em" }}>
                RECRUITING POWERED BY USA PT
              </div>
            </div>
          )}
        </div>
      </div>
    </BrandThemeProvider>
  );
}
