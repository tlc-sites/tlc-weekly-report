"use client";
import {useCallback,useEffect,useRef,useState,useSyncExternalStore,type CSSProperties,type ReactNode} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {clockAt,defaultConditions,flowSub,isOn,progress,serviceColor,type Block,type Conditions,type Item,type PdRun,type PdTemplate} from "@/lib/pd-checklist";

type Patch={pd?:string;conditions?:Conditions;checks?:Record<string,boolean>;roster?:Record<string,string>;report?:Record<string,string>};
type Status={kind:"idle"|"saving"|"saved"|"error";at?:string};
const PRINT_KEY="tlc-pd-print-mode";
// 인쇄 형식은 기기마다 기억한다(회차 기록과 무관).
const printMode={
 read:()=>{try{return localStorage.getItem(PRINT_KEY)==="blank";}catch{return false;}},
 write:(b:boolean)=>{try{localStorage.setItem(PRINT_KEY,b?"blank":"filled");}catch{}window.dispatchEvent(new Event(PRINT_KEY));},
 subscribe:(fn:()=>void)=>{window.addEventListener(PRINT_KEY,fn);window.addEventListener("storage",fn);return ()=>{window.removeEventListener(PRINT_KEY,fn);window.removeEventListener("storage",fn);};},
};
const POLL_MS=15000;

const fmtDate=(d:string)=>{const [,m,day]=d.split("-").map(Number);return `${m}/${day} (${"일월화수목금토"[new Date(d+"T00:00:00Z").getUTCDay()]})`;};
const timeOf=(iso:string)=>new Date(iso).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour:"numeric",minute:"2-digit"});

// preview: 편집 화면의 미리보기. 아무것도 저장하지 않고 화면에서만 눌러 본다.
export function PdChecklist({services,service,date,defaultDate,template:t,version,latestVersion,initialRun,canEdit=false,preview=false}:{
 services:{key:string;name:string;start:string}[];service:string;date:string;defaultDate:string;
 template:PdTemplate;version:number;latestVersion:number;initialRun:PdRun|null;canEdit?:boolean;preview?:boolean;
}){
 const router=useRouter();
 const [supabase]=useState(createClient);
 const baseConds=useCallback(()=>defaultConditions(t,date),[t,date]);
 const [conds,setConds]=useState<Conditions>(()=>({...baseConds(),...initialRun?.conditions}));
 const [checks,setChecks]=useState<Record<string,boolean>>(initialRun?.checks??{});
 const [roster,setRoster]=useState<Record<string,string>>(initialRun?.roster??{});
 const [report,setReport]=useState<Record<string,string>>(initialRun?.report??{});
 const [pd,setPd]=useState(initialRun?.pd_name??"");
 const blank=useSyncExternalStore(printMode.subscribe,printMode.read,()=>false);
 const [status,setStatus]=useState<Status>(initialRun?{kind:"saved",at:initialRun.updated_at}:{kind:"idle"});
 const pending=useRef(0);
 const timers=useRef(new Map<string,{timer:ReturnType<typeof setTimeout>;patch:Patch}>());
 const root=useRef<HTMLDivElement>(null);

 const setPrintMode=printMode.write;

 const apply=useCallback((r:PdRun)=>{
  setConds({...baseConds(),...r.conditions});setChecks(r.checks);setRoster(r.roster);setReport(r.report);setPd(r.pd_name);
 },[baseConds]);

 const save=useCallback(async(patch:Patch)=>{
  if(preview)return;
  pending.current++;setStatus({kind:"saving"});
  const {data,error}=await supabase.rpc("pd_run_save",{p_service:service,p_date:date,p_patch:patch});
  pending.current--;
  if(error){setStatus({kind:"error"});return;}
  const row=data as PdRun;
  setStatus({kind:"saved",at:row.updated_at});
  // 다른 기기가 먼저 새 템플릿 버전으로 회차를 만들었으면 그 버전으로 다시 그린다.
  if(row.template_version!==version)router.refresh();
 },[supabase,service,date,version,router,preview]);

 // 글자는 멈춘 뒤 잠깐 있다가, 칸을 떠날 때는 바로 저장한다.
 const flush=useCallback((key?:string)=>{
  for(const [k,v] of [...timers.current]){if(key&&k!==key)continue;clearTimeout(v.timer);timers.current.delete(k);void save(v.patch);}
 },[save]);
 const typeText=(key:string,patch:Patch)=>{
  const old=timers.current.get(key);if(old)clearTimeout(old.timer);
  timers.current.set(key,{patch,timer:setTimeout(()=>flush(key),700)});
  if(!preview)setStatus({kind:"saving"});
 };

 // 같은 회차를 다른 기기에서 고친 내용을 주기적으로 가져온다. 저장 중이거나 글을 쓰는 중이면 건너뛴다.
 useEffect(()=>{
  if(preview)return;
  const pull=async()=>{
   if(document.hidden||pending.current||timers.current.size)return;
   const a=document.activeElement;if(a&&root.current?.contains(a)&&(a.tagName==="TEXTAREA"||(a as HTMLInputElement).type==="text"))return;
   const {data}=await supabase.from("pd_runs").select("service_key,run_date,template_version,pd_name,conditions,checks,roster,report,updated_at").eq("service_key",service).eq("run_date",date).maybeSingle<PdRun>();
   if(!data||pending.current||timers.current.size)return;
   if(data.template_version!==version){router.refresh();return;}
   apply(data);setStatus({kind:"saved",at:data.updated_at});
  };
  const id=setInterval(pull,POLL_MS);
  const vis=()=>{if(document.hidden)flush();else void pull();};
  document.addEventListener("visibilitychange",vis);
  return ()=>{clearInterval(id);document.removeEventListener("visibilitychange",vis);};
 },[supabase,service,date,version,router,apply,flush,preview]);
 useEffect(()=>()=>flush(),[flush]);

 const toggle=(id:string,on:boolean)=>{setChecks(c=>({...c,[id]:on}));void save({checks:{[id]:on}});};
 const setCond=(id:string,on:boolean)=>{setConds(c=>({...c,[id]:on}));void save({conditions:{[id]:on}});};
 const setRosterField=(id:string,v:string)=>{setRoster(r=>({...r,[id]:v}));typeText("roster:"+id,{roster:{[id]:v}});};
 const setReportText=(id:string,v:string)=>{setReport(r=>({...r,[id]:v}));typeText("report:"+id,{report:{[id]:v}});};
 const setReportChoice=(id:string,v:string)=>{setReport(r=>({...r,[id]:v}));void save({report:{[id]:v}});};
 const setPdName=(v:string)=>{setPd(v);typeText("pd",{pd:v});};

 const reset=async(scope:"checks"|"all")=>{
  for(const v of timers.current.values())clearTimeout(v.timer);timers.current.clear();
  if(scope==="checks")setChecks({});else{setChecks({});setRoster({});setReport({});setPd("");setConds(baseConds());}
  if(preview)return;
  pending.current++;setStatus({kind:"saving"});
  const {data,error}=await supabase.rpc("pd_run_reset",{p_service:service,p_date:date,p_scope:scope});
  pending.current--;
  if(error){setStatus({kind:"error"});return;}
  const row=data as PdRun|null;
  if(row?.service_key){if(row.template_version!==version)router.refresh();else apply(row);setStatus({kind:"saved",at:row.updated_at});}else setStatus({kind:"idle"});
 };

 const go=(next:{service?:string;date?:string})=>{flush();router.push(`/pd-checklist?service=${next.service??service}&date=${next.date??date}`);};

 const p=progress(t,conds,checks);
 const condTag=Object.fromEntries(t.conditions.map(c=>[c.id,c.tag]));
 const flowLabel=t.flowType==="sunday"?"주일예배":t.name;
 const shown=t.page2.flow.filter(s=>isOn(s.condition,conds)).length;

 // ---------- 그리기 ----------
 const ck=(id:string,text:ReactNode,o:{cls?:string;cond?:string|null;teams?:string[];label?:string}={})=>
  <label key={id} className={"ck"+(o.cls?" "+o.cls:"")+(isOn(o.cond,conds)?"":" off")}>
   <input type="checkbox" checked={!!checks[id]} onChange={e=>toggle(id,e.target.checked)} aria-label={o.label}/>
   <span className="box" aria-hidden="true"/>
   {text!==null?<span className="tx">{text}{o.teams?.map(tm=><span key={tm} className="chip">{tm}</span>)}{o.cond?<span className="cond-tag">{condTag[o.cond]??o.cond}</span>:null}</span>:null}
  </label>;

 const items=(list:Item[])=>list.map((it,i)=>{
  switch(it.type){
   case "check":return ck(it.id,it.text,{cls:it.emphasis==="strong"?"strong":it.emphasis==="highlight"?"hl":"",cond:it.condition,teams:it.teams});
   case "heading":return <div key={i} className="shd">{it.text}</div>;
   case "note":return <div key={i} className="note">{it.parts.map((x,j)=>x.bold?<b key={j}>{x.text}</b>:<span key={j}>{x.text}</span>)}</div>;
   case "checkGroup":return <div key={i} className={"grid"+(it.layout==="auto"?" flexy":"")} style={it.layout==="auto"?undefined:{gridTemplateColumns:`repeat(${it.columns??2},minmax(0,1fr))`}}>{it.items.map(g=>ck(g.id,g.text))}</div>;
   case "locationMatrix":return <table key={i} className="floor"><thead><tr><th scope="col">위치</th>{it.columns.map(c=><th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
    <tbody>{it.rows.map(r=><tr key={r.id}><td>{r.label}</td>{it.columns.map(c=><td key={c.key}>{ck(r.id+c.key,null,{label:`${r.label} ${c.label}`})}</td>)}</tr>)}</tbody></table>;
  }
 });

 const block=(b:Block)=><div key={b.id} className={"blk"+(b.style==="default"?"":" "+b.style)}>
  <div className="blk-h"><span className="tm num">{clockAt(t.start,b.offsetMin)}</span><span className="tt">{b.label}</span>{b.title?<span className="ti">{b.title}</span>:null}</div>
  <div className="blk-b">
   {b.arrivals?.length?<div className="arr">{b.arrivals.map((a,i)=><div key={i}><b className="num">{clockAt(t.start,a.offsetMin)}</b><span>{a.text}{a.place?<span className="at"> @{a.place}</span>:null}</span></div>)}</div>:null}
   {items(b.items)}
  </div>
 </div>;

 const head=(title:string)=><div className="sheet-head">
  <div><div className="eyebrow">TLC 예배 PD Checklist</div><h2>{title}</h2></div>
  <div className="right"><div className="meta"><div>날짜<span>{fmtDate(date)}</span></div><div>PD<span>{pd}</span></div></div>
   <div className="lockup"><small>{t.name}</small><b className="num">{t.start}</b></div></div>
 </div>;

 const simple=(title:string,tag:string,body:ReactNode)=><div className="blk"><div className="blk-h"><span className="tm">{title}</span>{tag?<span className="tt">{tag}</span>:null}</div><div className="blk-b">{body}</div></div>;

 const r=t.page2.report;
 // 송리스트(칸 ID가 모두 song…인 구분)는 담당자 칸 대신 2쪽 아래 가운데 박스로 보인다.
 const songs=t.page2.roster.find(g=>g.fields.length>0&&g.fields.every(f=>f.id.startsWith("song")));
 const reportBody=<>
  <div className="shd">문제 분류</div>
  <div className="grid rp-cats" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))"}}>{r.categories.map(c=>ck(c.id,c.text))}</div>
  <div className="shd">보고 항목</div>
  <div className="rp">{r.fields.map(f=><div key={f.id} className="rp-row">
   <div className="k">{f.label}</div>
   <div>{f.type==="choice"?<div className="inline" role="radiogroup" aria-label={f.label}>{(f.options??[]).map(o=><label key={o} className="ck">
     <input type="checkbox" checked={report[f.id]===o} onChange={e=>setReportChoice(f.id,e.target.checked?o:"")}/><span className="box" aria-hidden="true"/><span className="tx">{o}</span></label>)}</div>
    :<><textarea rows={1} maxLength={1000} value={report[f.id]??""} placeholder={f.placeholder} aria-label={f.label} onChange={e=>setReportText(f.id,e.target.value)} onBlur={()=>flush("report:"+f.id)}/><div className="pv">{report[f.id]??""}</div></>}</div>
  </div>)}</div>
 </>;

 const statusText=status.kind==="saving"?"저장 중…":status.kind==="error"?"저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요.":status.kind==="saved"&&status.at?`저장됨 ${timeOf(status.at)}`:"아직 기록 없음";

 return <div ref={root} className={"pdc svc"+(blank?" is-blank":"")} style={{"--svc":serviceColor({id:service,color:t.color})} as CSSProperties}>
  <div className="bar" data-print-hide>
   <div className="bar-in">
    {preview?<div className="brand"><b>미리보기</b></div>:<><div className="brand"><b>TLC 예배 PD</b>
     <select aria-label="예배 선택" value={service} onChange={e=>go({service:e.target.value})}>{services.map(s=><option key={s.key} value={s.key}>{s.name} {s.start}</option>)}</select></div>
    <label className="field">날짜 <input type="date" value={date} onChange={e=>e.target.value&&go({date:e.target.value})}/></label>
    {date!==defaultDate?<button type="button" className="btn" onClick={()=>go({date:defaultDate})}>돌아오는 주일</button>:null}</>}
    <label className="field">PD <input type="text" value={pd} maxLength={40} placeholder="이름" autoComplete="off" onChange={e=>setPdName(e.target.value)} onBlur={()=>flush("pd")}/></label>
    <div className="toggles" role="group" aria-label="이번 주 예배 조건">
     {t.conditions.map(c=><label key={c.id} className="tg"><input type="checkbox" checked={!!conds[c.id]} onChange={e=>setCond(c.id,e.target.checked)}/><span className="sw"/>{c.label}</label>)}
    </div>
    <div className="progress" aria-live="polite"><span className="meter"><i style={{width:`${p.total?Math.round(p.done/p.total*100):0}%`}}/></span><span><b className="num">{p.done}</b> / <span className="num">{p.total}</span></span></div>
    <div className="actions">
     <span className="hint">인쇄</span>
     <div className="seg" role="group" aria-label="인쇄 형식">
      <button type="button" aria-pressed={!blank} onClick={()=>setPrintMode(false)}>작성본</button>
      <button type="button" aria-pressed={blank} onClick={()=>setPrintMode(true)}>빈 양식</button>
     </div>
     <button type="button" className="btn primary" onClick={()=>{flush();window.print();}}>인쇄 · PDF</button>
     <Armed label="체크 초기화" onConfirm={()=>void reset("checks")}/>
     {preview?null:<Armed label="전체 초기화" onConfirm={()=>void reset("all")}/>}
     {canEdit&&!preview?<Link className="btn" href={`/pd-checklist/edit?service=${service}`} onClick={()=>flush()}>편집</Link>:null}
    </div>
    {preview?null:<p className={"save-status"+(status.kind==="error"?" is-error":"")} role={status.kind==="error"?"alert":"status"}>{statusText}{version<latestVersion?` · 이 회차는 이전 체크리스트(v${version})로 기록되었습니다`:""}</p>}
   </div>
  </div>

  <section className="sheet" aria-label={t.page1.title}>
   {head(t.page1.title)}
   {t.page1.rows.map((row,i)=><div key={i} className={"row row"+(i+1)} style={{"--cols":row.length} as CSSProperties}>{row.map(block)}</div>)}
  </section>

  <section className="sheet" aria-label={t.page2.title}>
   {head(t.page2.title)}
   <div className="banner"><small>NOW → NEXT</small>{t.page2.banner}</div>
   <div className="flow-wrap"><div className="flow" style={{"--n":shown,"--n-all":t.page2.flow.length} as CSSProperties}>
    <div className="lab">{flowLabel}<small>FLOW</small></div>
    {t.page2.flow.map(s=>{const hide=isOn(s.condition,conds)?"":" hide";const sub=flowSub(s,conds,t.start);
     return <div key={s.id} className={"st st-"+s.style+hide}><b className={s.style==="countdown"?"sm":undefined}>{s.label}</b>{sub?<small>{sub}</small>:null}{s.flag?<span className="flag">{s.flag}</span>:null}</div>;})}
    <div className="lab">이때 준비<small>NEXT</small></div>
    {t.page2.flow.map(s=><div key={s.id} className={"nx"+(isOn(s.condition,conds)?"":" hide")}>{s.next}</div>)}
    <div className="lab">체크</div>
    {t.page2.flow.map(s=><div key={s.id} className={"fc"+(isOn(s.condition,conds)?"":" hide")}>{ck(s.id,null,{label:s.label})}</div>)}
   </div></div>

   <div className="roster">{t.page2.roster.filter(g=>g!==songs).map(g=><RosterGroupView key={g.group} g={g} roster={roster} onChange={setRosterField} onBlur={id=>flush("roster:"+id)}/>)}</div>

   <div className="cols3">
    <div className="stack">
     {simple(t.page2.during.title,"NOW → NEXT",items(t.page2.during.items))}
     {simple(t.page2.after.title,"",items(t.page2.after.items))}
    </div>
    {songs?simple(songs.group,"큐시트와 같은 값",<div className="pd-songs">{songs.fields.map(f=><div key={f.id} className="song-row">
     <label htmlFor={"pd-r-"+f.id} className="k">{f.label}</label>
     <input id={"pd-r-"+f.id} type="text" maxLength={1000} autoComplete="off" value={roster[f.id]??""} onChange={e=>setRosterField(f.id,e.target.value)} onBlur={()=>flush("roster:"+f.id)}/>
     <div className="pv">{roster[f.id]??""}</div>
    </div>)}</div>):null}
    {simple(r.title??"PD REPORT","종료 후 보고",reportBody)}
   </div>
  </section>
 </div>;
}

function RosterGroupView({g,roster,onChange,onBlur}:{g:PdTemplate["page2"]["roster"][number];roster:Record<string,string>;onChange:(id:string,v:string)=>void;onBlur:(id:string)=>void}){
 const slots=g.fields.map(f=><div key={f.id} className={"slot"+(f.span>1?" span"+f.span:"")}>
   <label htmlFor={"pd-r-"+f.id}>{f.label}</label>
   <input id={"pd-r-"+f.id} type="text" maxLength={1000} autoComplete="off" value={roster[f.id]??""} placeholder={f.multiple?"여러 명은 쉼표로 구분":""} onChange={e=>onChange(f.id,e.target.value)} onBlur={()=>onBlur(f.id)}/>
   <div className="pv">{roster[f.id]??""}</div>
  </div>);
 // 너비 1칸짜리가 6개를 넘으면(라이프라인 송리스트) 줄을 넘기지 않고 한 줄에 나눠 넣는다.
 const wide=g.fields.length>6&&g.fields.every(f=>f.span===1);
 return <>
  <div className="rl">{g.group}{g.sub?<small>{g.sub}</small>:null}</div>
  {wide?<div className="slots-n" style={{"--n":g.fields.length} as CSSProperties}>{slots}</div>:slots}
 </>;
}

// 실수로 지우지 않도록 두 번 눌러야 실행한다. 3초 안에 다시 누르지 않으면 원래대로.
function Armed({label,onConfirm}:{label:string;onConfirm:()=>void}){
 const [armed,setArmed]=useState(false);
 useEffect(()=>{if(!armed)return;const id=setTimeout(()=>setArmed(false),3000);return ()=>clearTimeout(id);},[armed]);
 return <button type="button" className={"btn"+(armed?" danger-armed":"")} onClick={()=>{if(armed){setArmed(false);onConfirm();}else setArmed(true);}}>{armed?"한 번 더 누르면 "+label:label}</button>;
}
