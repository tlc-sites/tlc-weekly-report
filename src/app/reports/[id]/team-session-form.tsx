"use client";
import {useState} from "react";
import {Field,inputClass,smallButtonClass} from "@/components/ui";
import {SESSION_LABEL,type TeamSessionPayload} from "@/lib/team-session";
import {ReportForm,Section,TextArea,MessagesEditor} from "./form-parts";
export function TeamSessionForm({reportId,initial,action,showMessages}:{reportId:string;initial:TeamSessionPayload;action:(form:FormData)=>Promise<void>;showMessages:boolean}){
  const [p,setP]=useState(initial);const d=p.details;
  const update=(patch:Partial<typeof d>)=>setP({...p,details:{...d,...patch}});
  const member=(index:number,patch:Partial<typeof d.members[number]>)=>update({members:d.members.map((m,i)=>i===index?{...m,...patch}:m)});
  const assembly=d.session_type==="assembly";
  const absent=d.members.filter(m=>!m.present).length;
  const addMember=()=>update({members:[...d.members,{name:"",present:true,note:"",follow_up:""}]});
  return <ReportForm reportId={reportId} action={action} type="team_session" payload={p}><Section title={SESSION_LABEL[d.session_type]}>
    <Field label={assembly?"모임 주제 (선택)":"주제"}><input value={d.topic} onChange={e=>update({topic:e.target.value})} maxLength={200} className={inputClass}/></Field>
    {d.session_type==="curriculum"?<Field label="공과·성경 범위"><input value={d.passage} onChange={e=>update({passage:e.target.value})} maxLength={100} className={inputClass}/></Field>:null}
    <Field label="진행 장소"><input value={d.place} onChange={e=>update({place:e.target.value})} maxLength={200} className={inputClass}/></Field><TextArea label={assembly?"모임 내용":"진행 내용"} value={d.content} rows={assembly?8:undefined} maxLength={5000} onChange={content=>update({content})}/>
  </Section>{assembly?<Section title="출결" hint="기본은 출석입니다. 결석한 사람만 '결석'을 누르고 사유를 적어 주세요.">
    <p className="text-sm font-medium" aria-live="polite">출석 {d.members.length-absent}명 · 결석 {absent}명</p>
    {d.members.map((m,i)=><div key={i} className={`rounded-xl border p-3 ${m.present?"border-border":"border-accent/50"}`}>
      <div className="flex flex-wrap items-center gap-2"><input required aria-label="이름" maxLength={100} value={m.name} onChange={e=>member(i,{name:e.target.value})} className={`${inputClass} min-w-0 flex-1`}/>
        <div role="group" aria-label={`${m.name||"이 사람"} 출결`} className="flex gap-1">{([[true,"출석"],[false,"결석"]] as const).map(([value,label])=><button key={label} type="button" aria-pressed={m.present===value} onClick={()=>member(i,{present:value})} className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${m.present===value?"border-accent bg-accent text-accent-foreground":"border-border bg-surface"}`}>{label}</button>)}</div></div>
      {m.present?null:<div className="mt-2"><TextArea label="결석 사유" value={m.note} maxLength={500} onChange={note=>member(i,{note})}/></div>}
      <button type="button" onClick={()=>update({members:d.members.filter((_,j)=>j!==i)})} className={`${smallButtonClass} mt-2`}>명단에서 빼기</button></div>)}
    <button type="button" disabled={d.members.length>=150} className={smallButtonClass} onClick={addMember}>+ 사람 추가</button>
  </Section>:<Section title="팀원별 간단한 보고" hint="참석 여부와 필요한 상황·후속 조치를 짧게 남겨 주세요.">{d.members.map((m,i)=><div key={i} className="rounded-xl border border-border p-3"><Field label="팀원 이름"><input required maxLength={100} value={m.name} onChange={e=>member(i,{name:e.target.value})} className={inputClass}/></Field><label className="my-3 flex min-h-11 items-center gap-2"><input type="checkbox" checked={m.present} onChange={e=>member(i,{present:e.target.checked})}/>참석</label><TextArea label="간단한 상황" value={m.note} maxLength={500} onChange={note=>member(i,{note})}/><TextArea label="후속 조치" value={m.follow_up} maxLength={500} onChange={follow_up=>member(i,{follow_up})}/><button type="button" onClick={()=>update({members:d.members.filter((_,j)=>j!==i)})} className={`${smallButtonClass} mt-2`}>팀원 항목 삭제</button></div>)}<button type="button" disabled={d.members.length>=150} className={smallButtonClass} onClick={addMember}>+ 팀원 추가</button></Section>}{showMessages?<MessagesEditor value={p.messages} onChange={messages=>setP({...p,messages})}/>:null}</ReportForm>;
}
