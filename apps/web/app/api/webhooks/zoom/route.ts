import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withServiceTransaction } from "@usapt/db";
import { processZoomWebhook } from "@/lib/zoom-webhook";

/**
 * Zoom webhook endpoint (participant events). Handles Zoom's URL-validation
 * handshake (endpoint.url_validation) and meeting.participant_joined events,
 * which upgrade scenario-2 direct joins to auto-confirmed attendance. Signature
 * verification uses ZOOM_WEBHOOK_SECRET when set (Zoom's HMAC scheme).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const evt = body as { event?: string; payload?: { plainToken?: string } };

  // Zoom endpoint URL validation handshake.
  if (evt.event === "endpoint.url_validation" && evt.payload?.plainToken) {
    const secret = process.env.ZOOM_WEBHOOK_SECRET ?? "";
    const encryptedToken = createHmac("sha256", secret).update(evt.payload.plainToken).digest("hex");
    return NextResponse.json({ plainToken: evt.payload.plainToken, encryptedToken });
  }

  const result = await withServiceTransaction((tx, client) => processZoomWebhook(tx, client, body));
  return NextResponse.json({ ok: true, ...result });
}
