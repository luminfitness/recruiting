import type { CreatedMeeting, MeetingInput, MeetingProvider, ParticipantEvent } from "./meeting";

/**
 * Real Zoom meeting provider. createMeeting is a genuine upgrade over Mock only
 * in that it provisions a real Zoom join URL; attendance is STILL sourced from
 * the token-redirect page (FRD Section 7). The real value-add is
 * handleParticipantWebhook: Zoom's meeting.participant_joined events let us
 * auto-confirm scenario-2 direct joins (candidates who joined without clicking
 * their token link) instead of requiring the host to confirm them by hand.
 *
 * Credentials: { accountId, clientId, clientSecret } (server-to-server OAuth).
 */
export class ZoomMeetingProvider implements MeetingProvider {
  constructor(
    private readonly accountId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private async token(): Promise<string> {
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(this.accountId)}`,
      { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}` } },
    );
    if (!res.ok) throw new Error(`Zoom auth failed: ${res.status}`);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async createMeeting(input: MeetingInput): Promise<CreatedMeeting> {
    const accessToken = await this.token();
    const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: `${input.roleType === "manager" ? "Manager" : "Trainer"} group interview`,
        type: 2, // scheduled
        start_time: input.scheduledAt.toISOString(),
        settings: { join_before_host: true, waiting_room: false },
      }),
    });
    if (!res.ok) throw new Error(`Zoom createMeeting failed: ${res.status}`);
    const json = (await res.json()) as { id: number; join_url: string };
    return { meetingUrl: json.join_url, externalMeetingId: String(json.id) };
  }

  /**
   * Parses a Zoom webhook. On meeting.participant_joined we surface the
   * participant's display name + join time so the caller can try to match them
   * to an expected-roster candidate and, if matched, record a webhook_confirm
   * attendance (see the /api/webhooks/zoom route).
   */
  async handleParticipantWebhook(payload: unknown): Promise<ParticipantEvent[]> {
    const p = payload as { event?: string; payload?: { object?: { participant?: { user_name?: string; join_time?: string } } } };
    if (p.event !== "meeting.participant_joined") return [];
    const participant = p.payload?.object?.participant;
    if (!participant?.user_name) return [];
    return [{ externalParticipantLabel: participant.user_name, joinedAt: participant.join_time ? new Date(participant.join_time) : new Date() }];
  }
}
