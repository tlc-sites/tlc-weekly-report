"use client";
import {useRouter} from "next/navigation";
import {useEffect,useRef,useState} from "react";

export type QuickItem = { href: string; label: string; hint: string };

// Ctrl(⌘)+K로 메뉴·파트를 이름으로 찾아 바로 이동한다(PC 사이드바).
export function QuickSwitcher({items}:{items:QuickItem[]}){
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [q,setQ]=useState("");
 const [idx,setIdx]=useState(0);
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"&&matchMedia("(min-width: 1024px)").matches){e.preventDefault();setQ("");setIdx(0);setOpen(true);}};
  window.addEventListener("keydown",onKey);return ()=>window.removeEventListener("keydown",onKey);
 },[]);
 useEffect(()=>{if(open)input.current?.focus();},[open]);
 const norm=(s:string)=>s.replace(/\s/g,"").toLowerCase();
 const found=items.filter(i=>norm(i.label+i.hint).includes(norm(q))).slice(0,10);
 const go=(it:QuickItem|undefined)=>{if(!it)return;setOpen(false);router.push(it.href);};
 return <>
  <button type="button" className="app-sidebar-search" onClick={()=>{setQ("");setIdx(0);setOpen(true);}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>메뉴·파트 찾기</span><kbd>Ctrl K</kbd></button>
  {open?<div className="quick-switcher" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
   <div className="quick-switcher-box" role="dialog" aria-modal="true" aria-label="빠른 이동">
    <input ref={input} value={q} placeholder="파트나 메뉴 이름…" aria-label="찾을 이름" onChange={e=>{setQ(e.target.value);setIdx(0);}} onKeyDown={e=>{
     if(e.key==="ArrowDown"){e.preventDefault();setIdx(i=>Math.min(i+1,found.length-1));}
     else if(e.key==="ArrowUp"){e.preventDefault();setIdx(i=>Math.max(i-1,0));}
     else if(e.key==="Enter"){e.preventDefault();go(found[idx]);}
     else if(e.key==="Escape")setOpen(false);
    }}/>
    <ul>{found.length?found.map((it,i)=><li key={it.href}><button type="button" className={i===idx?"is-on":""} onMouseEnter={()=>setIdx(i)} onClick={()=>go(it)}><span>{it.label}</span><small>{it.hint}</small></button></li>):<li className="quick-switcher-empty">찾는 이름이 없습니다</li>}</ul>
    <p className="quick-switcher-help">↑↓ 이동 · Enter 열기 · Esc 닫기</p>
   </div>
  </div>:null}
 </>;
}
