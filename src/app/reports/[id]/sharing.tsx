import { requireActive } from "@/lib/auth";
import { Card, smallButtonClass } from "@/components/ui";
import { changePrivateShare } from "./sharing-actions";

const KINDS={prayer:"기도제목",pastor:"담임 목사님께 드리는 글",pastor_wife:"담임 사모님께 드리는 글"};
export async function PrivateSharing({reportId}:{reportId:string}) {
  const {supabase}=await requireActive();
  const {data:canShare}=await supabase.rpc("can_share_report",{rid:reportId});
  if(!canShare) return null;
  const [people,shares]=await Promise.all([
    supabase.from("profiles").select("id,real_name").eq("status","active").eq("is_minister",true).order("real_name"),
    supabase.from("private_shares").select("minister_id,content_kind").eq("report_id",reportId),
  ]);
  if(people.error || shares.error) throw new Error("공개 설정을 불러오지 못했습니다.");
  return <details className="mb-4"><summary className="cursor-pointer text-sm font-semibold text-accent">기도제목·비공개 글 공개 설정</summary><Card className="mt-3">
    <p className="mb-3 text-xs text-muted">제출된 일반 보고는 모든 교역자에게 기본 공개됩니다. 기도제목·비공개 글은 기존 열람 제한이 유지되며, 담당 교역자와 담임 목사님·담임 사모님이 선택한 교역자에게 별도로 공개할 수 있습니다. 공개 취소 후에도 원래 담당 파트 권한은 유지됩니다.</p>
    <form action={changePrivateShare} className="flex flex-col gap-2"><input type="hidden" name="reportId" value={reportId}/>
      <label className="text-sm">공개할 교역자<select name="ministerId" required className="mt-1 w-full rounded-xl border border-border bg-surface p-2"><option value="">선택해 주세요</option>{(people.data??[]).map(p=><option key={p.id} value={p.id}>{p.real_name}</option>)}</select></label>
      <label className="text-sm">공개할 항목<select name="kind" className="mt-1 w-full rounded-xl border border-border bg-surface p-2">{Object.entries(KINDS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <button name="operation" value="grant" className={smallButtonClass}>선택한 항목 공개</button>
    </form>
    {(shares.data??[]).filter(s=>s.content_kind!=="report").map(s=><form action={changePrivateShare} key={`${s.minister_id}:${s.content_kind}`} className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs"><input type="hidden" name="reportId" value={reportId}/><input type="hidden" name="ministerId" value={s.minister_id}/><input type="hidden" name="kind" value={s.content_kind}/><span>{people.data?.find(p=>p.id===s.minister_id)?.real_name ?? "비활성 교역자"} · {KINDS[s.content_kind as keyof typeof KINDS]}</span><button name="operation" value="revoke" className="underline">공개 취소</button></form>)}
  </Card></details>;
}
