"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore,type CSSProperties,type TextareaHTMLAttributes} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {COMM_SONG,ampm,clock12,cueSongKeys,keepNames,cueTime,cueTitle,isOn,type Conditions,type Cue,type PdRun} from "@/lib/pd-checklist";

export type CueService={key:string;name:string;start:string;color:string;cue:Cue;roster:Record<string,string>;pd:string;conditions:Conditions;hasCommunion:boolean};
type Values=Record<string,Record<string,string>>;
type Lang="ko"|"en";
type Patch={pd?:string;roster?:Record<string,string>;conditions?:Conditions};
const POLL_MS=15000;
const PRINT_KEY="tlc-cue-print-lang";
// 인쇄할 언어는 기기마다 기억한다(기본: 한글·영어 모두).
const printLang={
 read:()=>{try{return localStorage.getItem(PRINT_KEY)??"both";}catch{return "both";}},
 write:(v:string)=>{try{localStorage.setItem(PRINT_KEY,v);}catch{}window.dispatchEvent(new Event(PRINT_KEY));},
 subscribe:(fn:()=>void)=>{window.addEventListener(PRINT_KEY,fn);return ()=>window.removeEventListener(PRINT_KEY,fn);},
};

// 'pd'는 회차의 PD 이름, 나머지는 roster 키. 영어 값은 '키_en'(비우면 한글 값을 쓴다).
const valuesOf=(s:{roster:Record<string,string>;pd:string})=>({...s.roster,pd:s.pd});

export function CueSheet({date,defaultDate,services,readOnly=false,showPd=true}:{date:string;defaultDate:string;services:CueService[];readOnly?:boolean;showPd?:boolean}){
 const router=useRouter();
 const [supabase]=useState(createClient);
 const [vals,setVals]=useState<Values>(()=>Object.fromEntries(services.map(s=>[s.key,valuesOf(s)])));
 const [conds,setConds]=useState<Record<string,Conditions>>(()=>Object.fromEntries(services.map(s=>[s.key,s.conditions])));
 const [lang,setLang]=useState<Lang>("ko");
 const printWhich=useSyncExternalStore(printLang.subscribe,printLang.read,()=>"both");
 const [status,setStatus]=useState<"idle"|"saving"|"saved"|"error">("idle");
 const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 const latest=useRef(new Map<string,{service:string;key:string;value:string}>());
 const pending=useRef(0);
 const root=useRef<HTMLDivElement>(null);

 const send=useCallback(async(service:string,patch:Patch)=>{
  pending.current++;setStatus("saving");
  const {error}=await supabase.rpc("pd_run_save",{p_service:service,p_date:date,p_patch:patch});
  pending.current--;
  setStatus(error?"error":pending.current?"saving":"saved");
 },[supabase,date]);
 const flush=useCallback((id?:string)=>{
  for(const [k,t] of [...timers.current]){
   if(id&&k!==id)continue;
   clearTimeout(t);timers.current.delete(k);const v=latest.current.get(k);latest.current.delete(k);
   if(v)void send(v.service,v.key==="pd"?{pd:v.value}:{roster:{[v.key]:v.value}});
  }
 },[send]);
 const set=(service:string,key:string,value:string)=>{
  if(readOnly)return;
  setVals(v=>({...v,[service]:{...v[service],[key]:value}}));
  const id=service+":"+key;const old=timers.current.get(id);if(old)clearTimeout(old);
  latest.current.set(id,{service,key,value});timers.current.set(id,setTimeout(()=>flush(id),700));setStatus("saving");
 };
 // 성찬주간은 주일 예배 세트 전체에 한 번에 켜고 끈다(PD 체크리스트의 같은 스위치).
 const communionOn=services.some(s=>s.hasCommunion&&conds[s.key]?.communion);
 const setCommunion=(on:boolean)=>{
  setConds(c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,services.find(s=>s.key===k)?.hasCommunion?{...v,communion:on}:v])));
  for(const s of services)if(s.hasCommunion)void send(s.key,{conditions:{communion:on}});
 };

 // 다른 기기(PD 체크리스트 포함)에서 고친 값을 주기적으로 가져온다. 글을 쓰는 중이면 건너뛴다.
 useEffect(()=>{
  const pull=async()=>{
   if(document.hidden||pending.current||timers.current.size)return;
   if(root.current?.contains(document.activeElement)&&document.activeElement?.tagName==="TEXTAREA")return;
   const {data}=await supabase.from("pd_runs").select("service_key,roster,pd_name,conditions").eq("run_date",date);
   if(!data||pending.current||timers.current.size)return;
   const got=new Map((data as Pick<PdRun,"service_key"|"roster"|"pd_name"|"conditions">[]).map(r=>[r.service_key,r]));
   setVals(v=>Object.fromEntries(Object.keys(v).map(k=>{const r=got.get(k);return [k,r?valuesOf({roster:r.roster,pd:r.pd_name}):{}];})));
   setConds(c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,{...v,...got.get(k)?.conditions}])));
  };
  const id=setInterval(pull,POLL_MS);
  const vis=()=>{if(document.hidden)flush();else void pull();};
  document.addEventListener("visibilitychange",vis);
  return ()=>{clearInterval(id);document.removeEventListener("visibilitychange",vis);};
 },[supabase,date,flush]);
 useEffect(()=>()=>flush(),[flush]);

 const go=(d:string)=>{flush();router.push(`/cue-sheet?date=${d}`);};
 const statusText={idle:"",saving:"저장 중…",saved:"저장됨",error:"저장하지 못했습니다. 연결을 확인하고 다시 입력해 주세요."}[status];
 const printLangs:Lang[]=printWhich==="ko"?["ko"]:printWhich==="en"?["en"]:["ko","en"];

 return <div ref={root} className="pdc cue">
  <div className="bar">
   <div className="bar-in">
    <div className="brand"><b>주일예배 큐시트</b></div>
    <label className="field">날짜 <input type="date" value={date} onChange={e=>e.target.value&&go(e.target.value)}/></label>
    {date!==defaultDate?<button type="button" className="btn" onClick={()=>go(defaultDate)}>돌아오는 주일</button>:null}
    {services.some(s=>s.hasCommunion)?<div className="toggles"><label className="tg"><input type="checkbox" checked={communionOn} disabled={readOnly} onChange={e=>setCommunion(e.target.checked)}/><span className="sw"/>성찬주간 (1주차)</label></div>:null}
    <div className="seg" role="group" aria-label="작성 언어">
     <button type="button" aria-pressed={lang==="ko"} onClick={()=>setLang("ko")}>한글</button>
     <button type="button" aria-pressed={lang==="en"} onClick={()=>setLang("en")}>English</button>
    </div>
    <div className="actions">
     <span className="hint">인쇄</span>
     <div className="seg" role="group" aria-label="인쇄할 언어">
      {([["both","한·영"],["ko","한글"],["en","English"]] as const).map(([k,l])=><button key={k} type="button" aria-pressed={printWhich===k} onClick={()=>printLang.write(k)}>{l}</button>)}
     </div>
     <button type="button" className="btn primary" onClick={()=>{flush();window.print();}}>인쇄 · PDF</button>
    </div>
    <p className={"save-status"+(status==="error"?" is-error":"")} role={status==="error"?"alert":"status"}>
     {statusText||(readOnly?"보기 전용입니다. 큐시트는 관리자가 지정한 작성자만 고칠 수 있습니다.":lang==="en"?"English 칸을 비우면 한글 값이 그대로 인쇄됩니다.":"칸을 눌러 바로 적으면 자동 저장됩니다. 예배인도·담당 팀·PD·송리스트는 PD 체크리스트와 같은 값입니다.")}
    </p>
   </div>
  </div>

  <div className="cue-screen">{services.map(s=><Sheet key={s.key} s={s} date={date} lang={lang} v={vals[s.key]??{}} conds={conds[s.key]??{}} readOnly={readOnly} onChange={(k,val)=>set(s.key,k,val)} onBlur={k=>flush(s.key+":"+k)} onLeave={showPd?()=>flush():undefined}/>)}</div>
  {/* 인쇄: 한 쪽(A4 가로)에 예배 하나. 한글판 1부·2부·3부·라이프라인, 그다음 영어판 같은 순서(양면이면 언어마다 2장). */}
  <div className="cue-print">{printLangs.flatMap(l=>services.map(s=><Sheet key={l+s.key} s={s} date={date} lang={l} v={vals[s.key]??{}} conds={conds[s.key]??{}}/>))}</div>
 </div>;
}

// 예배 한 개의 큐시트. onChange가 있으면 칸에 바로 적는다(화면), 없으면 값만 보인다(인쇄).
// 화면·인쇄 모두 예배마다 한 장(.sheet, 인쇄는 A4 가로 한 쪽).
function Sheet({s,date,lang,v,conds,readOnly=false,onChange,onBlur,onLeave}:{s:CueService;date:string;lang:Lang;v:Record<string,string>;conds:Conditions;readOnly?:boolean;
 onChange?:(key:string,value:string)=>void;onBlur?:(key:string)=>void;onLeave?:()=>void}){
 const en=lang==="en";
 const rows=s.cue.rows.filter(r=>isOn(r.condition,conds));
 const shown=(k:string)=>en?(v[k+"_en"]||v[k]||""):(v[k]||"");
 const cell=(k:string,label:string,hint?:string)=>{
  const key=en?k+"_en":k;
  return <>{onChange?<GrowText aria-label={`${s.name} ${label}${en?" (English)":""}`} value={v[key]??""} maxLength={k==="pd"?40:1000} autoComplete="off" lang={en?"en":"ko"} readOnly={readOnly}
   placeholder={en?(v[k]||"English"):(hint??"")} onChange={e=>onChange(key,e.target.value)} onBlur={()=>onBlur?.(key)}/>:null}<span className="pv">{keepNames(shown(k))}</span></>;
 };
 // 시간이 같은 연속 행은 시간 칸을 합친다.
 const timeSpan=(i:number)=>{const r=rows[i],p=rows[i-1];if(p&&p.from===r.from&&p.to===r.to)return 0;let n=0;for(let j=i;j<rows.length&&rows[j].from===r.from&&rows[j].to===r.to;j++)n+=rows[j].lines.length;return n;};
 const songs=cueSongKeys(s.cue,conds);
 const songLabel=(k:string,i:number)=>i<s.cue.songs?{th:String(i+1),aria:`${i+1}번 곡`}:k===COMM_SONG.id?{th:en?COMM_SONG.en:COMM_SONG.ko,aria:"성찬 곡"}:{th:en?"Offering":"헌금",aria:"헌금 곡"};
 const contents=<div className="blk"><table className="cue-t">
  <colgroup><col className="c-time"/><col className="c-what"/><col/></colgroup>
  <thead><tr><th scope="col">Time</th><th scope="col" colSpan={2}>Contents</th></tr></thead>
  <tbody>{rows.flatMap((r,i)=>r.lines.map((l,li)=><tr key={r.id+li} className={r.condition?"opt":undefined}>
   {li===0&&timeSpan(i)?<td className="time num" rowSpan={timeSpan(i)}>{cueTime(s.start,r)}</td>:null}
   {li===0?<th scope="row" rowSpan={r.lines.length}>{en?r.en:r.ko}</th>:null}
   <td className="in">{cell(l.key,`${r.ko} ${l.hint??""}`.trim(),l.hint)}</td>
  </tr>))}</tbody></table></div>;
 const songList=<div className="blk"><table className="cue-t songs">
  <colgroup><col className="c-num"/><col/></colgroup>
  <thead><tr><th scope="col" colSpan={2}>Song List</th></tr></thead>
  <tbody>{songs.map((k,i)=>{const l=songLabel(k,i);return <tr key={k} className={k===COMM_SONG.id?"opt":undefined}><th scope="row">{l.th}</th><td className="in">{cell(k,l.aria)}</td></tr>;})}</tbody></table></div>;
 const staff=<div className="blk"><table className="cue-t">
  <colgroup><col className="c-role"/><col/></colgroup>
  <thead><tr><th scope="col" colSpan={2}>Staffs</th></tr></thead>
  <tbody>{s.cue.staff.map(st=><tr key={st.key}><th scope="row">{en?st.en:st.ko}</th><td className="in">{cell(st.key,st.ko)}</td></tr>)}</tbody></table></div>;
 return <section className="sheet cue-sheet svc" style={{"--svc":s.color} as CSSProperties} lang={en?"en":"ko"} aria-label={`${s.name} ${en?"English":"한글"}`}>
  <div className="sheet-head">
   <div><div className="eyebrow">TLC {en?"Sunday Service Cue Sheet":"주일예배 큐시트"}</div><h2>{cueTitle(date,s.cue.label,s.start)}</h2></div>
   <div className="right">
    {onLeave?<Link className="btn" href={`/pd-checklist?service=${s.key}&date=${date}`} onClick={onLeave} data-print-hide>PD 체크리스트 ›</Link>:null}
    <div className="lockup"><small>{s.name}</small><b className="num">{clock12(s.start)}<span className="ampm">{ampm(s.start)}</span></b></div>
   </div>
  </div>
  <div className="cue-body"><div className="cue-col">{contents}{songList}</div>{staff}</div>
 </section>;
}

// 작성 칸. 여러 줄(카톡·시트에서 복사한 명단)도 줄바꿈 그대로 붙여 넣고, 내용이 길면 칸이 아래로 늘어난다.
// field-sizing을 아는 브라우저는 CSS가 높이를 맞추고, 모르는 브라우저(사파리 등)는 여기서 맞춘다.
const cssGrows=typeof CSS!=="undefined"&&CSS.supports?.("field-sizing","content");
function GrowText({value,...rest}:TextareaHTMLAttributes<HTMLTextAreaElement>&{value:string}){
 const ref=useRef<HTMLTextAreaElement>(null);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el||cssGrows)return;
  const fit=()=>{el.style.height="auto";el.style.height=el.scrollHeight+(el.offsetHeight-el.clientHeight)+"px";};
  fit();window.addEventListener("resize",fit);return ()=>window.removeEventListener("resize",fit);
 },[value]);
 return <textarea ref={ref} rows={1} value={value} {...rest}/>;
}
