import { cookies } from "next/headers";

/**
 * Guided client-demo walkthrough. Drives the REAL screens, the REAL state
 * machine and a REAL prospect — nothing here is simulated, which is the whole
 * point: the client watches one person actually move through the funnel.
 *
 * Session state lives in a cookie (no schema change). DEMO_MODE gates it, same
 * as /debug. The guide deliberately never visits Settings or admin — it walks
 * the process only.
 */
export const DEMO_COOKIE = "usapt-demo";

export interface DemoSession {
  candidateId: string;
  /** The candidate's own token — powers the two candidate-facing steps. */
  token: string;
  name: string;
  step: number;
}

export interface DemoStep {
  key: string;
  title: string;
  /** The point being made — say this out loud. */
  narration: string;
  /** The concrete thing to click on screen. */
  action: string;
  /** `:id` → candidateId, `:token` → candidate token. */
  href: string;
  /** Candidate-facing surfaces open in a new tab so the guide stays put. */
  external?: boolean;
}

export const DEMO_STEPS: DemoStep[] = [
  {
    key: "sourcing",
    title: "The week starts itself",
    narration:
      "Nobody has to remember it's Tuesday. The cadence engine already prepared this week's postings and the copy that goes with them — the recruiting lead just approves and publishes.",
    action: "Look at the prepared postings, then open the “This week” tab to see the ritual.",
    href: "/sourcing",
  },
  {
    key: "applied",
    title: "A prospect lands — and the invite is already out",
    narration:
      "They applied from Indeed and nothing waited on a human: the group-interview invitation went out automatically the moment they came in, which is why they're already at Invited. That's the difference between a tracker and a system — nobody had to remember to send it.",
    action: "Find them in the Invited column. Note the source chip on the card.",
    href: "/pipeline",
  },
  {
    key: "book",
    title: "The candidate books themselves",
    narration:
      "This is what the candidate receives — no phone tag. They pick a group-interview slot themselves, and the moment they do, they're Booked in the tracker.",
    action: "Open the candidate link and book a slot as if you were them.",
    href: "/t/:token",
    external: true,
  },
  {
    key: "attend",
    title: "Interview day",
    narration:
      "The roster is live. Check-in is one click per person, and no-shows are captured as a status rather than a note in a spreadsheet — which is what makes the no-show outreach queue possible.",
    action: "Open today's session and check the prospect in.",
    href: "/interviews",
  },
  {
    key: "score",
    title: "Score against the rubric",
    narration:
      "Interviewers score the same criteria every time, on a versioned rubric. If the rubric changes later, past candidates are never silently re-graded.",
    action: "Submit the scorecard for the prospect.",
    href: "/score/:id",
  },
  {
    key: "quiz",
    title: "The candidate's half",
    narration:
      "The other half of the bundle comes from the candidate — a knowledge quiz and intake, auto-scored. The decision only unlocks when both halves are in.",
    action: "Open the candidate quiz link and submit it as the candidate.",
    href: "/q/:token",
    external: true,
  },
  {
    key: "decide",
    title: "Decide, with a recommendation",
    narration:
      "Both halves are in, so they surface for a decision — with a suggested disposition from your own grading policy, and the reasoning behind it. It's a recommendation, never an automatic action: a person always decides.",
    action: "Open the bundle, review grade + quiz side by side, and choose Offer.",
    href: "/decisions",
  },
  {
    key: "offer",
    title: "Offer out, answer in",
    narration:
      "The offer goes out and the clock starts. If they don't reply, they age into the follow-up queue automatically rather than falling through the cracks.",
    action: "Record the candidate's acceptance on their record.",
    href: "/candidates/:id",
  },
  {
    key: "class",
    title: "Into a class",
    narration:
      "Hiring isn't the finish line. They're grouped into an orientation class, started, and tracked to graduation — so you can compare one class against another.",
    action: "Add them to a cohort, start the class, then graduate them.",
    href: "/classes",
  },
  {
    key: "measure",
    title: "What it actually cost",
    narration:
      "And this is the payoff: the funnel and the unit economics just moved because of what we did. Cost per applicant, per start, per graduate — tied to real ad spend, not a guess.",
    action: "Look at the funnel, the weekly trend, and the cost-per-outcome tiles.",
    href: "/analytics",
  },
];

export function stepHref(step: DemoStep, session: DemoSession): string {
  return step.href.replace(":id", session.candidateId).replace(":token", session.token);
}

export async function getDemoSession(): Promise<DemoSession | null> {
  const raw = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    if (typeof parsed.candidateId !== "string" || typeof parsed.token !== "string") return null;
    const step = Math.min(Math.max(Number(parsed.step) || 0, 0), DEMO_STEPS.length - 1);
    return { candidateId: parsed.candidateId, token: parsed.token, name: parsed.name ?? "the prospect", step };
  } catch {
    return null;
  }
}
