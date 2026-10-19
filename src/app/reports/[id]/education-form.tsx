"use client";

import { MemberPhoto } from "@/components/member-photo";
import { useState } from "react";
import { Badge, Field, inputClass, selectClass, smallButtonClass } from "@/components/ui";
import { GUARDIAN_RELATIONS } from "@/lib/members";
import type { EducationPayload } from "@/lib/report-forms";
import { MessagesEditor, ReportForm, RequestsEditor, Section, TextArea } from "./form-parts";

export type RosterMember = {
  id: string;
  name: string;
  photo_data: string | null;
  birth_date: string | null;
  kind: "student" | "teacher";
  class_name: string | null;
  status: "newcomer" | "active" | "inactive";
};

type Attendance = EducationPayload["attendance"][number];
type Newcomer = EducationPayload["newcomers"][number];

const emptyNewcomer = (): Newcomer => ({
  name: "",
  grade: "",
  guardian_name: "",
  guardian_relation: "",
  guardian_contact: "",
  consent: false,
});

export function EducationForm({
  action,
  reportId,
  initial,
  roster,
  guardianCheck,
  showMessages,
}: {
  action: (formData: FormData) => Promise<void>;
  reportId: string;
  initial: EducationPayload;
  roster: RosterMember[];
  guardianCheck: boolean;
  showMessages: boolean;
}) {
  const [p, setP] = useState(initial);
  const byId = new Map(p.attendance.map((a) => [a.member_id, a]));
  const setAttendance = (id: string, patch: Partial<Attendance>) =>
    setP({ ...p, attendance: p.attendance.map((a) => (a.member_id === id ? { ...a, ...patch } : a)) });
  const setAll = (present: boolean) => setP({ ...p, attendance: p.attendance.map((a) => ({ ...a, present })) });
  const setDetails = (patch: Partial<EducationPayload["details"]>) => setP({ ...p, details: { ...p.details, ...patch } });

  const students = roster.filter((m) => m.kind === "student");
  const teachers = roster.filter((m) => m.kind === "teacher");
  const presentStudents = students.filter((m) => byId.get(m.id)?.present).length + p.newcomers.length;
  const presentTeachers = teachers.filter((m) => byId.get(m.id)?.present).length;

  const checkNewcomers = () => {
    const blank = p.newcomers.findIndex((n) => !n.name.trim());
    if (blank >= 0) return `새친구 ${blank + 1}의 이름을 입력하거나 삭제해 주세요.`;
    const noConsent = p.newcomers.findIndex((n) => n.guardian_contact.trim() && !n.consent);
    if (noConsent >= 0) return `새친구 ${noConsent + 1}의 보호자 연락처를 저장하려면 수집 동의를 체크해 주세요.`;
    return null;
  };

  return (
    <ReportForm action={action} reportId={reportId} type="education" payload={p} extraCheck={checkNewcomers}>
      <div id="attendance" />
      <Section title={`출결 관리 · 학생 ${presentStudents}/${students.length + p.newcomers.length} · 교사 ${presentTeachers}/${teachers.length}`}>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAll(true)} className={smallButtonClass}>
            전체 출석
          </button>
          <button type="button" onClick={() => setAll(false)} className={smallButtonClass}>
            전체 해제
          </button>
        </div>
        {roster.length === 0 ? (
          <p className="text-sm text-muted">명단이 비어 있습니다. 부서 검토자가 명단을 먼저 등록해 주세요.</p>
        ) : null}
        {[
          ["학생", students],
          ["교사", teachers],
        ].map(([title, list]) =>
          (list as RosterMember[]).length ? (
            <div key={title as string}>
              <p className="mb-1 text-xs font-medium text-muted">{title as string}</p>
              <ul className="flex flex-col divide-y divide-border">
                {(list as RosterMember[]).map((m) => {
                  const a = byId.get(m.id)!;
                  return (
                    <li key={m.id} className="py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-pressed={a.present}
                          onClick={() => setAttendance(m.id, { present: !a.present })}
                          className={`flex min-h-10 flex-1 items-center gap-2 rounded-lg border px-3 text-left text-sm ${
                            a.present ? "border-accent bg-accent/10 font-semibold" : "border-border text-muted"
                          }`}
                        >
                          <MemberPhoto name={m.name} photo={m.photo_data} />
                          <span aria-hidden>{a.present ? "●" : "○"}</span>
                          <span>{m.name}{m.birth_date ? <span className="block text-xs font-normal text-muted">{m.birth_date}</span> : null}</span>
                          {m.class_name ? <span className="text-xs font-normal text-muted">{m.class_name}</span> : null}
                          {m.status === "newcomer" ? <Badge tone="accent">새친구</Badge> : null}
                        </button>
                        {guardianCheck && a.present && m.kind === "student" ? (
                          <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={a.guardian_present}
                              onChange={(e) => setAttendance(m.id, { guardian_present: e.target.checked })}
                              className="size-4 accent-accent"
                            />
                            보호자 동반
                          </label>
                        ) : null}
                      </div>
                      {!a.present ? (
                        <div className="mt-2 flex items-center gap-2 pl-2">
                          <input
                            value={a.absence_reason}
                            onChange={(e) => setAttendance(m.id, { absence_reason: e.target.value })}
                            maxLength={100}
                            placeholder="결석 사유 (선택)"
                            className={`${inputClass} h-9 text-sm`}
                          />
                          <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
                            <input
                              type="checkbox"
                              checked={a.contacted}
                              onChange={(e) => setAttendance(m.id, { contacted: e.target.checked })}
                              className="size-4 accent-accent"
                            />
                            연락함
                          </label>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null,
        )}
        <p className="text-xs text-muted">결석 사유에는 건강, 가정사 등 민감한 내용을 적지 마세요.</p>
      </Section>

      <Section title="새친구" hint="저장하면 명단에 새친구로 등록되고, 이 모임에 출석한 것으로 처리됩니다.">
        {p.newcomers.map((n, i) => {
          const update = (patch: Partial<Newcomer>) =>
            setP({ ...p, newcomers: p.newcomers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <input value={n.name} onChange={(e) => update({ name: e.target.value })} maxLength={30} placeholder="이름 *" className={inputClass} />
                <input value={n.grade} onChange={(e) => update({ grade: e.target.value })} maxLength={20} placeholder="학년" className={inputClass} />
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <input
                  value={n.guardian_name}
                  onChange={(e) => update({ guardian_name: e.target.value })}
                  maxLength={30}
                  placeholder="보호자 이름 (선택)"
                  className={inputClass}
                />
                <select
                  value={n.guardian_relation}
                  onChange={(e) => update({ guardian_relation: e.target.value as Newcomer["guardian_relation"] })}
                  className={selectClass}
                >
                  <option value="">관계</option>
                  {GUARDIAN_RELATIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <input
                type="tel"
                value={n.guardian_contact}
                onChange={(e) => update({ guardian_contact: e.target.value })}
                maxLength={20}
                placeholder="보호자 연락처 (선택)"
                className={inputClass}
              />
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={n.consent} onChange={(e) => update({ consent: e.target.checked })} className="size-4 accent-accent" />
                후속 연락 목적으로 연락처 수집에 동의받았습니다
              </label>
              <button
                type="button"
                onClick={() => setP({ ...p, newcomers: p.newcomers.filter((_, j) => j !== i) })}
                className={`${smallButtonClass} self-end`}
              >
                삭제
              </button>
            </div>
          );
        })}
        <button type="button" onClick={() => setP({ ...p, newcomers: [...p.newcomers, emptyNewcomer()] })} className={`${smallButtonClass} self-start`}>
          + 새친구 추가
        </button>
      </Section>

      <Section title="예배·교육">
        <div className="grid grid-cols-2 gap-3">
          <Field label="설교 본문">
            <input
              value={p.details.sermon_passage}
              onChange={(e) => setDetails({ sermon_passage: e.target.value })}
              maxLength={100}
              placeholder="예: 요 3:16"
              className={inputClass}
            />
          </Field>
          <Field label="설교자">
            <input value={p.details.preacher} onChange={(e) => setDetails({ preacher: e.target.value })} maxLength={100} className={inputClass} />
          </Field>
        </div>
        <TextArea label="공과·활동 내용" value={p.details.activity} onChange={(activity) => setDetails({ activity })} />
      </Section>

      <Section title="기도제목" hint="작성자 본인과 검토자, 관리자만 볼 수 있습니다.">
        <TextArea value={p.prayer} onChange={(prayer) => setP({ ...p, prayer })} />
      </Section>

      <Section title="요청사항">
        <RequestsEditor value={p.details.requests} onChange={(requests) => setDetails({ requests })} />
      </Section>

      <Section title="특이사항">
        <TextArea value={p.details.notes} onChange={(notes) => setDetails({ notes })} />
      </Section>

      {showMessages ? <MessagesEditor value={p.messages} onChange={(messages) => setP({ ...p, messages })} /> : null}
    </ReportForm>
  );
}
