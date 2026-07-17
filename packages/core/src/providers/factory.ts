import { eq, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { integrationConfigs } from "@usapt/db/schema";
import type { JobBoardProvider } from "./job-board";
import { MockJobBoardProvider } from "./job-board.mock";
import type { MessagingProvider } from "./messaging";
import { MockMessagingProvider } from "./messaging.mock";
import type { MeetingProvider } from "./meeting";
import { MockMeetingProvider } from "./meeting.mock";

export type IntegrationCategory =
  | "job_board_indeed"
  | "job_board_linkedin"
  | "messaging_email"
  | "messaging_sms"
  | "meeting";

/**
 * Reads integration_configs for {org, category} and returns the matching
 * provider instance. Application code depends only on the JobBoardProvider /
 * MessagingProvider / MeetingProvider interfaces — never on a concrete
 * class — so a Real implementation (Phase 11) plugs in here with zero
 * call-site changes anywhere else in the app.
 */
export async function getProvider(
  tx: NodePgDatabase<typeof dbSchema>,
  orgId: string,
  category: "job_board_indeed" | "job_board_linkedin",
  appBaseUrl?: string,
): Promise<JobBoardProvider>;
export async function getProvider(
  tx: NodePgDatabase<typeof dbSchema>,
  orgId: string,
  category: "messaging_email" | "messaging_sms",
  appBaseUrl?: string,
): Promise<MessagingProvider>;
export async function getProvider(
  tx: NodePgDatabase<typeof dbSchema>,
  orgId: string,
  category: "meeting",
  appBaseUrl?: string,
): Promise<MeetingProvider>;
export async function getProvider(
  tx: NodePgDatabase<typeof dbSchema>,
  orgId: string,
  category: IntegrationCategory,
  appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000",
): Promise<JobBoardProvider | MessagingProvider | MeetingProvider> {
  const [config] = await tx
    .select()
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.orgId, orgId), eq(integrationConfigs.category, category)));

  const providerKey = config?.providerKey ?? "mock";
  if (providerKey !== "mock") {
    // Real Indeed/LinkedIn/Twilio/SendGrid/Zoom adapters land in Phase 11 — until
    // then, a configured-but-unimplemented provider still falls back to Mock
    // rather than throwing, so an org can pre-configure real credentials early.
    console.warn(`Real provider "${providerKey}" for ${category} is not implemented yet — falling back to Mock`);
  }

  switch (category) {
    case "job_board_indeed":
    case "job_board_linkedin":
      return new MockJobBoardProvider();
    case "messaging_email":
    case "messaging_sms":
      return new MockMessagingProvider(tx, orgId);
    case "meeting":
      return new MockMeetingProvider(appBaseUrl);
    default: {
      const _exhaustive: never = category;
      throw new Error(`Unknown integration category: ${_exhaustive}`);
    }
  }
}
