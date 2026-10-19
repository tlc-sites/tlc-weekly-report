import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

// 서버 전용 관리자 클라이언트 (RLS를 거치지 않는다). 알림 대상 계산과 발송 기록에만 쓴다.
// 브라우저 코드에서 import하면 안 된다.
export function createAdminClient() {
  const { url } = supabaseEnv();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY 환경변수가 필요합니다 (Supabase > Project Settings > API Keys의 secret key).");
  return createClient(url, key, {
    db: { schema: "report" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
