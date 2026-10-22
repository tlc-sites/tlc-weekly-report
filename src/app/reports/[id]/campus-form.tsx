"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import {
  CAMPUS_COUNTS,
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
  const [p, setP] = useState<CampusPayload>({...initial,details:{...initial.details,report_mode:"legacy" as const}});
  const d = p.details;
  const set = (patch: Partial<Details>) => setP({ ...p, details: { ...d, ...patch } });
  const toggle = <T extends string>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const companionIsNone = d.companion === "없음";
  const lodgingIsNone = d.lodging === CAMPUS_LODGING_NONE;

  return (
    <ReportForm action={action} reportId={reportId} type="campus" payload={p}>
      <p className="mb-4 text-sm text-muted">사역 방향 · 스탭 · 재정 · 부서별 소식 순서로 작성해 주세요. 해당 사항이 없으면 0 또는 ‘없음’을 입력해 주세요.</p>
      <div className="mb-5">
        <TextArea label="교회 전체적인 사역 중점 사항 및 방향" required value={d.texts.direction} onChange={value=>set({texts:{...d.texts,direction:value}})} placeholder="이번주 다녀오면서 전체적으로 케어했던 방향이나 중점 사안을 적어주세요" />
      </div>
      <Section title="스탭" hint="교역자·동행 스탭과 출발 날짜를 입력해 주세요.">
        <Field label="교역자 이름">
          <input value={authorName} readOnly className={`${inputClass} text-muted`} />
        </Field>
        <Field label="동행 스탭 이름" hint="없으면 '없음'을 고르고, 있으면 이름을 적어 주세요.">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set({ companion: companionIsNone ? "" : "없음" })}
              className={`min-h-11 shrink-0 rounded-lg border px-4 text-sm ${companionIsNone ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border"}`}
            >
              없음
            </button>
            <input
              value={companionIsNone ? "" : d.companion}
              disabled={companionIsNone}
              onChange={(e) => set({ companion: e.target.value })}
              maxLength={50}
              placeholder="동행 스탭 이름"
              className={inputClass}
            />
          </div>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="분당 출발 날짜">
            <input type="date" value={d.depart_pangyo} onChange={(e) => set({ depart_pangyo: e.target.value })} className={inputClass} />
          </Field>
          <Field label="부산 출발 날짜">
            <input type="date" value={d.depart_busan} onChange={(e) => set({ depart_busan: e.target.value })} className={inputClass} />
          </Field>
        </div>
      </Section>

      <Section title="헌금 챙김" hint="필수 항목입니다. 챙긴 헌금이 없으면 기타에 ‘없음’을 입력해 주세요.">
        <CheckGroup options={CAMPUS_OFFERINGS} value={d.offerings} onToggle={(o) => set({ offerings: toggle(d.offerings, o) })} />
        <input
          value={d.offerings_other}
          onChange={(e) => set({ offerings_other: e.target.value })}
          maxLength={100}
          placeholder="기타 (직접 입력)"
          className={inputClass}
        />
      </Section>

      <Section title="경비" hint="모두 필수입니다. 지출하지 않은 항목은 0을 입력해 주세요.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <Section title="토요일 예배팀 모임">
        <CheckGroup options={CAMPUS_SATURDAY} value={d.saturday} onToggle={(o) => set({ saturday: toggle(d.saturday, o) })} />
        <input
          value={d.saturday_other}
          onChange={(e) => set({ saturday_other: e.target.value })}
          maxLength={100}
          placeholder="기타 (직접 입력)"
          className={inputClass}
        />
      </Section>



      {[
        ["adults", "장년부", "adults", null],
        ["young_adults", "청년부", "young_adults", null],
        ["school", "교회학교", "youth", "영 · 유아 · 유치 · 초등소식"],
        ["obed_edom", "오벧에돔", null, "진행 내용"],
        ["newcomers", "새가족 현황", "visitors", null],
        ["welcome", "웰컴팀", null, "방문자 관련 보고"],
        ["training", "새가족 교육", null, "진행 내용"],
      ].map(([key,title,textKey,sectionLabel]) => <Section key={key!} title={title!}>
        {sectionLabel ? <TextArea label={sectionLabel} value={d.sections?.[key!]??""} maxLength={2000} onChange={value=>set({sections:{...d.sections,[key!]:value}})} placeholder={key==="welcome"?"방문자 관련 특이사항 적어주세요":undefined}/> : null}
        {textKey ? CAMPUS_TEXTS.filter(([k])=>k===textKey).map(([k,label,placeholder])=><TextArea key={k} label={label} required value={d.texts[k]} onChange={value=>set({texts:{...d.texts,[k]:value}})} placeholder={placeholder}/>) : null}
        {!sectionLabel && d.sections?.[key!]?.trim() ? <TextArea label="이전에 작성한 추가 기록" value={d.sections[key!]} maxLength={2000} onChange={value=>set({sections:{...d.sections,[key!]:value}})}/> : null}
      </Section>)}
      {d.sections?.worship?.trim()?<Section title="이전에 작성한 예배 기록"><TextArea label="예배 기록" value={d.sections.worship} maxLength={2000} onChange={value=>set({sections:{...d.sections,worship:value}})}/></Section>:null}
      {CAMPUS_TEXTS.filter(([key])=>["facilities","served","others"].includes(key)).map(([key,label,placeholder])=><div key={key} className="mb-5"><TextArea label={label} required value={d.texts[key]} onChange={value=>set({texts:{...d.texts,[key]:value}})} placeholder={placeholder}/></div>)}
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
          className={`min-h-10 rounded-lg border px-3 py-2 text-sm ${value.includes(o) ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
