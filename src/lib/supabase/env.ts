// 보고 앱의 테이블은 tlc-cellcare 프로젝트의 report 스키마에 있다
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 환경변수가 필요합니다. .env.example을 참고하세요.",
    );
  }
  return { url, key };
}
