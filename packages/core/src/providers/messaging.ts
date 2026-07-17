export interface EmailInput {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  templateKey?: string;
}

export interface SmsInput {
  to: string;
  fromNumber: string;
  body: string;
  templateKey?: string;
}

export type MessageResult = { externalMessageId: string; sentAt: Date };

/**
 * Configured independently per category (messaging_email vs messaging_sms) —
 * an org can run email on SendGrid while SMS stays Mock, or vice versa.
 */
export interface MessagingProvider {
  sendEmail(input: EmailInput): Promise<MessageResult>;
  sendSms(input: SmsInput): Promise<MessageResult>;
}
