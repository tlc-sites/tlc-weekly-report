import {canManage,isClergy,type Profile} from "./auth";
import type {ReportClient} from "./groups";

// PD 체크리스트는 교역자·관리자와 'PD 체크리스트 작성'으로 지정된 분(DB48)만 본다(사용자 결정 2026-11-07).
// 메뉴·화면만 가린다. 큐시트는 모두가 보고, 큐시트와 같이 쓰는 담당자 칸은 큐시트에서 보인다.
export async function canSeePdChecklist(supabase: ReportClient, profile: Profile) {
  if (isClergy(profile) || canManage(profile)) return true;
  const {data} = await supabase.from("worship_doc_roles").select("role").eq("user_id", profile.id).eq("role", "pd").limit(1);
  return Boolean(data?.length);
}
