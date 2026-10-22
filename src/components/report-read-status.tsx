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
 return <section className="mb-4 rounded-xl border border-border bg-surface p-3" aria-label="담임목사님·담임사모님 열람 현황"><p className="mb-2 text-xs text-muted">보고서 열람 현황</p><div className="flex flex-wrap gap-3">{[["pastor","담임목사님"],["pastor_wife","담임사모님"]].map(([role,label])=>{const receipt=receipts.find(r=>r.role===role);return <p key={role} className="text-sm"><strong>{label}</strong> · {receipt?(sameVersion(receipt.version,version)?"열람하셨습니다":"이전 보고 열람 · 수정 후 미열람"):"아직 열람하지 않으셨습니다"}<span className="block font-medium text-accent">{confirmations.some(c=>c.role===role&&sameVersion(c.version,version))?"확인 완료":confirmations.some(c=>c.role===role)?"수정 후 재확인 필요":"아직 확인 전"}</span>{receipt?<span className="block text-xs text-muted">{new Date(receipt.viewedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</span>:null}</p>;})}</div>{senior?<button type="button" disabled={confirming||confirmations.some(c=>c.role===role&&sameVersion(c.version,version))} onClick={confirm} className="mt-3 min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">{confirming?"확인 중…":confirmations.some(c=>c.role===role&&sameVersion(c.version,version))?"확인 완료":"이 보고서 확인했습니다"}</button>:null}{failed?<p role="status" className="mt-2 text-xs text-danger">열람 기록을 저장하지 못했습니다. 페이지를 다시 열어 주세요.</p>:null}</section>;
}
