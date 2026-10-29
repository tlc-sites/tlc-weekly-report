import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabaseEnv } from "./env";

// 요청마다 새로 만든다 (클라이언트를 요청 간에 재사용하면 안 됨)
export async function createClient() {
  // 인증 SDK의 시간·세션 처리는 미리 생성하지 않고 실제 요청에서만 실행한다.
  await connection();
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    db: { schema: "report" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy가 담당한다.
        }
      },
    },
  });
}
