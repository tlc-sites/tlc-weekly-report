"use client";

export const MAX_MENTIONS = 5;

// 다른 부서에 함께 봐 달라고 요청한다. 제출하면 고른 부서 팀원이 보고를 읽고 알림을 받는다.
export function MentionPicker({groups,value,onChange}:{groups:{id:string;label:string}[];value:string[];onChange:(v:string[])=>void}){
 if(!groups.length)return null;
 const chosen=new Set(value);
 const toggle=(id:string)=>onChange(chosen.has(id)?value.filter(v=>v!==id):value.length>=MAX_MENTIONS?value:[...value,id]);
 return <details className="mt-3 rounded-xl border border-border p-3" open={value.length>0}>
  <summary className="cursor-pointer font-medium">다른 부서에 알리기 (선택){value.length?` · ${value.length}곳`:""}</summary>
  <p className="mt-2 text-xs text-muted">함께 봐야 할 부서를 고르면, 제출할 때 그 부서 팀원에게 알림이 가고 이 보고를 읽을 수 있습니다. 최대 {MAX_MENTIONS}곳까지 고를 수 있습니다.</p>
  <div className="mt-3 flex flex-wrap gap-2">{groups.map(g=><label key={g.id} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${chosen.has(g.id)?"border-accent bg-accent/10 font-semibold text-accent":"border-border"}`}><input type="checkbox" className="sr-only" checked={chosen.has(g.id)} disabled={!chosen.has(g.id)&&value.length>=MAX_MENTIONS} onChange={()=>toggle(g.id)}/>{chosen.has(g.id)?"✓ ":""}{g.label}</label>)}</div>
 </details>;
}
