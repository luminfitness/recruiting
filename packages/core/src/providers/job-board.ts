export interface PostingInput {
  roleType: "manager" | "trainer";
  channel: "indeed" | "linkedin" | "other";
  copy: string;
  schedulingLink: string;
  contactNumber: string;
}

export interface SwitchModeInput {
  /** The atomic link+phone swap — a trainer ad must never carry the manager scheduling link, and vice versa. */
  newSchedulingLink: string;
  newContactNumber: string;
  newRoleType: "manager" | "trainer";
}

export interface PostingRef {
  externalPostingId?: string;
}

export type PostingOutcome =
  | { kind: "confirmed"; externalId: string; at: Date }
  | {
      kind: "requires_manual_action";
      package: { copy: string; schedulingLink: string; contactNumber: string; timing: Date };
    };

/**
 * One implementation per {org, channel}. Real Indeed/LinkedIn implementations
 * are partner-gated (FRD OQ-3) and arrive in Phase 11 — MockJobBoardProvider
 * is the complete Phase 1 experience, not a stand-in for it: it always
 * returns requires_manual_action, exactly like a not-yet-integrated real
 * provider would, so the semi-auto "system prepares the action, human
 * clicks" flow is exercised for real from day one.
 */
export interface JobBoardProvider {
  createPosting(input: PostingInput): Promise<PostingOutcome>;
  endPosting(ref: PostingRef): Promise<PostingOutcome>;
  switchMode(ref: PostingRef, input: SwitchModeInput): Promise<PostingOutcome>;
}
