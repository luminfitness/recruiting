import type { EmailInput, MessageResult, MessagingProvider, SmsInput } from "./messaging";

/**
 * Real email via SendGrid. Plugs into the SAME MessagingProvider interface as
 * MockMessagingProvider, so no call site changes when an org switches from
 * mock to sendgrid — only the getProvider factory decides which to hand back.
 * Credentials ({ apiKey }) come from the org's encrypted integration_configs.
 * SMS is not SendGrid's job; a Real email provider throws on sendSms so an org
 * must configure an SMS provider (Twilio) separately (categories are independent).
 */
export class SendGridMessagingProvider implements MessagingProvider {
  constructor(private readonly apiKey: string) {}

  async sendEmail(input: EmailInput): Promise<MessageResult> {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: input.fromEmail, name: input.fromName },
        subject: input.subject,
        content: [{ type: "text/plain", value: input.body }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid send failed: ${res.status} ${await res.text().catch(() => "")}`);
    // SendGrid returns the message id in the X-Message-Id header.
    return { externalMessageId: res.headers.get("x-message-id") ?? "sendgrid-accepted", sentAt: new Date() };
  }

  async sendSms(): Promise<MessageResult> {
    throw new Error("SendGrid does not send SMS — configure Twilio for the messaging_sms category");
  }
}

/**
 * Real SMS (and optionally email, though we route email via SendGrid) through
 * Twilio's Messages API. Credentials: { accountSid, authToken, fromNumber }.
 */
export class TwilioMessagingProvider implements MessagingProvider {
  constructor(private readonly accountSid: string, private readonly authToken: string, private readonly defaultFrom?: string) {}

  async sendSms(input: SmsInput): Promise<MessageResult> {
    const body = new URLSearchParams({ To: input.to, From: input.fromNumber || this.defaultFrom || "", Body: input.body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) throw new Error(`Twilio send failed: ${res.status} ${await res.text().catch(() => "")}`);
    const json = (await res.json()) as { sid?: string };
    return { externalMessageId: json.sid ?? "twilio-accepted", sentAt: new Date() };
  }

  async sendEmail(): Promise<MessageResult> {
    throw new Error("Twilio is configured for SMS — configure SendGrid for the messaging_email category");
  }
}
