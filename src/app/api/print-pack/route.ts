import { type NextRequest } from "next/server";
import { requireActive, isClergy } from "@/lib/auth";
import { isIsoDate, todayKST } from "@/lib/week";
import { loadPrintPack, printRange } from "@/lib/print-pack";
import { printFileName, renderPrintPdf } from "@/lib/print-pdf";
import { printStamp } from "@/lib/print-run";

// 교역자가 화요일 회의 인쇄본(금~월 보고)을 바로 받는다. 조회는 로그인한 사람의 권한(RLS) 안에서만 된다.
// ?date=YYYY-MM-DD 를 주면 그날 기준 가장 최근 화요일의 인쇄본을 만든다.
export async function GET(request: NextRequest) {
  const { supabase, profile } = await requireActive();
  if (!isClergy(profile)) return new Response("forbidden", { status: 403 });
  const date = request.nextUrl.searchParams.get("date");
  const { from, to } = printRange(isIsoDate(date) && date <= todayKST() ? date : todayKST());
  const pack = await loadPrintPack(supabase, from, to);
  const pdf = await renderPrintPdf(pack, printStamp());
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="print.pdf"; filename*=UTF-8''${encodeURIComponent(printFileName(pack))}`,
      "Cache-Control": "private, no-store",
    },
  });
}
