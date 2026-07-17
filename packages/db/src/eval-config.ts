/**
 * Default v1 scorecard criteria and quiz/intake definitions, seeded per org
 * per role_type. These are the initial versioned content — admins can publish
 * new versions later (FR-1.5/1.6), and every evaluation renders against the
 * version it was actually scored on (evaluations.criteria_version_id /
 * quiz_definition_version_id), never re-graded retroactively.
 *
 * Replicating the actual USAPT Google Form scale/questions is FRD OQ-7 — these
 * are reasonable stand-ins the schema supports swapping wholesale.
 */

export interface ScorecardCriterion {
  key: string;
  label: string;
  hint?: string;
}
export interface ScorecardSchema {
  scale: { min: number; max: number };
  criteria: ScorecardCriterion[];
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  correct: string;
}
export interface QuizSchema {
  questions: QuizQuestion[];
  /** Intake fields collected alongside the quiz (written response + availability + disclosure are always present). */
  writtenPrompt: string;
}

export const SCORECARD_V1: Record<"manager" | "trainer", ScorecardSchema> = {
  trainer: {
    scale: { min: 1, max: 5 },
    criteria: [
      { key: "communication", label: "Communication & presence", hint: "Clarity, energy, listening" },
      { key: "sales", label: "Sales aptitude", hint: "Comfort asking for the close" },
      { key: "coachability", label: "Coachability", hint: "Takes feedback, self-aware" },
      { key: "professionalism", label: "Professionalism", hint: "Punctual, prepared, presentable" },
    ],
  },
  manager: {
    scale: { min: 1, max: 5 },
    criteria: [
      { key: "leadership", label: "Leadership", hint: "Owns outcomes, sets direction" },
      { key: "sales", label: "Sales & revenue instinct", hint: "Understands the growth engine" },
      { key: "communication", label: "Communication", hint: "Clear, motivating" },
      { key: "operations", label: "Operational judgment", hint: "Prioritization, follow-through" },
    ],
  },
};

export const QUIZ_V1: Record<"manager" | "trainer", QuizSchema> = {
  trainer: {
    writtenPrompt: "Tell us about a time you helped a client push through a plateau. What did you change?",
    questions: [
      {
        id: "q1",
        prompt: "A client with knee pain wants to squat. Your first move?",
        options: [
          { id: "a", label: "Load the bar and coach through it" },
          { id: "b", label: "Assess range of motion and modify the movement" },
          { id: "c", label: "Refuse to train them at all" },
        ],
        correct: "b",
      },
      {
        id: "q2",
        prompt: "A new client's top priority should usually be…",
        options: [
          { id: "a", label: "Maximal weight on day one" },
          { id: "b", label: "Consistency and safe technique" },
          { id: "c", label: "A strict crash diet" },
        ],
        correct: "b",
      },
      {
        id: "q3",
        prompt: "Best way to keep a client accountable between sessions?",
        options: [
          { id: "a", label: "Set clear, small goals and check in" },
          { id: "b", label: "Never contact them until next session" },
          { id: "c", label: "Only reach out if they miss a payment" },
        ],
        correct: "a",
      },
    ],
  },
  manager: {
    writtenPrompt: "Describe how you'd turn around an underperforming location in its first 30 days.",
    questions: [
      {
        id: "q1",
        prompt: "A trainer keeps missing revenue targets. First step?",
        options: [
          { id: "a", label: "Terminate immediately" },
          { id: "b", label: "Review their pipeline and coach on gaps" },
          { id: "c", label: "Ignore it until quarter-end" },
        ],
        correct: "b",
      },
      {
        id: "q2",
        prompt: "The most important input to a location's revenue is…",
        options: [
          { id: "a", label: "Trainer headcount and productivity" },
          { id: "b", label: "The color of the walls" },
          { id: "c", label: "How many mirrors there are" },
        ],
        correct: "a",
      },
      {
        id: "q3",
        prompt: "A great first interaction with a prospective member is…",
        options: [
          { id: "a", label: "Understand their goals, then recommend a fit" },
          { id: "b", label: "Immediately push the most expensive package" },
          { id: "c", label: "Let them wander the floor alone" },
        ],
        correct: "a",
      },
    ],
  },
};
