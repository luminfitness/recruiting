import { NextRequest, NextResponse } from "next/server";
import { runCronTick } from "@/lib/jobs/run";

/**
 * External-scheduler cron endpoint. The GitHub Actions scheduled workflow POSTs
 * here every ~5 min with `Authorization: Bearer $CRON_SECRET`. We chose an
 * external scheduler over Vercel Cron so the free Vercel tier suffices (Hobby
 * cron is daily-only, too coarse for reminder/cadence timing).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runCronTick();
  return NextResponse.json({ ok: true, ...result });
}
