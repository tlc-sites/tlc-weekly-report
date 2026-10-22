"use client";
import {useEffect,useState} from "react";
import {markSeniorRead} from "@/app/reports/[id]/read-actions";
export type ReadReceipt={role:string;version:string;viewedAt:string};
const sameVersion=(a:string,b:string)=>a===b;
export function ReportReadStatus({reportId,version,senior,initial}:{reportId:string;version:string;senior:boolean;initial:ReadReceipt[]}){
 const [receipts,setReceipts]=useState(initial);
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
 return <section className="mb-4 rounded-xl border border-border bg-surface p-3" aria-label="담임목사님·담임사모님 열람 현황"><p className="mb-2 text-xs text-muted">보고서 열람 현황</p><div className="flex flex-wrap gap-3">{[["pastor","담임목사님"],["pastor_wife","담임사모님"]].map(([role,label])=>{const receipt=receipts.find(r=>r.role===role);return <p key={role} className="text-sm"><strong>{label}</strong> · {receipt?(sameVersion(receipt.version,version)?"열람하셨습니다":"이전 보고 열람 · 수정 후 미열람"):"아직 열람하지 않으셨습니다"}{receipt?<span className="block text-xs text-muted">{new Date(receipt.viewedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</span>:null}</p>;})}</div>{failed?<p role="status" className="mt-2 text-xs text-danger">열람 기록을 저장하지 못했습니다. 페이지를 다시 열어 주세요.</p>:null}</section>;
}
