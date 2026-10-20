"use client";

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
export function WorshipForm({ action, reportId, initial, showMessages }: Props<WorshipPayload>) {
  const [p, setP] = useState(initial);
  return (
    <ReportForm action={action} reportId={reportId} type="worship" payload={p}>
      <Section title="말씀과 예배위원">
        <Field label="말씀본문"><input value={p.details.sermon_passage} onChange={e=>setP({...p,details:{...p.details,sermon_passage:e.target.value}})} maxLength={100} placeholder="예: 요한복음 3:16" className={inputClass}/></Field>
        <TextArea label="말씀·예배 내용" value={p.details.sermon_content} maxLength={2000} onChange={sermon_content=>setP({...p,details:{...p.details,sermon_content}})}/>
        <TextArea label="예배위원" value={p.details.service_staff} placeholder="예: 인도 / 대표기도 / 봉독 / 헌금 / 안내 담당자" onChange={service_staff=>setP({...p,details:{...p.details,service_staff}})}/>
      </Section>
      <Section title="진행 결과">
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
      <Section title="특이사항">
        <TextArea value={p.details.notes} onChange={(notes) => setP({ ...p, details: { ...p.details, notes } })} />
      </Section>
      {showMessages ? <MessagesEditor value={p.messages} onChange={(messages) => setP({ ...p, messages })} /> : null}
    </ReportForm>
  );
}

// 학교: 출결 없이 예배·교육 내용과 이슈를 보고한다.
export function OtherForm({ action, reportId, initial, showMessages, internship=false }: Props<OtherPayload> & {internship?:boolean}) {
  const [p, setP] = useState(initial);
  return (
    <ReportForm action={action} reportId={reportId} type="other" payload={p}>
      <Section title={internship ? "스데반 인턴십 · 예배 보고":"학교 예배·교육"}>
        <TextArea label="예배 송리스트" value={p.details.song_list} maxLength={2000}
          placeholder="곡 제목을 순서대로 한 줄에 하나씩 적어 주세요."
          onChange={(song_list) => setP({ ...p, details: { ...p.details, song_list } })} />
        <div className="grid grid-cols-2 gap-3">
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
