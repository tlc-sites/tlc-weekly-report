"use client";
import {useEffect,useMemo,useState,useTransition,type ReactNode} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ampm,clock12,clockAt,SERVICE_COLORS,serviceColor,type Block,type FlowStep,type Item,type PdTemplate} from "@/lib/pd-checklist";
import {allCheckIds,parseTemplate} from "@/lib/pd-template-schema";
import {savePdTemplate} from "./actions";
import {PdChecklist} from "./checklist";

type T=PdTemplate;
type Edit<X>=(fn:(x:X)=>void)=>void;

const inp="h-10 min-w-0 rounded-lg border border-border bg-surface px-2.5 text-[15px] transition focus:border-accent";
const sel="h-10 min-w-0 rounded-lg border border-border bg-surface px-2 text-[15px] transition focus:border-accent";
const btn="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-accent/5 disabled:opacity-40";
const primary="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-40";
const add="inline-flex min-h-9 items-center rounded-lg border border-dashed border-accent/50 px-3 text-sm font-medium text-accent hover:bg-accent/5";

const clone=<X,>(x:X):X=>structuredClone(x);
function move<X>(a:X[],i:number,d:number){const j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];}
const autoLabel=(o:number)=>o===0?"START":o<0?`T-${-o}`:`T+${o}`;
const timeOf=(iso:string)=>new Date(iso).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit"});

/** 이미 쓰는 ID 모두(새 ID가 겹치지 않게). 담당자·보고 칸·블록·위치표 행 ID까지 함께 피한다. */
function usedIds(t:T){
 const matrixRows=[...t.page1.rows.flat().flatMap(b=>b.items),...t.page2.during.items,...t.page2.after.items].flatMap(i=>i.type==="locationMatrix"?i.rows.map(r=>r.id):[]);
 return [...allCheckIds(t),...matrixRows,...t.page1.rows.flat().map(b=>b.id),...t.page2.roster.flatMap(g=>g.fields.map(f=>f.id)),...t.page2.report.fields.map(f=>f.id),...t.conditions.map(c=>c.id)];
}

export function PdTemplateEditor({services,service,version,template,history,sunday,saved}:{
 services:{key:string;name:string;start:string}[];service:string;version:number;template:T;
 history:{version:number;created_at:string;content:T}[];sunday:string;saved?:number;
}){
 const router=useRouter();
 const [draft,setDraft]=useState<T>(()=>clone(template));
 const [tab,setTab]=useState<"edit"|"preview">("edit");
 const [msg,setMsg]=useState<{kind:"error"|"ok";lines:string[]}|null>(saved?{kind:"ok",lines:[`v${saved}으로 저장했습니다. 오늘과 앞으로의 회차에 바로 보입니다.`]}:null);
 const [copy,setCopy]=useState({name:"",start:template.start});
 const [busy,startSave]=useTransition();
 const dirty=useMemo(()=>JSON.stringify(draft)!==JSON.stringify(template),[draft,template]);
 useEffect(()=>{
  if(!dirty)return;
  const h=(e:BeforeUnloadEvent)=>e.preventDefault();
  window.addEventListener("beforeunload",h);return ()=>window.removeEventListener("beforeunload",h);
 },[dirty]);

 const up:Edit<T>=fn=>setDraft(d=>{const n=clone(d);fn(n);return n;});
 // 새 ID는 지금 내용과 처음 불러온 내용 어디에도 없는 것으로 만든다.
 const newId=(d:T,prefix:string)=>{const taken=new Set([...usedIds(template),...usedIds(d)]);let n=1;while(taken.has(prefix+n))n++;return prefix+n;};

 const save=(asNew?:{name:string;start:string})=>{
  const content=asNew?{...draft,name:asNew.name.trim(),start:asNew.start}:draft;
  const p=parseTemplate(content);
  if(!p.ok){setMsg({kind:"error",lines:p.errors});window.scrollTo({top:0});return;}
  startSave(async()=>{
   const r=await savePdTemplate({service,baseVersion:version,content:p.data,asNew:!!asNew});
   if(!r.ok){setMsg({kind:"error",lines:r.errors});window.scrollTo({top:0});return;}
   router.replace(`/pd-checklist/edit?service=${r.service}&saved=${r.version}`);
  });
 };
 const switchTo=(key:string)=>{if(dirty&&!window.confirm("저장하지 않은 수정이 있습니다. 다른 예배로 옮길까요?"))return;router.push(`/pd-checklist/edit?service=${key}`);};

 const conds=draft.conditions;
 const condSelect=(value:string|null|undefined,onChange:(v:string|null)=>void)=>
  <select className={sel} aria-label="보이는 조건" value={value??""} onChange={e=>onChange(e.target.value||null)}>
   <option value="">항상</option>{conds.map(c=><option key={c.id} value={c.id}>{c.label}일 때만</option>)}
  </select>;

 return <div className="pdc-editor space-y-4 pb-24">
  <div className="sticky top-[var(--topbar-h,0px)] z-10 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
   <div className="flex flex-wrap items-center gap-2">
    <b className="mr-1 text-lg">체크리스트 편집</b>
    <select className={sel} aria-label="예배 선택" value={service} onChange={e=>switchTo(e.target.value)}>{services.map(s=><option key={s.key} value={s.key}>{s.name} {clock12(s.start)} {ampm(s.start)}</option>)}</select>
    <span className="text-sm text-muted">v{version}{dirty?" · 수정 중":""}</span>
    <div className="ml-auto flex flex-wrap gap-2">
     <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="보기">
      {(["edit","preview"] as const).map(k=><button key={k} type="button" aria-pressed={tab===k} className={"rounded-md px-3 py-1.5 text-sm "+(tab===k?"bg-accent text-accent-foreground":"")} onClick={()=>setTab(k)}>{k==="edit"?"편집":"미리보기"}</button>)}
     </div>
     <Link className={btn} href={`/pd-checklist?service=${service}`}>체크리스트로</Link>
     <button type="button" className={primary} disabled={busy||!dirty} onClick={()=>save()}>{busy?"저장 중…":"저장 (새 버전)"}</button>
    </div>
   </div>
   {msg?<div role={msg.kind==="error"?"alert":"status"} className={"mt-2 rounded-lg px-3 py-2 text-sm "+(msg.kind==="error"?"bg-danger/10 text-danger":"bg-accent/10 text-accent")}>{msg.lines.map((l,i)=><p key={i}>{l}</p>)}</div>:null}
  </div>

  {tab==="preview"?<div className="-mx-4"><PdChecklist preview services={[]} service={service} date={sunday} defaultDate={sunday} template={draft} version={version} latestVersion={version} initialRun={null}/></div>:<>
  <p className="text-sm text-muted">저장하면 새 버전이 되고, 오늘과 앞으로의 회차에 바로 보입니다(이미 적은 체크·담당자 값은 그대로). 지난 회차는 그때 내용으로 남습니다. 시각은 <b>시작 시각 기준 분</b>(예: -30 = 30분 전)으로 적으면 자동 계산됩니다.</p>

  <Section title="기본">
   <div className="grid gap-3 sm:grid-cols-2">
    <L label="예배 이름"><input className={inp+" w-full"} value={draft.name} maxLength={40} onChange={e=>up(d=>{d.name=e.target.value;})}/></L>
    <L label="시작 시각"><input className={inp+" w-full"} type="time" value={draft.start} onChange={e=>e.target.value&&up(d=>{d.start=e.target.value;})}/></L>
    <L label="1페이지 제목"><input className={inp+" w-full"} value={draft.page1.title} maxLength={40} onChange={e=>up(d=>{d.page1.title=e.target.value;})}/></L>
    <L label="2페이지 제목"><input className={inp+" w-full"} value={draft.page2.title} maxLength={40} onChange={e=>up(d=>{d.page2.title=e.target.value;})}/></L>
    <L label="2페이지 안내 문구"><input className={inp+" w-full"} value={draft.page2.banner} maxLength={80} onChange={e=>up(d=>{d.page2.banner=e.target.value;})}/></L>
    <L label="인수인계 대상"><input className={inp+" w-full"} value={draft.handoverTo??""} maxLength={40} onChange={e=>up(d=>{d.handoverTo=e.target.value;})}/></L>
   </div>
   <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">예배 색</span>
    {SERVICE_COLORS.map(c=>{const on=serviceColor({id:service,color:draft.color})===c.hex;return <button key={c.hex} type="button" aria-pressed={on} aria-label={c.label} title={c.label}
     className={"size-9 rounded-full border-2 "+(on?"border-foreground":"border-transparent")} style={{background:c.hex}} onClick={()=>up(d=>{d.color=c.hex;})}/>;})}
    <span className="text-muted">체크리스트·큐시트의 강조색입니다.</span>
   </div>
  </Section>

  <Section title="이번 주 조건" hint="체크리스트 위의 스위치입니다. 항목·FLOW 칸에 조건을 걸면 스위치가 켜졌을 때만 보입니다.">
   {conds.map((c,i)=><div key={c.id} className="flex flex-wrap items-end gap-2 border-b border-border/60 pb-2">
    <L label="스위치 이름" className="min-w-40 flex-1"><input className={inp+" w-full"} value={c.label} maxLength={30} onChange={e=>up(d=>{d.conditions[i].label=e.target.value;})}/></L>
    <L label="항목 옆 표시" className="w-36"><input className={inp+" w-full"} value={c.tag} maxLength={20} onChange={e=>up(d=>{d.conditions[i].tag=e.target.value;})}/></L>
    <label className="flex h-10 items-center gap-1.5 text-sm"><input type="checkbox" checked={c.default} disabled={c.id==="communion"} onChange={e=>up(d=>{d.conditions[i].default=e.target.checked;})}/>{c.id==="communion"?"날짜 1~7일이면 자동으로 켬":"처음부터 켬"}</label>
    <Tools n={conds.length} i={i} onMove={k=>up(d=>move(d.conditions,i,k))} onDel={()=>up(d=>removeCondition(d,c.id))}/>
   </div>)}
   <button type="button" className={add} onClick={()=>up(d=>{d.conditions.push({id:newId(d,"cond"),label:"새 조건",tag:"새 조건",default:false});})}>+ 조건</button>
  </Section>

  <Section title="팀 이름" hint="체크 항목 옆에 붙이는 팀 표시입니다.">
   <div className="flex flex-wrap gap-2">{draft.teams.map((tm,i)=><span key={i} className="inline-flex items-center gap-1"><input className={inp+" w-28"} value={tm} maxLength={20} aria-label="팀 이름" onChange={e=>up(d=>{d.teams[i]=e.target.value;})}/><button type="button" className={btn+" px-2"} aria-label="팀 삭제" onClick={()=>up(d=>{const old=d.teams[i];d.teams.splice(i,1);forEachItem(d,it=>{if(it.type==="check"&&it.teams)it.teams=it.teams.filter(x=>x!==old);});})}>✕</button></span>)}
    <button type="button" className={add} onClick={()=>up(d=>{d.teams.push("새 팀");})}>+ 팀</button></div>
  </Section>

  <Section title={`1페이지 · ${draft.page1.title}`} hint="줄마다 블록이 가로로 놓입니다. 인쇄는 A4 가로 2장이 기준이라 너무 많이 넣으면 넘칠 수 있으니 미리보기에서 인쇄해 확인해 주세요.">
   {draft.page1.rows.map((row,ri)=><div key={ri} className="space-y-3 rounded-xl border border-border/70 p-3">
    <div className="flex items-center gap-2"><b>{ri+1}줄</b><span className="text-sm text-muted">블록 {row.length}개</span>
     {draft.page1.rows.length>1?<button type="button" className={btn+" ml-auto"} onClick={()=>{if(window.confirm(`${ri+1}줄과 그 안의 블록을 모두 지울까요?`))up(d=>{d.page1.rows.splice(ri,1);});}}>줄 삭제</button>:null}</div>
    {row.map((b,bi)=><BlockEditor key={b.id} b={b} start={draft.start} rows={draft.page1.rows.length} ri={ri} bi={bi} n={row.length}
     edit={fn=>up(d=>fn(d.page1.rows[ri][bi]))}
     onMove={k=>up(d=>move(d.page1.rows[ri],bi,k))}
     onRow={k=>up(d=>{const [x]=d.page1.rows[ri].splice(bi,1);d.page1.rows[ri+k].push(x);if(!d.page1.rows[ri].length)d.page1.rows.splice(ri,1);})}
     onDel={()=>{if(window.confirm(`'${b.label} ${b.title}' 블록을 지울까요?`))up(d=>{d.page1.rows[ri].splice(bi,1);if(!d.page1.rows[ri].length)d.page1.rows.splice(ri,1);});}}
     items={<ItemsEditor items={b.items} edit={fn=>up(d=>fn(d.page1.rows[ri][bi].items))} newId={p=>newId(draft,p)} teams={draft.teams} condSelect={condSelect}/>}/>)}
    <button type="button" className={add} onClick={()=>up(d=>{const last=d.page1.rows[ri].at(-1);const o=last?Math.min(last.offsetMin+5,0):-30;d.page1.rows[ri].push({id:newId(d,"blk"),offsetMin:o,label:autoLabel(o),title:"",style:"default",items:[]});})}>+ 블록</button>
   </div>)}
   {draft.page1.rows.length<3?<button type="button" className={add} onClick={()=>up(d=>{d.page1.rows.push([{id:newId(d,"blk"),offsetMin:0,label:"START",title:"",style:"default",items:[]}]);})}>+ 줄</button>:null}
  </Section>

  <Section title="FLOW (예배 순서)" hint="2페이지 위쪽 순서 칸입니다. 왼쪽부터 차례대로 보입니다.">
   <div className="space-y-2">{draft.page2.flow.map((s,i)=><FlowEditor key={s.id} s={s} i={i} n={draft.page2.flow.length} start={draft.start} conds={conds} condSelect={condSelect}
    edit={fn=>up(d=>fn(d.page2.flow[i]))} onMove={k=>up(d=>move(d.page2.flow,i,k))} onDel={()=>up(d=>{d.page2.flow.splice(i,1);})}/>)}</div>
   <button type="button" className={add} onClick={()=>up(d=>{d.page2.flow.push({id:newId(d,"s"),label:"새 순서",next:"",style:"default"});})}>+ 순서</button>
  </Section>

  <Section title="담당자 칸" hint="한 줄은 6칸 너비입니다. 너비를 2·3·6으로 하면 칸이 넓어집니다.">
   {draft.page2.roster.map((g,gi)=><div key={gi} className="space-y-2 rounded-xl border border-border/70 p-3">
    <div className="flex flex-wrap items-end gap-2">
     <L label="구분" className="w-40"><input className={inp+" w-full"} value={g.group} maxLength={20} onChange={e=>up(d=>{d.page2.roster[gi].group=e.target.value;})}/></L>
     <L label="구분 아래 작은 글" className="min-w-40 flex-1"><input className={inp+" w-full"} value={g.sub} maxLength={30} onChange={e=>up(d=>{d.page2.roster[gi].sub=e.target.value;})}/></L>
     <Tools n={draft.page2.roster.length} i={gi} onMove={k=>up(d=>move(d.page2.roster,gi,k))} onDel={()=>up(d=>{d.page2.roster.splice(gi,1);})}/>
    </div>
    {g.fields.map((f,fi)=><div key={f.id} className="flex flex-wrap items-center gap-2 pl-3">
     <input className={inp+" min-w-40 flex-1"} aria-label="칸 이름" value={f.label} maxLength={30} onChange={e=>up(d=>{d.page2.roster[gi].fields[fi].label=e.target.value;})}/>
     <select className={sel} aria-label="너비" value={f.span} onChange={e=>up(d=>{d.page2.roster[gi].fields[fi].span=Number(e.target.value);})}>{[1,2,3,6].map(n=><option key={n} value={n}>너비 {n}</option>)}</select>
     <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={f.multiple} onChange={e=>up(d=>{d.page2.roster[gi].fields[fi].multiple=e.target.checked;})}/>여러 명</label>
     <Tools n={g.fields.length} i={fi} onMove={k=>up(d=>move(d.page2.roster[gi].fields,fi,k))} onDel={()=>up(d=>{d.page2.roster[gi].fields.splice(fi,1);})}/>
    </div>)}
    <button type="button" className={add+" ml-3"} onClick={()=>up(d=>{d.page2.roster[gi].fields.push({id:newId(d,"r"),label:"새 칸",span:1,multiple:false});})}>+ 칸</button>
   </div>)}
   <button type="button" className={add} onClick={()=>up(d=>{d.page2.roster.push({group:"새 구분",sub:"",fields:[{id:newId(d,"r"),label:"새 칸",span:1,multiple:false}]});})}>+ 구분</button>
  </Section>

  {(["during","after"] as const).map(k=><Section key={k} title={draft.page2[k].title}>
   <L label="제목"><input className={inp+" w-full"} value={draft.page2[k].title} maxLength={30} onChange={e=>up(d=>{d.page2[k].title=e.target.value;})}/></L>
   <ItemsEditor items={draft.page2[k].items} edit={fn=>up(d=>fn(d.page2[k].items))} newId={p=>newId(draft,p)} teams={draft.teams} condSelect={condSelect}/>
  </Section>)}

  <Section title="PD REPORT">
   <L label="제목"><input className={inp+" w-full"} value={draft.page2.report.title??""} maxLength={30} onChange={e=>up(d=>{d.page2.report.title=e.target.value;})}/></L>
   <p className="text-sm font-medium">문제 분류</p>
   <div className="flex flex-wrap gap-2">{draft.page2.report.categories.map((c,i)=><span key={c.id} className="inline-flex items-center gap-1"><input className={inp+" w-40"} aria-label="분류 이름" value={c.text} maxLength={30} onChange={e=>up(d=>{d.page2.report.categories[i].text=e.target.value;})}/><Tools n={draft.page2.report.categories.length} i={i} onMove={k=>up(d=>move(d.page2.report.categories,i,k))} onDel={()=>up(d=>{d.page2.report.categories.splice(i,1);})}/></span>)}
    <button type="button" className={add} onClick={()=>up(d=>{d.page2.report.categories.push({id:newId(d,"q"),text:"새 분류"});})}>+ 분류</button></div>
   <p className="text-sm font-medium">보고 항목</p>
   {draft.page2.report.fields.map((f,i)=><div key={f.id} className="flex flex-wrap items-center gap-2">
    <input className={inp+" w-36"} aria-label="항목 이름" value={f.label} maxLength={20} onChange={e=>up(d=>{d.page2.report.fields[i].label=e.target.value;})}/>
    <select className={sel} aria-label="입력 방식" value={f.type} onChange={e=>up(d=>{const x=d.page2.report.fields[i];x.type=e.target.value as "text"|"choice";if(x.type==="choice"&&!x.options?.length)x.options=["아니오","예"];})}><option value="text">글 쓰기</option><option value="choice">하나 고르기</option></select>
    {f.type==="choice"
     ?<input key={(f.options??[]).join("|")} className={inp+" min-w-40 flex-1"} aria-label="선택지(쉼표로 구분)" placeholder="선택지를 쉼표로 구분" defaultValue={(f.options??[]).join(", ")} onBlur={e=>up(d=>{d.page2.report.fields[i].options=e.target.value.split(",").map(x=>x.trim()).filter(Boolean);})}/>
     :<input className={inp+" min-w-40 flex-1"} aria-label="안내 글" placeholder="칸 안 안내 글" value={f.placeholder??""} maxLength={60} onChange={e=>up(d=>{d.page2.report.fields[i].placeholder=e.target.value;})}/>}
    <Tools n={draft.page2.report.fields.length} i={i} onMove={k=>up(d=>move(d.page2.report.fields,i,k))} onDel={()=>up(d=>{d.page2.report.fields.splice(i,1);})}/>
   </div>)}
   <button type="button" className={add} onClick={()=>up(d=>{d.page2.report.fields.push({id:newId(d,"w"),label:"새 항목",type:"text",placeholder:""});})}>+ 보고 항목</button>
  </Section>

  <Section title="새 예배 만들기 (복제)" hint="지금 편집 중인 내용을 그대로 복사해 새 예배를 만듭니다. 시작 시각만 바꾸면 모든 시각이 자동으로 다시 계산됩니다. 이 예배는 바뀌지 않습니다.">
   <div className="flex flex-wrap items-end gap-2">
    <L label="새 예배 이름" className="min-w-48 flex-1"><input className={inp+" w-full"} value={copy.name} maxLength={40} placeholder="예: 금요예배" onChange={e=>setCopy(c=>({...c,name:e.target.value}))}/></L>
    <L label="시작 시각" className="w-36"><input className={inp+" w-full"} type="time" value={copy.start} onChange={e=>e.target.value&&setCopy(c=>({...c,start:e.target.value}))}/></L>
    <button type="button" className={btn} disabled={busy||!copy.name.trim()||services.some(s=>s.name===copy.name.trim())} onClick={()=>save(copy)}>새 예배로 저장</button>
   </div>
   {services.some(s=>s.name===copy.name.trim())?<p className="text-sm text-danger">같은 이름의 예배가 이미 있습니다.</p>:null}
  </Section>

  <Section title="지난 버전" hint="불러온 뒤 저장하면 그 내용이 새 버전이 됩니다(되돌리기).">
   <ul className="divide-y divide-border/60">{history.map(h=><li key={h.version} className="flex items-center gap-3 py-2 text-sm">
    <b>v{h.version}</b><span className="text-muted">{timeOf(h.created_at)}</span>{h.version===version?<span className="text-accent">현재</span>:null}
    <button type="button" className={btn+" ml-auto"} onClick={()=>{setDraft(clone({...h.content,id:service}));setMsg({kind:"ok",lines:[`v${h.version} 내용을 불러왔습니다. 저장하면 새 버전이 됩니다.`]});window.scrollTo({top:0});}}>불러오기</button>
   </li>)}</ul>
  </Section>
  </>}
 </div>;
}

function removeCondition(d:T,id:string){
 d.conditions=d.conditions.filter(c=>c.id!==id);
 forEachItem(d,it=>{if(it.type==="check"&&it.condition===id)it.condition=null;});
 for(const s of d.page2.flow){if(s.condition===id)s.condition=null;if(s.subWhen)delete s.subWhen[id];}
}
function forEachItem(d:T,fn:(it:Item)=>void){for(const it of [...d.page1.rows.flat().flatMap(b=>b.items),...d.page2.during.items,...d.page2.after.items])fn(it);}

function Section({title,hint,children}:{title:string;hint?:string;children:ReactNode}){
 return <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
  <div><h2 className="text-base font-semibold">{title}</h2>{hint?<p className="mt-0.5 text-sm text-muted">{hint}</p>:null}</div>
  {children}
 </section>;
}
function L({label,className="",children}:{label:string;className?:string;children:ReactNode}){
 return <label className={"block text-sm "+className}><span className="mb-1 block text-muted">{label}</span>{children}</label>;
}
function Tools({n,i,onMove,onDel,horizontal=false}:{n:number;i:number;onMove:(d:number)=>void;onDel:()=>void;horizontal?:boolean}){
 return <span className="inline-flex shrink-0 gap-1">
  <button type="button" className={btn+" px-2"} aria-label={horizontal?"왼쪽으로":"위로"} disabled={i===0} onClick={()=>onMove(-1)}>{horizontal?"←":"↑"}</button>
  <button type="button" className={btn+" px-2"} aria-label={horizontal?"오른쪽으로":"아래로"} disabled={i===n-1} onClick={()=>onMove(1)}>{horizontal?"→":"↓"}</button>
  <button type="button" className={btn+" px-2 text-danger"} aria-label="삭제" onClick={onDel}>✕</button>
 </span>;
}

function BlockEditor({b,start,rows,ri,bi,n,edit,onMove,onRow,onDel,items}:{b:Block;start:string;rows:number;ri:number;bi:number;n:number;edit:Edit<Block>;onMove:(d:number)=>void;onRow:(d:number)=>void;onDel:()=>void;items:ReactNode}){
 const count=b.items.filter(i=>i.type!=="heading"&&i.type!=="note").length;
 return <details className="group rounded-xl border border-border bg-background/50">
  <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm">
   <span className="text-muted transition group-open:rotate-90" aria-hidden>▶</span>
   <b className="tabular-nums">{clock12(clockAt(start,b.offsetMin))}</b><span className="rounded bg-accent/10 px-1.5 text-accent">{b.label}</span><span className="min-w-0 flex-1 truncate">{b.title}</span>
   <span className="text-muted">항목 {count}개</span>
  </summary>
  <div className="space-y-2 border-t border-border/60 p-3">
  <div className="flex flex-wrap items-end gap-2">
   <L label={`분 → ${clock12(clockAt(start,b.offsetMin))}`} className="w-28"><input className={inp+" w-full"} type="number" min={-600} max={600} value={b.offsetMin} onChange={e=>{const o=Math.trunc(Number(e.target.value));if(Number.isFinite(o))edit(x=>{if(x.label===autoLabel(x.offsetMin))x.label=autoLabel(o);x.offsetMin=o;});}}/></L>
   <L label="표시" className="w-28"><input className={inp+" w-full"} value={b.label} maxLength={20} onChange={e=>edit(x=>{x.label=e.target.value;})}/></L>
   <L label="제목" className="min-w-32 flex-1"><input className={inp+" w-full"} value={b.title} maxLength={40} onChange={e=>edit(x=>{x.title=e.target.value;})}/></L>
   <L label="모양"><select className={sel} value={b.style} onChange={e=>edit(x=>{x.style=e.target.value as Block["style"];})}><option value="default">기본</option><option value="accent">강조(파랑)</option><option value="cue">큐(테두리)</option><option value="go">시작(진한 색)</option></select></L>
   <span className="inline-flex gap-1">
    {ri>0?<button type="button" className={btn+" px-2"} onClick={()=>onRow(-1)}>윗줄로</button>:null}
    {ri<rows-1?<button type="button" className={btn+" px-2"} onClick={()=>onRow(1)}>아랫줄로</button>:null}
    <Tools horizontal n={n} i={bi} onMove={onMove} onDel={onDel}/>
   </span>
  </div>
  <div className="space-y-1.5">
   {(b.arrivals??[]).map((a,i)=><div key={i} className="flex flex-wrap items-center gap-2">
    <span className="w-14 text-sm text-muted">도착 {clock12(clockAt(start,a.offsetMin))}</span>
    <input className={inp+" w-20"} type="number" aria-label="분" value={a.offsetMin} onChange={e=>{const o=Math.trunc(Number(e.target.value));if(Number.isFinite(o))edit(x=>{x.arrivals![i].offsetMin=o;});}}/>
    <input className={inp+" min-w-40 flex-1"} aria-label="도착 안내" value={a.text} maxLength={80} onChange={e=>edit(x=>{x.arrivals![i].text=e.target.value;})}/>
    <input className={inp+" w-40"} aria-label="장소" placeholder="장소(선택)" value={a.place??""} maxLength={80} onChange={e=>edit(x=>{x.arrivals![i].place=e.target.value||undefined;})}/>
    <Tools n={b.arrivals!.length} i={i} onMove={k=>edit(x=>move(x.arrivals!,i,k))} onDel={()=>edit(x=>{x.arrivals!.splice(i,1);if(!x.arrivals!.length)delete x.arrivals;})}/>
   </div>)}
   <button type="button" className={add} onClick={()=>edit(x=>{(x.arrivals??=[]).push({offsetMin:x.offsetMin,text:""});})}>+ 도착 시각</button>
  </div>
  {items}
  </div>
 </details>;
}

function FlowEditor({s,i,n,start,conds,condSelect,edit,onMove,onDel}:{s:FlowStep;i:number;n:number;start:string;conds:T["conditions"];condSelect:(v:string|null|undefined,f:(v:string|null)=>void)=>ReactNode;edit:Edit<FlowStep>;onMove:(d:number)=>void;onDel:()=>void}){
 return <div className="space-y-2 rounded-xl border border-border/70 p-2.5">
  <div className="flex flex-wrap items-center gap-2">
   <span className="w-6 text-sm text-muted">{i+1}</span>
   <input className={inp+" w-36"} aria-label="순서 이름" value={s.label} maxLength={30} onChange={e=>edit(x=>{x.label=e.target.value;})}/>
   <input className={inp+" min-w-40 flex-1"} aria-label="이때 준비" placeholder="이때 준비" value={s.next} maxLength={60} onChange={e=>edit(x=>{x.next=e.target.value;})}/>
   <select className={sel} aria-label="모양" value={s.style} onChange={e=>edit(x=>{x.style=e.target.value as FlowStep["style"];})}>
    {([["default","기본"],["countdown","카운트다운"],["liveStart","LIVE 시작"],["start","START"],["optional","조건부(점선)"],["liveEnd","LIVE 종료"],["end","마침(MP3)"]] as const).map(([v,l])=><option key={v} value={v}>{l}</option>)}
   </select>
   <Tools horizontal n={n} i={i} onMove={onMove} onDel={onDel}/>
  </div>
  <div className="flex flex-wrap items-center gap-2 pl-8">
   <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={typeof s.offsetMin==="number"} onChange={e=>edit(x=>{if(e.target.checked)x.offsetMin=0;else delete x.offsetMin;})}/>시각 표시</label>
   {typeof s.offsetMin==="number"?<span className="inline-flex items-center gap-1 text-sm"><input className={inp+" w-20"} type="number" aria-label="분" value={s.offsetMin} onChange={e=>{const o=Math.trunc(Number(e.target.value));if(Number.isFinite(o))edit(x=>{x.offsetMin=o;});}}/>분 → {clock12(clockAt(start,s.offsetMin))}</span>
    :<input className={inp+" w-32"} aria-label="보조 문구" placeholder="보조 문구(예: 20분)" value={s.sub??""} maxLength={30} onChange={e=>edit(x=>{x.sub=e.target.value||undefined;})}/>}
   <input className={inp+" w-28"} aria-label="작은 표시" placeholder="표시(예: 공조 OFF)" value={s.flag??""} maxLength={20} onChange={e=>edit(x=>{x.flag=e.target.value||null;})}/>
   {condSelect(s.condition,v=>edit(x=>{x.condition=v;}))}
   {conds.length&&typeof s.offsetMin!=="number"?<details className="text-sm"><summary className="cursor-pointer text-muted">조건별 보조 문구</summary>
    <div className="mt-1 space-y-1">{conds.map(c=><label key={c.id} className="flex items-center gap-2"><span className="w-32 text-muted">{c.label}일 때</span><input className={inp+" w-32"} value={s.subWhen?.[c.id]??""} maxLength={30} onChange={e=>edit(x=>{const v=e.target.value;x.subWhen={...x.subWhen};if(v)x.subWhen[c.id]=v;else delete x.subWhen[c.id];if(!Object.keys(x.subWhen).length)delete x.subWhen;})}/></label>)}</div>
   </details>:null}
  </div>
 </div>;
}

function ItemsEditor({items,edit,newId,teams,condSelect}:{items:Item[];edit:Edit<Item[]>;newId:(prefix:string)=>string;teams:string[];condSelect:(v:string|null|undefined,f:(v:string|null)=>void)=>ReactNode}){
 const one=(i:number):Edit<Item>=>fn=>edit(list=>fn(list[i]));
 return <div className="space-y-1.5">
  {items.map((it,i)=><div key={i} className="flex flex-wrap items-start gap-2 rounded-lg bg-surface p-1.5">
   <span className="w-full shrink-0 text-xs text-muted sm:mt-2.5 sm:w-14">{{check:"체크",heading:"소제목",note:"기준 문구",checkGroup:"묶음 체크",locationMatrix:"위치표"}[it.type]}</span>
   <div className="min-w-0 flex-1 basis-56 space-y-1.5"><ItemBody it={it} edit={one(i)} newId={newId} teams={teams} condSelect={condSelect}/></div>
   <Tools n={items.length} i={i} onMove={k=>edit(l=>move(l,i,k))} onDel={()=>edit(l=>{l.splice(i,1);})}/>
  </div>)}
  <div className="flex flex-wrap gap-1.5">
   <button type="button" className={add} onClick={()=>edit(l=>{l.push({type:"check",id:newId("n"),text:""});})}>+ 체크</button>
   <button type="button" className={add} onClick={()=>edit(l=>{l.push({type:"heading",text:""});})}>+ 소제목</button>
   <button type="button" className={add} onClick={()=>edit(l=>{l.push({type:"checkGroup",layout:"auto",columns:null,items:[{id:newId("n"),text:""}]});})}>+ 묶음 체크</button>
   <button type="button" className={add} onClick={()=>edit(l=>{l.push({type:"note",parts:[{text:"기준 ",bold:true},{text:"",bold:false}]});})}>+ 기준 문구</button>
   <button type="button" className={add} onClick={()=>edit(l=>{l.push({type:"locationMatrix",columns:[{key:"v",label:"영상"},{key:"a",label:"음향"}],rows:[{id:newId("m"),label:""}]});})}>+ 위치표</button>
  </div>
 </div>;
}

function ItemBody({it,edit,newId,teams,condSelect}:{it:Item;edit:Edit<Item>;newId:(prefix:string)=>string;teams:string[];condSelect:(v:string|null|undefined,f:(v:string|null)=>void)=>ReactNode}){
 switch(it.type){
  case "heading":return <input className={inp+" w-full"} aria-label="소제목" value={it.text} maxLength={60} onChange={e=>edit(x=>{if(x.type==="heading")x.text=e.target.value;})}/>;
  case "check":return <>
   <div className="flex flex-wrap gap-2">
    <input className={inp+" min-w-48 flex-1"} aria-label="체크 문구" value={it.text} maxLength={120} onChange={e=>edit(x=>{if(x.type==="check")x.text=e.target.value;})}/>
    <select className={sel} aria-label="강조" value={it.emphasis??""} onChange={e=>edit(x=>{if(x.type==="check")x.emphasis=(e.target.value||undefined) as "strong"|"highlight"|undefined;})}><option value="">보통</option><option value="strong">굵게</option><option value="highlight">점 + 굵게</option></select>
    {condSelect(it.condition,v=>edit(x=>{if(x.type==="check")x.condition=v;}))}
   </div>
   {teams.length?<div className="flex flex-wrap items-center gap-1 text-xs"><span className="text-muted">팀 표시</span>{teams.map(tm=>{const on=!!it.teams?.includes(tm);return <button key={tm} type="button" aria-pressed={on} className={"rounded-full border px-2 py-0.5 "+(on?"border-accent bg-accent/10 text-accent":"border-border text-muted")}
    onClick={()=>edit(x=>{if(x.type!=="check")return;const s=new Set(x.teams);if(on)s.delete(tm);else s.add(tm);x.teams=teams.filter(t=>s.has(t));if(!x.teams.length)delete x.teams;})}>{tm}</button>;})}</div>:null}
  </>;
  case "note":return <div className="flex flex-wrap items-center gap-2">{it.parts.map((p,i)=><span key={i} className="inline-flex items-center gap-1">
   <input className={inp+" w-44"+(p.bold?" font-semibold":"")} aria-label="문구" value={p.text} maxLength={120} onChange={e=>edit(x=>{if(x.type==="note")x.parts[i].text=e.target.value;})}/>
   <label className="text-xs"><input type="checkbox" checked={p.bold} onChange={e=>edit(x=>{if(x.type==="note")x.parts[i].bold=e.target.checked;})}/> 굵게</label>
   {it.parts.length>1?<button type="button" className={btn+" px-2"} aria-label="문구 삭제" onClick={()=>edit(x=>{if(x.type==="note")x.parts.splice(i,1);})}>✕</button>:null}
  </span>)}<button type="button" className={add} onClick={()=>edit(x=>{if(x.type==="note")x.parts.push({text:"",bold:false});})}>+ 문구</button></div>;
  case "checkGroup":return <>
   <div className="flex flex-wrap items-center gap-2 text-sm">
    <select className={sel} aria-label="배치" value={it.layout} onChange={e=>edit(x=>{if(x.type==="checkGroup"){x.layout=e.target.value as "auto"|"columns";x.columns=x.layout==="columns"?x.columns??2:null;}})}><option value="auto">글자 길이대로</option><option value="columns">열 맞춤</option></select>
    {it.layout==="columns"?<select className={sel} aria-label="열 수" value={it.columns??2} onChange={e=>edit(x=>{if(x.type==="checkGroup")x.columns=Number(e.target.value);})}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}열</option>)}</select>:null}
   </div>
   <div className="flex flex-wrap gap-2">{it.items.map((g,i)=><span key={g.id} className="inline-flex items-center gap-1"><input className={inp+" w-32"} aria-label="체크 문구" value={g.text} maxLength={40} onChange={e=>edit(x=>{if(x.type==="checkGroup")x.items[i].text=e.target.value;})}/>
    {it.items.length>1?<button type="button" className={btn+" px-2"} aria-label="삭제" onClick={()=>edit(x=>{if(x.type==="checkGroup")x.items.splice(i,1);})}>✕</button>:null}</span>)}
    <button type="button" className={add} onClick={()=>edit(x=>{if(x.type==="checkGroup")x.items.push({id:newId("n"),text:""});})}>+ 칸</button></div>
  </>;
  case "locationMatrix":return <>
   <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">열</span>{it.columns.map((c,i)=><span key={c.key} className="inline-flex items-center gap-1"><input className={inp+" w-24"} aria-label="열 이름" value={c.label} maxLength={20} onChange={e=>edit(x=>{if(x.type==="locationMatrix")x.columns[i].label=e.target.value;})}/>
    {it.columns.length>1?<button type="button" className={btn+" px-2"} aria-label="열 삭제" onClick={()=>edit(x=>{if(x.type==="locationMatrix")x.columns.splice(i,1);})}>✕</button>:null}</span>)}
    {it.columns.length<6?<button type="button" className={add} onClick={()=>edit(x=>{if(x.type!=="locationMatrix")return;let k=1;while(x.columns.some(c=>c.key==="c"+k))k++;x.columns.push({key:"c"+k,label:""});})}>+ 열</button>:null}</div>
   <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">위치</span>{it.rows.map((r,i)=><span key={r.id} className="inline-flex items-center gap-1"><input className={inp+" w-36"} aria-label="위치 이름" value={r.label} maxLength={40} onChange={e=>edit(x=>{if(x.type==="locationMatrix")x.rows[i].label=e.target.value;})}/>
    {it.rows.length>1?<button type="button" className={btn+" px-2"} aria-label="위치 삭제" onClick={()=>edit(x=>{if(x.type==="locationMatrix")x.rows.splice(i,1);})}>✕</button>:null}</span>)}
    <button type="button" className={add} onClick={()=>edit(x=>{if(x.type==="locationMatrix")x.rows.push({id:newId("m"),label:""});})}>+ 위치</button></div>
  </>;
 }
}
