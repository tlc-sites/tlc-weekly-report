import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { REMINDER_SLOTS, runReminders, type ReminderSlot } from "@/lib/reminders";

// 정해진 시각에 크론이 호출한다. Vercel Cron은 CRON_SECRET을 Authorization 헤더로 보낸다.
// ?dryRun=1 이면 보내지 않고 대상만 돌려준다 (점검용).
export async function GET(request: NextRequest, { params }: RouteContext<"/api/cron/[slot]">) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { slot } = await params;
  if (!REMINDER_SLOTS.includes(slot as ReminderSlot)) {
    return NextResponse.json({ error: "unknown slot" }, { status: 404 });
  }

  try {
    const result = await runReminders(slot as ReminderSlot, { dryRun: request.nextUrl.searchParams.get("dryRun") === "1" });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron] 실패", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
