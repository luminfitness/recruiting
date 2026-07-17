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
import { SendGridMessagingProvider, TwilioMessagingProvider } from "./messaging.real";
import { ZoomMeetingProvider } from "./meeting.real";
import { decryptCredentials, type EncryptedPayload } from "../crypto";

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
  const creds = (): Record<string, unknown> => {
    if (!config?.credentialsEncrypted) throw new Error(`No credentials configured for ${category}`);
    return decryptCredentials(config.credentialsEncrypted as EncryptedPayload);
  };

  switch (category) {
    case "job_board_indeed":
    case "job_board_linkedin":
      // Indeed/LinkedIn job-posting APIs are partner-gated (OQ-3). Until an org
      // has partner access, the semi-auto Mock IS the intended path — it returns
      // requires_manual_action, which the posting flow already handles. When a
      // real adapter is added it slots in here behind the same interface.
      return new MockJobBoardProvider();
    case "messaging_email": {
      if (providerKey === "sendgrid") {
        const c = creds();
        return new SendGridMessagingProvider(String(c.apiKey));
      }
      return new MockMessagingProvider(tx, orgId);
    }
    case "messaging_sms": {
      if (providerKey === "twilio") {
        const c = creds();
        return new TwilioMessagingProvider(String(c.accountSid), String(c.authToken), c.fromNumber ? String(c.fromNumber) : undefined);
      }
      return new MockMessagingProvider(tx, orgId);
    }
    case "meeting": {
      if (providerKey === "zoom") {
        const c = creds();
        return new ZoomMeetingProvider(String(c.accountId), String(c.clientId), String(c.clientSecret));
      }
      return new MockMeetingProvider(appBaseUrl);
    }
    default: {
      const _exhaustive: never = category;
      throw new Error(`Unknown integration category: ${_exhaustive}`);
    }
  }
}
