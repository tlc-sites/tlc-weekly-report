"use client";

import {ReportAttentionFields} from "@/components/report-attention-fields";
import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { OTHER_ISSUE_CATEGORIES, RESULT_LABEL, type OtherPayload, type WorshipPayload } from "@/lib/report-forms";
import { IssuesEditor, MessagesEditor, ReportForm, RequestsEditor, Section, TextArea } from "./form-parts";

type Props<T> = {
  action: (formData: FormData) => Promise<void>;
  reportId: string;
  initial: T;
  showMessages: boolean;
};

const personHint = (category: string) =>
  category === "인력" || category === "인력·관계" ? "특정인을 비난하기보다 상황과 개선 방안 위주로 적어 주세요." : null;

// 예배팀: 진행 결과, 이슈, 요청사항
export function WorshipForm({ action, reportId, initial, showMessages, worshipTeam=false }: Props<WorshipPayload> & {worshipTeam?:boolean}) {
  const [p, setP] = useState(initial);
  return (
    <ReportForm action={action} reportId={reportId} type="worship" payload={p}>
      <p className="mb-4 rounded-xl bg-accent/5 p-3 text-sm text-muted">예배·기술팀 사역 보고입니다. 출결 대신 담당하신 사역, 진행 내용과 필요한 조치를 기록해 주세요. 예배팀 리허설 참석은 별도 메뉴에서 관리합니다.</p>
      {worshipTeam?<Section title="예배인도자"><Field label="예배인도자 (선택)"><input value={p.details.worship_leader??""} maxLength={100} placeholder="이 예배의 예배인도자 이름" onChange={e=>setP({...p,details:{...p.details,worship_leader:e.target.value}})} className={inputClass}/></Field></Section>:null}
      <Section title="말씀 (선택)" hint="팀마다 반복 입력하지 않아도 제출할 수 있습니다.">
        <Field label="말씀본문 (선택)"><input value={p.details.sermon_passage} onChange={e=>setP({...p,details:{...p.details,sermon_passage:e.target.value}})} maxLength={100} placeholder="예: 요한복음 3:16" className={inputClass}/></Field>
        <TextArea label="말씀·예배 내용 (선택)" value={p.details.sermon_content} maxLength={2000} onChange={sermon_content=>setP({...p,details:{...p.details,sermon_content}})}/>
        <p className="text-sm text-muted">예배위원은 별도 ‘예배위원’ 메뉴에서 관리하며, 위쪽의 공유 명단을 확인해 주세요.</p>{p.details.service_staff?<p className="whitespace-pre-wrap text-sm">기존 보고의 예배위원: {p.details.service_staff}</p>:null}
      </Section>
      <Section title="해당 부서 로테이션"><TextArea label="담당자·담당 파트" value={p.details.rotation??""} maxLength={1000} placeholder="예: 메인 김OO / 모니터 박OO / 다음 주 이OO" onChange={rotation=>setP({...p,details:{...p.details,rotation}})}/></Section>
      <Section title="진행 결과"><button type="button" className="min-h-11 rounded-xl border border-border px-3 text-sm text-accent" onClick={()=>setP({...p,details:{...p.details,result:"normal",notes:p.details.notes||"특이사항 없습니다."}})}>이슈 없음 · 정상 진행으로 작성</button>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(RESULT_LABEL).map(([value, label]) => (
            <label
              key={value}
              className={`flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm ${
                p.details.result === value ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="result"
                value={value}
                checked={p.details.result === value}
                onChange={() => setP({ ...p, details: { ...p.details, result: value as WorshipPayload["details"]["result"] } })}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </Section>
      <Section title="요청사항">
        <RequestsEditor value={p.details.requests} onChange={(requests) => setP({ ...p, details: { ...p.details, requests } })} />
      </Section>
      <Section title="사역 보고">
        <TextArea label="사역 내용" value={p.details.notes} placeholder="진행한 사역, 있었던 일, 필요한 조치와 다음 주 준비를 한 번에 적어 주세요." onChange={(notes) => setP({ ...p, details: { ...p.details, notes } })} />
      </Section>
      <ReportAttentionFields needed={p.details.needs_attention===true} status={p.details.attention_status??"open"} onChange={(needed,status)=>setP({...p,details:{...p.details,needs_attention:needed,attention_status:status as "open"|"temporary"|"resolved"}})}/>
      {showMessages ? <MessagesEditor value={p.messages} onChange={(messages) => setP({ ...p, messages })} /> : null}
    </ReportForm>
  );
}

// 학교: 출결 없이 예배·교육 내용과 이슈를 보고한다.
export function OtherForm({ action, reportId, initial, showMessages, internship=false }: Props<OtherPayload> & {internship?:boolean}) {
  const [p, setP] = useState(initial);
  return (
    <ReportForm action={action} reportId={reportId} type="other" payload={p}>
      <Section title={internship ? "스데반 인턴십 · 예배 보고":"채플·교육"}>
        <TextArea label="예배 송리스트" value={p.details.song_list} maxLength={2000}
          placeholder="곡 제목을 순서대로 한 줄에 하나씩 적어 주세요."
          onChange={(song_list) => setP({ ...p, details: { ...p.details, song_list } })} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="설교본문">
            <input className={inputClass} maxLength={100} value={p.details.sermon_passage}
              placeholder="예: 요한복음 3:16"
              onChange={(e) => setP({ ...p, details: { ...p.details, sermon_passage: e.target.value } })} />
          </Field>
          <Field label="설교자">
            <input className={inputClass} maxLength={100} value={p.details.preacher}
              onChange={(e) => setP({ ...p, details: { ...p.details, preacher: e.target.value } })} />
          </Field>
        </div>
        <TextArea label="예배·교육 내용" value={p.details.content} rows={6} maxLength={2000}
          placeholder="설교 요약, 교육 내용, 활동과 반응 등을 적어 주세요."
          onChange={(content) => setP({ ...p, details: { ...p.details, content } })} />
      </Section>
      {internship ? <Section title="나눔 보고"><TextArea label="무엇을 나누었나요?" value={p.details.sharing_topic ?? ""} onChange={sharing_topic=>setP({...p,details:{...p.details,sharing_topic}})}/><Field label="나눔·성경 범위"><input value={p.details.sharing_passage ?? ""} onChange={e=>setP({...p,details:{...p.details,sharing_passage:e.target.value}})} maxLength={200} className={inputClass}/></Field><Field label="나눔 장소"><input value={p.details.sharing_place ?? ""} onChange={e=>setP({...p,details:{...p.details,sharing_place:e.target.value}})} maxLength={200} className={inputClass}/></Field></Section>:null}
      <Section title="이슈" hint="예배·교육 중 있었던 일과 필요한 조치를 적어 주세요. 이슈가 없으면 비워 두셔도 됩니다.">
        <IssuesEditor value={p.issues} onChange={(issues) => setP({ ...p, issues })} categories={OTHER_ISSUE_CATEGORIES} hint={personHint} />
      </Section>
      <Section title="요청사항">
        <RequestsEditor value={p.details.requests} onChange={(requests) => setP({ ...p, details: { ...p.details, requests } })} />
      </Section>
      <Section title="특이사항">
        <TextArea value={p.details.notes} onChange={(notes) => setP({ ...p, details: { ...p.details, notes } })} />
      </Section>
      {showMessages ? <MessagesEditor value={p.messages} onChange={(messages) => setP({ ...p, messages })} /> : null}
    </ReportForm>
  );
}
