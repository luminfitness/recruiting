import { NextRequest, NextResponse } from "next/server";
import { ingestInboundEmail, type InboundPayload } from "@/lib/ingestion";

/**
 * Inbound-email webhook (SendGrid Inbound Parse / Postmark / Mailgun target).
 * Indeed's applicant-notification emails are routed to a system inbox whose
 * provider POSTs the parsed message here. Secured by a shared secret so only
 * the configured mail provider can post. This is FR-1.2's Phase-1 baseline
 * ingestion path (chosen over IMAP polling — push, lower latency).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = (await request.json()) as InboundPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!payload?.to || typeof payload.text !== "string") {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await ingestInboundEmail(payload);
  return NextResponse.json({ ok: true, ...result });
}
