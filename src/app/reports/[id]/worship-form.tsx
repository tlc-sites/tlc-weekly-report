"use client";

import { useState } from "react";
import { OTHER_ISSUE_CATEGORIES, RESULT_LABEL, WORSHIP_ISSUE_CATEGORIES, type OtherPayload, type WorshipPayload } from "@/lib/report-forms";
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
      <Section title="이슈" hint="그 예배에서 있었던 일 — 장비, 사람, 진행 등 무엇이든 적습니다.">
        <IssuesEditor value={p.issues} onChange={(issues) => setP({ ...p, issues })} categories={WORSHIP_ISSUE_CATEGORIES} hint={personHint} />
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

// 기타 모임: 이슈와 요청사항만
export function OtherForm({ action, reportId, initial, showMessages }: Props<OtherPayload>) {
  const [p, setP] = useState(initial);
  return (
    <ReportForm action={action} reportId={reportId} type="other" payload={p}>
      <Section title="이슈" hint="제출하려면 이슈를 1건 이상 적어 주세요.">
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
