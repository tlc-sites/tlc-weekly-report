import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 공개 정적 글꼴·이미지, 서비스 워커, 매니페스트, 크론, 사용 안내(guide.html·guide.css·guide.js)는 세션 갱신에서 제외
    "/((?!_next/static|_next/image|fonts/|favicon.ico|sw.js|manifest.webmanifest|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|html|css|js)$).*)",
  ],
};
