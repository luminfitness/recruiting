import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { BrandThemeProvider } from "@usapt/design-tokens";
import { getServiceDb } from "@usapt/db";
import { candidates, evaluations } from "@usapt/db/schema";
import { resolveCandidateToken } from "@/lib/candidate-token";
import { getActiveQuiz } from "@/lib/evaluation";
import { QuizForm } from "./QuizForm";

export default async function QuizPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const candidate = await resolveCandidateToken(token);
  if (!candidate) notFound();

  const db = getServiceDb();
  const quiz = await getActiveQuiz(db, candidate.orgId, candidate.roleType);
  const [candRow] = await db.select().from(candidates).where(eq(candidates.id, candidate.id));
  const [ev] = await db.select().from(evaluations).where(eq(evaluations.candidateId, candidate.id));

  const submitted = Boolean(ev?.quizSubmittedAt);

  const shell = (children: React.ReactNode) => (
    <BrandThemeProvider theme={candidate.theme}>
      <div style={{ minHeight: "100vh", background: "#1a1a1a", padding: "28px 20px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: 390, maxWidth: "100%", background: "var(--usapt-surface-raised)", boxShadow: "var(--usapt-shadow-lg)" }}>{children}</div>
      </div>
    </BrandThemeProvider>
  );

  if (!quiz) {
    return shell(<div style={{ padding: 24, fontSize: 14 }}>No quiz is configured for this role yet.</div>);
  }

  if (submitted) {
    return shell(
      <>
        <div style={{ background: "var(--brand-primary)", padding: "20px 22px" }}>
          <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "#fff", opacity: 0.9 }}>
            {candidate.brandName}
          </div>
          <div style={{ fontFamily: "var(--font-archivo-black)", fontSize: 24, color: "#fff", marginTop: 10 }}>ALL DONE!</div>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 14, lineHeight: 1.55 }}>
            Thanks {candidate.firstName} — your quiz and intake are in. Our recruiting team reviews your complete profile
            next; we&apos;ll be in touch about the next step.
          </p>
        </div>
      </>,
    );
  }

  return shell(
    <QuizForm
      token={token}
      quiz={quiz.schema}
      initialAnswers={(ev?.quizAnswers as Record<string, string> | null) ?? {}}
      initialWritten={ev?.writtenResponse ?? ""}
      initialAvailability={(ev?.availability as Record<string, boolean> | null) ?? {}}
      totalSteps={4}
    />,
  );
}
