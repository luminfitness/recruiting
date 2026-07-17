import { notFound } from "next/navigation";
import { BrandThemeProvider } from "@usapt/design-tokens";
import { resolveCandidateToken } from "@/lib/candidate-token";

export default async function CandidateLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const candidate = await resolveCandidateToken(token);
  if (!candidate) notFound();

  const roleLabel = candidate.roleType === "manager" ? "Manager" : "Personal Trainer";

  return (
    <BrandThemeProvider theme={candidate.theme}>
      <div style={{ minHeight: "100vh", background: "#1a1a1a", padding: "28px 20px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: 390, maxWidth: "100%", background: "#fff", boxShadow: "var(--usapt-shadow-lg)" }}>
          <div style={{ background: "var(--brand-primary)", padding: "20px 22px 22px" }}>
            <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "#fff", opacity: 0.9 }}>
              {candidate.brandName}
            </div>
            <div style={{ fontFamily: "var(--font-archivo-black)", fontSize: 27, lineHeight: 1.02, color: "#fff", marginTop: 12 }}>
              YOU&apos;RE INVITED
            </div>
          </div>
          <div style={{ padding: "22px" }}>
            <p style={{ fontSize: 15, margin: "0 0 4px" }}>Hi {candidate.firstName} —</p>
            <p style={{ fontSize: 13.5, color: "var(--usapt-neutral-800)", lineHeight: 1.55, margin: "0 0 18px" }}>
              You applied to be a <strong>{roleLabel}</strong> at {candidate.brandName}
              {candidate.marketName ? `, ${candidate.marketName}` : ""}. Your virtual group interview booking will open
              here.
            </p>
            <div style={{ padding: "14px", border: "2px solid var(--brand-primary)", background: "var(--brand-tint)", fontSize: 13, color: "var(--usapt-neutral-900)" }}>
              Booking (choose a session, one tap, no account) arrives in Phase 2. This page already proves the identity
              token resolves and the brand theme applies.
            </div>
            <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "var(--usapt-neutral-400)", letterSpacing: "0.08em" }}>
              RECRUITING POWERED BY USA PT
            </div>
          </div>
        </div>
      </div>
    </BrandThemeProvider>
  );
}
