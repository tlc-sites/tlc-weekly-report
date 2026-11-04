"use client";

export const MAX_MENTIONS = 5;
export type NotifyTarget = "clergy" | "leadership";
export const NOTIFY_LABEL: Record<NotifyTarget, string> = { clergy: "교역자에게 알리기", leadership: "리더십 전체에 공유 (담임목사님·사모님·교역자)" };

// 다른 부서·교역자·리더십에 함께 봐 달라고 요청한다. 제출하면 고른 사람들이 알림을 받는다.
export function MentionPicker({groups,value,onChange,notify,onNotify}:{groups:{id:string;label:string}[];value:string[];onChange:(v:string[])=>void;notify?:NotifyTarget;onNotify?:(v:NotifyTarget|undefined)=>void}){
 if(!groups.length&&!onNotify)return null;
 const chosen=new Set(value);
 const toggle=(id:string)=>onChange(chosen.has(id)?value.filter(v=>v!==id):value.length>=MAX_MENTIONS?value:[...value,id]);
 const count=value.length+(notify?1:0);
 const chip=(on:boolean)=>`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${on?"border-accent bg-accent/10 font-semibold text-accent":"border-border"}`;
 return <details className="mt-3 rounded-xl border border-border p-3" open={count>0}>
  <summary className="cursor-pointer font-medium">다른 팀에 알리기 (선택){count?` · ${count}곳`:""}</summary>
  {onNotify?<>
   <p className="mt-2 text-xs text-muted">교역자나 리더십 전체에 알리면, 제출할 때 해당하는 분들께 알림이 갑니다.</p>
   {/* 리더십 전체는 교역자를 포함하므로 둘 중 하나만 고른다. */}
   <div className="mt-3 flex flex-wrap gap-2">{(Object.keys(NOTIFY_LABEL) as NotifyTarget[]).map(k=><label key={k} className={chip(notify===k)}><input type="checkbox" className="sr-only" checked={notify===k} onChange={()=>onNotify(notify===k?undefined:k)}/>{notify===k?"✓ ":""}{NOTIFY_LABEL[k]}</label>)}</div>
  </>:null}
  {groups.length?<>
   <p className="mt-3 text-xs text-muted">함께 봐야 할 부서를 고르면, 제출할 때 그 부서 팀원에게 알림이 가고 이 보고를 읽을 수 있습니다. 최대 {MAX_MENTIONS}곳까지 고를 수 있습니다.</p>
   <div className="mt-3 flex flex-wrap gap-2">{groups.map(g=><label key={g.id} className={chip(chosen.has(g.id))}><input type="checkbox" className="sr-only" checked={chosen.has(g.id)} disabled={!chosen.has(g.id)&&value.length>=MAX_MENTIONS} onChange={()=>toggle(g.id)}/>{chosen.has(g.id)?"✓ ":""}{g.label}</label>)}</div>
  </>:null}
 </details>;
}
