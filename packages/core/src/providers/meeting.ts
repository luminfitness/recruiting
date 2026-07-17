export interface MeetingInput {
  roleType: "manager" | "trainer";
  scheduledAt: Date;
  hostUserId: string;
}

export interface CreatedMeeting {
  meetingUrl: string;
  externalMeetingId?: string;
}

export type ParticipantEvent = {
  externalParticipantLabel: string;
  joinedAt: Date;
};

/**
 * The token-redirect page (see apps/web's join/[token] route), not this
 * interface, is the actual attendance source of truth per FRD Section 7 —
 * MeetingProvider only decides where the redirect lands and, for Real
 * implementations, offers an upgrade path for scenario 2 (direct joins)
 * via the optional webhook handler.
 */
export interface MeetingProvider {
  createMeeting(input: MeetingInput): Promise<CreatedMeeting>;
  /** Only Real implementations (Zoom) implement this — Mock has no webhook to receive. */
  handleParticipantWebhook?(payload: unknown): Promise<ParticipantEvent[]>;
}
