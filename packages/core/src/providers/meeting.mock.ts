import { randomUUID } from "node:crypto";
import type { CreatedMeeting, MeetingInput, MeetingProvider } from "./meeting";

/**
 * Points at a placeholder waiting-room page rather than a real meeting —
 * this is fine because the token-redirect page is what marks attendance,
 * not the meeting platform. Mock is a genuinely complete Phase 1 experience.
 */
export class MockMeetingProvider implements MeetingProvider {
  constructor(private readonly appBaseUrl: string) {}

  async createMeeting(_input: MeetingInput): Promise<CreatedMeeting> {
    const externalMeetingId = randomUUID();
    return {
      meetingUrl: `${this.appBaseUrl}/mock-meeting/${externalMeetingId}`,
      externalMeetingId,
    };
  }
}
