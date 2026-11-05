"use client";

export const MAX_MENTIONS = 5;
export type NotifyTarget = "clergy" | "leadership";
export type NotifyPatch = { notify?: NotifyTarget; notify_ministers?: string[] };
type Option = { id: string; label: string };

// 다른 부서·교역자·리더십에 함께 봐 달라고 요청한다. 제출하면 고른 사람들이 알림을 받는다.
export function MentionPicker({groups,value,onChange,ministers=[],notify,ministerIds=[],onNotify}:{groups:Option[];value:string[];onChange:(v:string[])=>void;ministers?:Option[];notify?:NotifyTarget;ministerIds?:string[];onNotify?:(patch:NotifyPatch)=>void}){
 if(!groups.length&&!onNotify)return null;
 const chosen=new Set(value);
 const picked=new Set(ministerIds);
 const leadership=notify==="leadership";
 const toggle=(id:string)=>onChange(chosen.has(id)?value.filter(v=>v!==id):value.length>=MAX_MENTIONS?value:[...value,id]);
 const pick=(id:string)=>onNotify?.({notify_ministers:picked.has(id)?ministerIds.filter(v=>v!==id):[...ministerIds,id]});
 const allPicked=ministers.length>0&&ministers.every(m=>picked.has(m.id));
 const count=value.length+(leadership?1:ministerIds.length);
 const chip=(on:boolean)=>`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${on?"border-accent bg-accent/10 font-semibold text-accent":"border-border"}`;
 return <details className="mt-3 rounded-xl border border-border p-3" open={count>0}>
  <summary className="cursor-pointer font-medium">다른 팀에 알리기 (선택){count?` · ${count}곳`:""}</summary>
  {onNotify?<>
   <p className="mt-2 text-xs text-muted">제출할 때 고른 분들께 알림이 갑니다.</p>
   <div className="mt-3 flex flex-wrap gap-2"><label className={chip(leadership)}><input type="checkbox" className="sr-only" checked={leadership} onChange={()=>onNotify({notify:leadership?undefined:"leadership"})}/>{leadership?"✓ ":""}리더십 전체에 공유 (담임목사님·사모님·교역자)</label></div>
   {/* 리더십 전체에 교역자가 모두 들어 있으므로, 고르면 개별 선택은 감춘다. */}
   {leadership?null:ministers.length?<>
    <div className="mt-3 flex items-center justify-between gap-2"><p className="text-sm font-medium">교역자에게 알리기</p><button type="button" className="min-h-9 rounded-lg px-2 text-xs font-semibold text-accent" onClick={()=>onNotify({notify_ministers:allPicked?[]:ministers.map(m=>m.id)})}>{allPicked?"모두 해제":"모두 선택"}</button></div>
    <div className="mt-2 flex flex-wrap gap-2">{ministers.map(m=><label key={m.id} className={chip(picked.has(m.id))}><input type="checkbox" className="sr-only" checked={picked.has(m.id)} onChange={()=>pick(m.id)}/>{picked.has(m.id)?"✓ ":""}{m.label}</label>)}</div>
   </>:null}
  </>:null}
  {groups.length?<>
   <p className="mt-3 text-xs text-muted">함께 봐야 할 부서를 고르면, 제출할 때 그 부서 팀원에게 알림이 가고 이 보고를 읽을 수 있습니다. 최대 {MAX_MENTIONS}곳까지 고를 수 있습니다.</p>
   <div className="mt-3 flex flex-wrap gap-2">{groups.map(g=><label key={g.id} className={chip(chosen.has(g.id))}><input type="checkbox" className="sr-only" checked={chosen.has(g.id)} disabled={!chosen.has(g.id)&&value.length>=MAX_MENTIONS} onChange={()=>toggle(g.id)}/>{chosen.has(g.id)?"✓ ":""}{g.label}</label>)}</div>
  </>:null}
 </details>;
}
