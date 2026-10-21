"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import {
  CAMPUS_COUNTS,
  CAMPUS_SECTIONS,
  CAMPUS_LODGING_NONE,
  CAMPUS_OFFERINGS,
  CAMPUS_SATURDAY,
  CAMPUS_TEXTS,
  type CampusPayload,
} from "@/lib/report-forms";
import { MessagesEditor, ReportForm, Section, TextArea } from "./form-parts";

type Details = CampusPayload["details"];

// 부산 캠퍼스 사역 요약 보고 (기존 구글 폼과 같은 항목·필수 여부)
export function CampusForm({
  action,
  reportId,
  initial,
  showMessages,
  authorName,
}: {
  action: (formData: FormData) => Promise<void>;
  reportId: string;
  initial: CampusPayload;
  showMessages: boolean;
  authorName: string;
}) {
  const [p, setP] = useState<CampusPayload>({...initial,details:{...initial.details,report_mode:"sections" as const}});
  const d = p.details;
  const set = (patch: Partial<Details>) => setP({ ...p, details: { ...d, ...patch } });
  const toggle = <T extends string>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const companionIsNone = d.companion === "없음";
  const lodgingIsNone = d.lodging === CAMPUS_LODGING_NONE;

  return (
    <ReportForm action={action} reportId={reportId} type="campus" payload={p}>
      <p className="mb-4 text-sm text-muted">보고할 항목을 펼쳐 작성해 주세요. 작성한 항목만 제출됩니다.</p>
      {CAMPUS_SECTIONS.map(([key,label])=><details key={key} className="mb-3 rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer font-semibold">{label}{d.sections?.[key]?.trim()?" · 작성됨":""}</summary><div className="mt-3"><TextArea label={`${label} 보고`} rows={4} maxLength={2000} value={d.sections?.[key]??""} onChange={value=>set({sections:{...d.sections,[key]:value}})}/></div></details>)}
      <details className="mb-4 rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">기존 방문·경비·사역 기록</summary>
      <Section title="방문 정보" hint="* 표시는 제출할 때 꼭 채워야 하는 항목입니다.">
        <Field label="교역자 이름">
          <input value={authorName} readOnly className={`${inputClass} text-muted`} />
        </Field>
        <Field label="동행 스텝 이름 *" hint="없으면 '없음'을 고르고, 있으면 이름을 적어 주세요.">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set({ companion: companionIsNone ? "" : "없음" })}
              className={`h-11 shrink-0 rounded-lg border px-4 text-sm ${companionIsNone ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border"}`}
            >
              없음
            </button>
            <input
              value={companionIsNone ? "" : d.companion}
              disabled={companionIsNone}
              onChange={(e) => set({ companion: e.target.value })}
              maxLength={50}
              placeholder="동행 스텝 이름"
              className={inputClass}
            />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="판교 출발 날짜 *">
            <input type="date" value={d.depart_pangyo} onChange={(e) => set({ depart_pangyo: e.target.value })} className={inputClass} />
          </Field>
          <Field label="부산 출발 날짜 *">
            <input type="date" value={d.depart_busan} onChange={(e) => set({ depart_busan: e.target.value })} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="헌금 챙김 *">
        <CheckGroup options={CAMPUS_OFFERINGS} value={d.offerings} onToggle={(o) => set({ offerings: toggle(d.offerings, o) })} />
        <input
          value={d.offerings_other}
          onChange={(e) => set({ offerings_other: e.target.value })}
          maxLength={100}
          placeholder="기타 (직접 입력)"
          className={inputClass}
        />
      </Section>

      <Section title="경비 *">
        <div className="grid grid-cols-2 gap-3">
          {CAMPUS_COUNTS.map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={d.counts[key] ?? ""}
                onChange={(e) =>
                  set({ counts: { ...d.counts, [key]: e.target.value === "" ? null : Math.max(0, Math.min(99, Number(e.target.value))) } })
                }
                className={inputClass}
              />
            </Field>
          ))}
        </div>
        <Field label="숙소 지출 여부" hint="지출했으면 숙소 이름과 몇 박인지 적어 주세요.">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => set({ lodging: lodgingIsNone ? "" : CAMPUS_LODGING_NONE })}
              className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm ${lodgingIsNone ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border"}`}
            >
              {CAMPUS_LODGING_NONE}
            </button>
            <input
              value={lodgingIsNone ? "" : d.lodging}
              disabled={lodgingIsNone}
              onChange={(e) => set({ lodging: e.target.value })}
              maxLength={200}
              placeholder="예: OO호텔 1박"
              className={inputClass}
            />
          </div>
        </Field>
      </Section>

      <Section title="토요일 예배팀 모임 *">
        <CheckGroup options={CAMPUS_SATURDAY} value={d.saturday} onToggle={(o) => set({ saturday: toggle(d.saturday, o) })} />
        <input
          value={d.saturday_other}
          onChange={(e) => set({ saturday_other: e.target.value })}
          maxLength={100}
          placeholder="기타 (직접 입력)"
          className={inputClass}
        />
      </Section>

      <Section title="사역 소식 *">
        {CAMPUS_TEXTS.map(([key, label, placeholder]) => (
          <TextArea
            key={key}
            label={label}
            required
            value={d.texts[key]}
            onChange={(v) => set({ texts: { ...d.texts, [key]: v } })}
            placeholder={placeholder}
          />
        ))}
      </Section>

      </details>
      {showMessages ? <MessagesEditor value={p.messages} onChange={(messages) => setP({ ...p, messages })} /> : null}
    </ReportForm>
  );
}

function CheckGroup<T extends string>({ options, value, onToggle }: { options: readonly T[]; value: T[]; onToggle: (o: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value.includes(o)}
          onClick={() => onToggle(o)}
          className={`h-10 rounded-lg border px-3 text-sm ${value.includes(o) ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
