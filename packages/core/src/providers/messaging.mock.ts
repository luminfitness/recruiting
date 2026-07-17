import { randomUUID } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { messagesLog } from "@usapt/db/schema";
import type { EmailInput, MessageResult, MessagingProvider, SmsInput } from "./messaging";

/**
 * Writes every "send" to messages_log instead of dispatching anything real —
 * visible in an admin/dev view so the whole candidate-facing flow (invites,
 * reminders, offers, confirmations) is demoable with zero real credentials.
 */
export class MockMessagingProvider implements MessagingProvider {
  constructor(
    private readonly tx: NodePgDatabase<typeof dbSchema>,
    private readonly orgId: string,
  ) {}

  async sendEmail(input: EmailInput): Promise<MessageResult> {
    const externalMessageId = randomUUID();
    await this.tx.insert(messagesLog).values({
      orgId: this.orgId,
      channel: "messaging_email",
      toAddress: { to: input.to },
      subjectOrTemplate: { subject: input.subject, templateKey: input.templateKey ?? null },
      body: { body: input.body, fromName: input.fromName, fromEmail: input.fromEmail },
      providerKey: "mock",
      externalMessageId,
    });
    return { externalMessageId, sentAt: new Date() };
  }

  async sendSms(input: SmsInput): Promise<MessageResult> {
    const externalMessageId = randomUUID();
    await this.tx.insert(messagesLog).values({
      orgId: this.orgId,
      channel: "messaging_sms",
      toAddress: { to: input.to },
      subjectOrTemplate: { templateKey: input.templateKey ?? null },
      body: { body: input.body, fromNumber: input.fromNumber },
      providerKey: "mock",
      externalMessageId,
    });
    return { externalMessageId, sentAt: new Date() };
  }
}
