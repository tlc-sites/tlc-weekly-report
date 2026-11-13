"use client";
import Link from "@/components/pending-link";
import {useEffect,useRef,useState} from "react";

// 첫 화면 '이번 주 공지' 팝업. 확인을 누르면 같은 공지(같은 수정본)는 이 기기에서 다시 뜨지 않는다. 고치면 다시 뜬다.
export function SundayNoticePopup({sunday,label,body,version,canWrite}:{sunday:string;label:string;body:string;version:string;canWrite:boolean}){
 const key=`tlc-sunday-notice:${sunday}:${version}`;
 const [open,setOpen]=useState(false);
 const button=useRef<HTMLButtonElement>(null);
 useEffect(()=>{let seen=false;try{seen=localStorage.getItem(key)==="1";}catch{}if(!seen){const t=setTimeout(()=>setOpen(true),0);return ()=>clearTimeout(t);}},[key]);
 useEffect(()=>{if(open)button.current?.focus();},[open]);
 const close=()=>{try{localStorage.setItem(key,"1");}catch{}setOpen(false);};
 return <>
  <section className="mb-4 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3" aria-label="이번 주 공지">
   <div className="flex flex-wrap items-center gap-2"><b className="text-sm text-accent">이번 주 공지 · {label}</b>{canWrite?<Link href={`/sunday-notice?sunday=${sunday}`} className="ml-auto text-xs font-semibold text-accent underline">고치기</Link>:null}</div>
   <p className="mt-1 whitespace-pre-wrap text-sm">{body}</p>
  </section>
  {open?<div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close();}} onKeyDown={e=>{if(e.key==="Escape")close();}}>
   <div role="dialog" aria-modal="true" aria-labelledby="sunday-notice-title" className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
    <p className="text-xs font-semibold text-accent">돌아오는 주일 · {label}</p>
    <h2 id="sunday-notice-title" className="mt-1 text-lg font-semibold">이번 주 공지</h2>
    <p className="mt-3 max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-[15px] leading-relaxed">{body}</p>
    <button ref={button} type="button" onClick={close} className="mt-5 w-full rounded-xl bg-accent py-3 font-semibold text-accent-foreground">확인했습니다</button>
   </div>
  </div>:null}
 </>;
}
