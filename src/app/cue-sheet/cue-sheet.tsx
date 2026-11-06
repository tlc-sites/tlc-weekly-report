"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {cueSongKeys,cueTime,cueTitle,type Cue,type PdRun} from "@/lib/pd-checklist";

export type CueService={key:string;name:string;start:string;cue:Cue;roster:Record<string,string>;pd:string};
type Values=Record<string,Record<string,string>>;
type Lang="ko"|"en";
const POLL_MS=15000;

// 'pd'는 회차의 PD 이름, 나머지는 roster 키. 영어 값은 '키_en'(비우면 한글 값을 쓴다).
const valuesOf=(s:{roster:Record<string,string>;pd:string})=>({...s.roster,pd:s.pd});

export function CueSheet({date,defaultDate,services}:{date:string;defaultDate:string;services:CueService[]}){
 const router=useRouter();
 const [supabase]=useState(createClient);
 const [vals,setVals]=useState<Values>(()=>Object.fromEntries(services.map(s=>[s.key,valuesOf(s)])));
 const [status,setStatus]=useState<"idle"|"saving"|"saved"|"error">("idle");
 const timers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 const latest=useRef(new Map<string,{service:string;key:string;value:string}>());
 const pending=useRef(0);
 const root=useRef<HTMLDivElement>(null);

 const send=useCallback(async(service:string,key:string,value:string)=>{
  pending.current++;setStatus("saving");
  const patch=key==="pd"?{pd:value}:{roster:{[key]:value}};
  const {error}=await supabase.rpc("pd_run_save",{p_service:service,p_date:date,p_patch:patch});
  pending.current--;
  setStatus(error?"error":pending.current?"saving":"saved");
 },[supabase,date]);
 const flush=useCallback((id?:string)=>{
  for(const [k,t] of [...timers.current]){if(id&&k!==id)continue;clearTimeout(t);timers.current.delete(k);const v=latest.current.get(k);latest.current.delete(k);if(v)void send(v.service,v.key,v.value);}
 },[send]);
 const set=(service:string,key:string,value:string)=>{
  setVals(v=>({...v,[service]:{...v[service],[key]:value}}));
  const id=service+":"+key;const old=timers.current.get(id);if(old)clearTimeout(old);
  latest.current.set(id,{service,key,value});timers.current.set(id,setTimeout(()=>flush(id),700));setStatus("saving");
 };

 // 다른 기기(PD 체크리스트 포함)에서 고친 값을 주기적으로 가져온다. 글을 쓰는 중이면 건너뛴다.
 useEffect(()=>{
  const pull=async()=>{
   if(document.hidden||pending.current||timers.current.size)return;
   if(root.current?.contains(document.activeElement)&&document.activeElement?.tagName==="INPUT")return;
   const {data}=await supabase.from("pd_runs").select("service_key,roster,pd_name").eq("run_date",date);
   if(!data||pending.current||timers.current.size)return;
   const got=new Map((data as Pick<PdRun,"service_key"|"roster"|"pd_name">[]).map(r=>[r.service_key,valuesOf({roster:r.roster,pd:r.pd_name})]));
   setVals(v=>Object.fromEntries(Object.keys(v).map(k=>[k,got.get(k)??{}])));
  };
  const id=setInterval(pull,POLL_MS);
  const vis=()=>{if(document.hidden)flush();else void pull();};
  document.addEventListener("visibilitychange",vis);
  return ()=>{clearInterval(id);document.removeEventListener("visibilitychange",vis);};
 },[supabase,date,flush]);
 useEffect(()=>()=>flush(),[flush]);

 const go=(d:string)=>{flush();router.push(`/cue-sheet?date=${d}`);};
 const statusText={idle:"",saving:"저장 중…",saved:"저장됨",error:"저장하지 못했습니다. 연결을 확인하고 다시 입력해 주세요."}[status];

 const field=(s:CueService,key:string,label:string,hint?:string)=><div className="cue-field" key={key}>
  <div className="cue-k">{label}</div>
  <input aria-label={`${label} 한글`} value={vals[s.key]?.[key]??""} placeholder={hint??""} maxLength={key==="pd"?40:1000} autoComplete="off" onChange={e=>set(s.key,key,e.target.value)} onBlur={()=>flush(s.key+":"+key)}/>
  <input aria-label={`${label} 영어`} value={vals[s.key]?.[key+"_en"]??""} placeholder={vals[s.key]?.[key]||"English"} maxLength={1000} autoComplete="off" lang="en" onChange={e=>set(s.key,key+"_en",e.target.value)} onBlur={()=>flush(s.key+":"+key+"_en")}/>
 </div>;

 return <div ref={root} className="cue">
  <div className="cue-bar" data-print-hide>
   <b>주일예배 큐시트</b>
   <label>날짜 <input type="date" value={date} onChange={e=>e.target.value&&go(e.target.value)}/></label>
   {date!==defaultDate?<button type="button" onClick={()=>go(defaultDate)}>돌아오는 주일</button>:null}
   <span className="cue-status" role={status==="error"?"alert":"status"}>{statusText}</span>
   <button type="button" className="primary" onClick={()=>{flush();window.print();}}>인쇄 · PDF</button>
  </div>
  <p className="cue-help" data-print-hide>예배마다 한글판·영어판이 한 장씩(양면) 인쇄됩니다. 영어 칸을 비우면 한글 값이 그대로 들어갑니다. 예배인도·담당 팀·PD·송리스트는 PD 체크리스트의 담당자 칸과 같은 값이라 어느 쪽에서 적어도 함께 바뀝니다.</p>

  {services.map(s=><section key={s.key} className="cue-edit" data-print-hide aria-label={s.name}>
   <header><h2>{s.name}</h2><span>{cueTitle(date,s.cue.label,s.start)}</span><Link href={`/pd-checklist?service=${s.key}&date=${date}`} onClick={()=>flush()}>PD 체크리스트 ›</Link></header>
   <div className="cue-cols">
    <div><h3>순서 <small>한글 / English</small></h3>
     {s.cue.rows.map(r=><div key={r.id} className="cue-row"><div className="cue-t">{cueTime(s.start,r)} · {r.ko}</div>{r.lines.map(l=>field(s,l.key,l.hint??r.ko,l.hint))}</div>)}</div>
    <div><h3>담당 <small>한글 / English</small></h3>{s.cue.staff.map(st=>field(s,st.key,st.ko))}
     <h3 className="mt">Song List</h3>{cueSongKeys(s.cue).map((k,i)=>field(s,k,i<s.cue.songs?String(i+1):"헌금"))}</div>
   </div>
  </section>)}

  {services.flatMap(s=>(["ko","en"] as const).map(lang=><CuePage key={s.key+lang} s={s} date={date} lang={lang} v={vals[s.key]??{}}/>))}
 </div>;
}

// 인쇄용 한 장(스프레드시트 양식과 같은 배치). 화면에서는 숨긴다.
function CuePage({s,date,lang,v}:{s:CueService;date:string;lang:Lang;v:Record<string,string>}){
 const val=(k:string)=>lang==="en"?(v[k+"_en"]||v[k]||""):(v[k]||"");
 const en=lang==="en";
 // 시간이 같은 연속 행은 시간 칸을 합친다.
 const lines=s.cue.rows.flatMap((r,ri)=>r.lines.map((l,li)=>({r,ri,l,li})));
 const span=(ri:number)=>{const r=s.cue.rows[ri];const p=s.cue.rows[ri-1];if(p&&p.from===r.from&&p.to===r.to)return 0;let n=0;for(let j=ri;j<s.cue.rows.length&&s.cue.rows[j].from===r.from&&s.cue.rows[j].to===r.to;j++)n+=s.cue.rows[j].lines.length;return n;};
 const songs=cueSongKeys(s.cue);
 return <section className={"cue-page"+(en?" en":"")} lang={en?"en":"ko"}>
  <h2>{cueTitle(date,s.cue.label,s.start)}</h2>
  <div className="cue-grid">
   <table><colgroup><col style={{width:"25%"}}/><col style={{width:"30%"}}/><col/></colgroup><thead><tr><th>Time</th><th colSpan={2}>Contents</th></tr></thead>
    <tbody>{lines.map(({r,ri,l,li})=><tr key={r.id+li}>
     {li===0&&span(ri)?<td className="time" rowSpan={span(ri)}>{cueTime(s.start,r)}</td>:null}
     {li===0?<th scope="row" rowSpan={r.lines.length}>{en?r.en:r.ko}</th>:null}
     <td>{val(l.key)}</td>
    </tr>)}</tbody></table>
   <table><colgroup><col style={{width:"40%"}}/><col/></colgroup><thead><tr><th colSpan={2}>Staffs</th></tr></thead>
    <tbody>{s.cue.staff.map(st=><tr key={st.key}><th scope="row">{en?st.en:st.ko}</th><td>{val(st.key)}</td></tr>)}</tbody></table>
  </div>
  <table className="songs"><colgroup><col style={{width:"16%"}}/><col/></colgroup><thead><tr><th colSpan={2}>Song List</th></tr></thead>
   <tbody>{songs.map((k,i)=><tr key={k}><th scope="row">{i<s.cue.songs?i+1:en?"Offering":"헌금"}</th><td>{val(k)}</td></tr>)}</tbody></table>
 </section>;
}
