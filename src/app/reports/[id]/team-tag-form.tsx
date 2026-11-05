"use client";
import {useState,useTransition} from "react";
import {smallButtonClass,inputClass} from "@/components/ui";
import {tagReportTeams,untagReportTeam} from "./team-tag-actions";

type Option={id:string;label:string};
// 팀 고르기 + 짧은 메모 → 그 팀원들에게 알림. 이미 공유한 팀은 '취소'로 뺄 수 있다.
export function TeamTagForm({reportId,groups,tagged}:{reportId:string;groups:Option[];tagged:string[]}){
 const [picked,setPicked]=useState<string[]>([]);
 const [memo,setMemo]=useState("");
 const [query,setQuery]=useState("");
 const [msg,setMsg]=useState<{ok:boolean;message:string}|null>(null);
 const [pending,start]=useTransition();
 const shown=groups.filter(g=>!query.trim()||g.label.replace(/\s/g,"").includes(query.replace(/\s/g,"")));
 const toggle=(id:string)=>setPicked(p=>p.includes(id)?p.filter(x=>x!==id):p.length>=10?p:[...p,id]);
 return <details className="mt-3" open={picked.length>0||undefined}>
  <summary className="cursor-pointer text-sm font-semibold text-accent">팀에 공유하기</summary>
  <div className="mt-3 flex flex-col gap-3">
   <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="팀 이름으로 찾기" aria-label="팀 찾기" className={inputClass}/>
   <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">{shown.map(g=>{const on=picked.includes(g.id),done=tagged.includes(g.id);return <button key={g.id} type="button" aria-pressed={on} onClick={()=>toggle(g.id)} className={`min-h-9 rounded-lg border px-3 text-sm ${on?"border-accent bg-accent/10 font-semibold text-accent":"border-border"}`}>{on?"✓ ":""}{g.label}{done?" · 공유됨":""}</button>;})}</div>
   <label className="flex flex-col gap-1 text-sm">메모 (선택)<input value={memo} onChange={e=>setMemo(e.target.value)} maxLength={300} placeholder="예: 다음 주 음향 점검 부탁드립니다" className={inputClass}/></label>
   <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!picked.length||pending} className={smallButtonClass} onClick={()=>start(async()=>{const r=await tagReportTeams({reportId,groupIds:picked,memo});setMsg(r);if(r.ok){setPicked([]);setMemo("");}})}>{pending?"공유하는 중…":picked.length?`${picked.length}개 팀에 공유하고 알리기`:"팀을 골라 주세요"}</button>
    {msg?<span role="status" className={"text-sm "+(msg.ok?"text-accent":"text-danger")}>{msg.message}</span>:null}</div>
   <p className="text-xs text-muted">공유받은 팀원은 이 보고서를 볼 수 있고(수정은 안 됨), 알림을 받습니다. 같은 팀에 다시 공유하면 메모가 바뀌고 다시 알립니다.</p>
  </div>
 </details>;
}

export function UntagButton({reportId,groupId}:{reportId:string;groupId:string}){
 const [pending,start]=useTransition();
 return <button type="button" disabled={pending} className="text-xs text-muted underline hover:text-danger" onClick={()=>start(async()=>{await untagReportTeam({reportId,groupId});})}>{pending?"취소 중…":"공유 취소"}</button>;
}
