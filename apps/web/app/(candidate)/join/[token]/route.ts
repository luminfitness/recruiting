import { NextRequest, NextResponse } from "next/server";
import { withServiceTransaction } from "@usapt/db";
import { recordTokenAttendance } from "@/lib/sessions";

/**
 * The token-redirect attendance handler — FRD Section 7 scenario 1, the single
 * most important route in the system. A candidate clicks their personal join
 * link; this logs attendance by TOKEN (never by name), auto-advances the
 * status to `attended`, and 302s to the actual meeting URL. The redirect page,
 * not any meeting-platform API, is the source of truth for attendance, so this
 * works with any meeting platform. Kept lean to meet the <1s latency NFR:
 * indexed token lookup, one insert (idempotent via the attendance_events
 * partial unique index), one transition, redirect.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const result = await withServiceTransaction((tx, client) => recordTokenAttendance(tx, client, token));

  if (!result) {
    // Unknown token, or no active booking — send them to their landing page,
    // which explains next steps (or 404s on a truly bad token).
    return NextResponse.redirect(new URL(`/t/${token}`, _request.url));
  }

  return NextResponse.redirect(result.meetingUrl);
}
