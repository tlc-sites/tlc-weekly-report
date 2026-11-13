"use client";
import {useEffect,useState} from "react";
import {markSeniorRead,confirmSeniorReport} from "@/app/reports/[id]/read-actions";
export type ReadReceipt={role:string;version:string;viewedAt:string};
const sameVersion=(a:string,b:string)=>a===b;
export function ReportReadStatus({reportId,version,senior,initial,role,confirmed}:{reportId:string;version:string;senior:boolean;initial:ReadReceipt[];role:string|null;confirmed:ReadReceipt[]}){
 const [receipts,setReceipts]=useState(initial);
 const [confirmations,setConfirmations]=useState(confirmed);
 const [confirming,setConfirming]=useState(false);
 async function confirm(){setConfirming(true);try{const receipt=await confirmSeniorReport(reportId,version);if(receipt){setConfirmations(current=>[...current.filter(r=>r.role!==receipt.role),receipt]);setFailed(false);}else setFailed(true);}catch{setFailed(true);}finally{setConfirming(false);}}
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  if(!senior)return;
  let stopped=false,busy=false,done=false;
  const mark=async()=>{if(stopped||busy||done||document.visibilityState!=="visible")return;busy=true;
   try{const receipt=await markSeniorRead(reportId,version);if(!stopped){if(receipt){done=true;setReceipts(current=>[...current.filter(r=>r.role!==receipt.role),receipt]);}else setFailed(true);}}catch{if(!stopped)setFailed(true);}finally{busy=false;}
  };
  void mark();document.addEventListener("visibilitychange",mark);
  return ()=>{stopped=true;document.removeEventListener("visibilitychange",mark);};
 },[reportId,version,senior]);
 const people=[["pastor","담임목사님"],["pastor_wife","담임사모님"]].map(([r,label])=>{
  const receipt=receipts.find(x=>x.role===r);
  const ok=confirmations.some(c=>c.role===r&&sameVersion(c.version,version)),okBefore=confirmations.some(c=>c.role===r);
  // 한 줄 요약: 확인 완료 > 열람 > 수정 후 미열람 > 미열람
  const short=ok?"확인 완료":receipt&&sameVersion(receipt.version,version)?"열람":receipt?"수정 후 미열람":"미열람";
  return {r,label,receipt,short,read:receipt?(sameVersion(receipt.version,version)?"열람하셨습니다":"이전 보고 열람 · 수정 후 미열람"):"아직 열람하지 않으셨습니다",confirm:ok?"확인 완료":okBefore?"수정 후 재확인 필요":"아직 확인 전"};
 });
 const mine=confirmations.some(c=>c.role===role&&sameVersion(c.version,version));
 // 열람 현황은 한 줄로 접어 두고, 누르면 시각까지 펼친다
 return <section className="mb-4" aria-label="담임목사님·담임사모님 열람 현황"><details className="rounded-xl border border-border bg-surface px-3"><summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 text-[15px]"><span className="text-muted">열람</span>{people.map((p,i)=><span key={p.r}>{i?<span aria-hidden className="text-muted">· </span>:null}{p.label} <b className={p.short==="확인 완료"?"text-accent":""}>{p.short}</b></span>)}<span aria-hidden className="ml-auto text-muted">›</span></summary><div className="flex flex-col gap-2 pb-3">{people.map(p=><p key={p.r} className="text-[15px]"><strong>{p.label}</strong> · {p.read} · <span className="font-medium text-accent">{p.confirm}</span>{p.receipt?<span className="block text-muted">{new Date(p.receipt.viewedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</span>:null}</p>)}</div></details>{senior?<button type="button" disabled={confirming||mine} onClick={confirm} className="mt-3 min-h-11 w-full rounded-xl bg-accent px-4 py-2 font-semibold text-accent-foreground disabled:opacity-50 sm:w-auto">{confirming?"확인 중…":mine?"확인 완료":"이 보고서 확인했습니다"}</button>:null}{failed?<p role="status" className="mt-2 text-[15px] text-danger">열람 기록을 저장하지 못했습니다. 페이지를 다시 열어 주세요.</p>:null}</section>;
}
