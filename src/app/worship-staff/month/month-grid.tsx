"use client";
import {useEffect,useState,useTransition} from "react";
import {applyPaste,composeStaff,parseStaff,pasteBlock,STAFF_COLUMNS,type Occurrence,type StaffCells} from "@/lib/worship-staff-month";
import {buttonClass,smallButtonClass,textareaClass} from "@/components/ui";
import {saveMonthStaff} from "./actions";

type Row = Occurrence & { staff: string; updatedAt: string | null };
const WEEKDAY = ["일","월","화","수","목","금","토"];
const label = (iso: string) => `${Number(iso.slice(5,7))}/${Number(iso.slice(8,10))} (${WEEKDAY[new Date(iso+"T00:00:00Z").getUTCDay()]})`;

export function MonthStaffGrid({month,rows,editable}:{month:string;rows:Row[];editable:boolean}){
 const [baseline,setBaseline]=useState(()=>rows.map(r=>parseStaff(r.staff)));
 const [values,setValues]=useState(baseline);
 const [versions,setVersions]=useState(()=>rows.map(r=>r.updatedAt));
 const [paste,setPaste]=useState("");
 const [focusRow,setFocusRow]=useState(0);
 const [note,setNote]=useState<{text:string;list?:string[];tone:"ok"|"warn"}|null>(null);
 const [conflicts,setConflicts]=useState<Set<number>>(new Set());
 const [saving,startSaving]=useTransition();
 const changed=values.map((v,i)=>composeStaff(v)!==composeStaff(baseline[i]));
 const dirty=changed.filter(Boolean).length;
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener("beforeunload",warn);return ()=>window.removeEventListener("beforeunload",warn);},[dirty]);

 const merge=(updates:{index:number;cells:Partial<StaffCells>}[])=>setValues(prev=>{const next=[...prev];for(const u of updates)next[u.index]={...next[u.index],...u.cells};return next;});
 const fillFromPaste=()=>{
  const {updates,unmatched}=applyPaste(paste,month,rows,focusRow);
  merge(updates);
  setNote(updates.length?{text:`${updates.length}줄을 표에 채웠습니다. 바뀐 칸은 색으로 표시됩니다. 확인한 뒤 아래 '저장'을 눌러 주세요.`,list:unmatched,tone:unmatched.length?"warn":"ok"}:{text:"채울 줄을 찾지 못했습니다. 머리글(날짜·예배·안내위원·헌금위원·말씀봉독)을 함께 복사해 보세요.",list:unmatched,tone:"warn"});
  if(updates.length)setPaste("");
 };
 const save=()=>startSaving(async()=>{
  const idx=changed.flatMap((c,i)=>c?[i]:[]);
  const res=await saveMonthStaff({month,rows:idx.map(i=>({serviceId:rows[i].serviceId,date:rows[i].date,staff:composeStaff(values[i]),updatedAt:versions[i]}))}).catch(()=>null);
  if(!res||(!res.rows.length&&!res.ok)){setNote({text:res?.message??"저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",tone:"warn"});return;}
  const nb=[...baseline],nv=[...versions],bad=new Set<number>();let saved=0;
  res.rows.forEach((r,k)=>{const i=idx[k];if(r.status==="saved"){nb[i]=values[i];nv[i]=r.updatedAt??null;saved++;}else bad.add(i);});
  setBaseline(nb);setVersions(nv);setConflicts(bad);
  setNote(bad.size?{text:`${saved}줄 저장, ${bad.size}줄은 저장하지 못했습니다. 다른 화면에서 먼저 고쳤을 수 있으니 내용을 복사해 두고 새로고침해 확인해 주세요.`,tone:"warn"}:{text:`${saved}줄을 저장했습니다. 보고서와 예배위원 화면에 같이 보입니다.`,tone:"ok"});
 });

 return <div className="flex flex-col gap-4">
  {editable?<section className="rounded-xl border border-border bg-surface p-4">
   <h2 className="font-semibold">스프레드시트 붙여넣기</h2>
   <p className="mt-1 text-xs leading-relaxed text-muted"><b>월별 예배 위원표</b>는 그 달 시트를 통째로(시트 클릭 → Ctrl+A → Ctrl+C) 복사해 붙여넣으면 주일·수요·금요 블록을 모두 읽습니다. 다른 표는 머리글까지 함께 복사해 주세요. 날짜(11/2, 11월 2일 등)와 예배 이름(1부, 2부…)으로 줄을 찾고, 안내·헌금·봉독 머리글로 칸을 찾습니다. 날짜가 가로로 놓인 표도 읽습니다. 날짜가 없는 표는 표에서 마지막으로 누른 줄부터 차례로 채웁니다. 표의 칸에 바로 붙여넣어도 됩니다.</p>
   <textarea value={paste} onChange={e=>setPaste(e.target.value)} rows={4} className={textareaClass+" mt-3 font-mono text-sm"} placeholder={"날짜\t예배\t안내위원\t헌금위원\t말씀봉독\n11/2\t1부\t홍길동, 김철수\t이영희\t박민수"} aria-label="스프레드시트에서 복사한 표"/>
   <div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" className={smallButtonClass} disabled={!paste.trim()} onClick={fillFromPaste}>표에 채우기</button><span className="text-xs text-muted">날짜 없는 표는 {label(rows[focusRow].date)} {rows[focusRow].serviceName}부터</span></div>
  </section>:null}
  {note?<div role="status" className={"rounded-lg px-3 py-2 text-sm "+(note.tone==="ok"?"bg-accent/10 text-accent":"bg-danger/10 text-danger")}>{note.text}{note.list?.length?<ul className="mt-1 list-disc pl-5 text-xs">{note.list.slice(0,10).map(t=><li key={t}>{t}</li>)}{note.list.length>10?<li>외 {note.list.length-10}줄</li>:null}</ul>:null}</div>:null}
  <div className="overflow-x-auto rounded-xl border border-border bg-surface">
   <table className="w-full min-w-[52rem] border-collapse text-sm">
    <thead><tr className="border-b border-border bg-background text-left text-xs text-muted"><th className="w-24 px-3 py-2 font-semibold">날짜</th><th className="w-36 px-3 py-2 font-semibold">예배</th>{STAFF_COLUMNS.map(c=><th key={c.key} className="px-2 py-2 font-semibold">{c.label}</th>)}</tr></thead>
    <tbody>{rows.map((r,i)=>{const newDay=i===0||rows[i-1].date!==r.date;return <tr key={r.date+r.serviceId} className={(newDay&&i?"border-t-2 border-border ":"border-t border-border/60 ")+(conflicts.has(i)?"bg-danger/10":"")}>
     <td className="whitespace-nowrap px-3 py-1.5 align-top font-semibold tabular-nums">{newDay?label(r.date):""}</td>
     <td className="px-3 py-1.5 align-top">{r.serviceName}{changed[i]?<span className="ml-1 text-xs text-accent">· 바뀜</span>:null}</td>
     {STAFF_COLUMNS.map((c,ci)=>{const v=values[i][c.key],diff=v!==baseline[i][c.key];return <td key={c.key} className="px-1 py-1 align-top">{editable?
      <textarea rows={1} value={v} aria-label={`${label(r.date)} ${r.serviceName} ${c.label}`} maxLength={c.key==="other"?2400:500}
       onFocus={()=>setFocusRow(i)}
       onChange={e=>{const val=e.target.value;setValues(prev=>{const next=[...prev];next[i]={...next[i],[c.key]:val};return next;});}}
       onPaste={e=>{const t=e.clipboardData.getData("text/plain");if(!/[\t\n]/.test(t.trim()))return;e.preventDefault();merge(pasteBlock(t,i,ci,rows.length));setNote({text:"붙여넣은 칸을 채웠습니다. 확인한 뒤 저장해 주세요.",tone:"ok"});}}
       style={{resize:c.key==="other"?"vertical":"none"}} className={"block min-h-9 w-full rounded-md border px-2 py-1.5 text-sm leading-snug "+(diff?"border-accent bg-accent/10":"border-transparent bg-transparent hover:border-border focus:border-accent")}/>
      :<span className="block whitespace-pre-wrap px-2 py-1.5">{v||<span className="text-muted">-</span>}</span>}</td>;})}
    </tr>;})}</tbody>
   </table>
  </div>
  {editable?<div className="sticky bottom-[calc(var(--bottom-nav-height,0px)+0.5rem)] z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/95 p-3 shadow-sm backdrop-blur">
   <span className="flex-1 text-sm">{dirty?<>바뀐 줄 <b>{dirty}</b>개 · 아직 저장 전</>:<span className="text-muted">바뀐 내용이 없습니다</span>}</span>
   <button type="button" className={smallButtonClass} disabled={!dirty||saving} onClick={()=>{setValues(baseline);setNote(null);setConflicts(new Set());}}>되돌리기</button>
   <button type="button" className={buttonClass} disabled={!dirty||saving} onClick={save}>{saving?"저장하는 중…":"모두에게 공유 · 저장"}</button>
  </div>:null}
 </div>;
}
