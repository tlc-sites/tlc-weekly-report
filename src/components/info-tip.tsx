"use client";
import {useId,useState,type ReactNode} from "react";

// 제목 옆 ⓘ를 누르면 바로 아래에 짧은 설명이 펼쳐진다. 휴대폰에서 쓰기 쉽게 마우스오버 대신 누르기로 연다.
// guide는 사용 안내의 해당 칸(예: "/guide.html#write")으로, 더 긴 설명이 필요할 때만 넣는다.
export function InfoTip({title,children,guide,className=""}:{title:ReactNode;children:ReactNode;guide?:string;className?:string}){
 const [open,setOpen]=useState(false);const id=useId();
 return <div className={className}><div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{title}<button type="button" className="info-btn" aria-expanded={open} aria-controls={id} aria-label={open?"도움말 닫기":"도움말 보기"} onClick={()=>setOpen(v=>!v)}>i</button></div><div id={id} hidden={!open} className="info-box">{children}{guide?<p className="mt-2"><a href={guide} className="font-semibold text-accent underline underline-offset-2">사용 안내에서 자세히 보기 →</a></p>:null}</div></div>;
}
