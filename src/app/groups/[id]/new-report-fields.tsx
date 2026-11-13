"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/week";
import { ChoiceChips } from "./choice-chips";

type Option = { value: string; label: string; date: string; fixedDate?: boolean };

// 예배를 고르면 그 요일에 맞춰 날짜가 자동으로 바뀐다 (직접 고친 날짜는 다음에 예배를 바꿀 때까지 유지)
// initial: 지난번에 이 파트에서 고른 예배·모임(이번 주에 있으면 먼저 골라 둔다)
export function NewReportFields({ options, fallbackDate, maxDate, minDate, initial }: { options: Option[]; fallbackDate: string; maxDate: string; minDate: string; initial?: string }) {
  const first = options.find((o) => o.value === initial) ?? options[0];
  const [meeting, setMeeting] = useState(first?.value ?? "custom");
  const [date, setDate] = useState(first?.date ?? fallbackDate);

  return (
    <>
      <ChoiceChips
        legend="어느 예배·모임인가요?"
        name="meeting"
        value={meeting}
        onChange={(v) => {
          setMeeting(v);
          setDate(options.find((o) => o.value === v)?.date ?? fallbackDate);
        }}
        options={[
          ...options.map((o) => ({ value: o.value, label: o.label, sub: o.fixedDate ? formatDate(o.date) : undefined })),
          { value: "custom", label: "기타 보고·행사", sub: "이름 직접 입력" },
        ]}
      />
      {meeting === "custom" ? (
        <Field label="보고·행사 이름">
          <input name="customLabel" required maxLength={50} placeholder="예: 장비 점검, 팀 준비, 특별예배" className={inputClass} />
        </Field>
      ) : null}
      {options.find(o => o.value === meeting)?.fixedDate ? <p className="text-sm text-muted">예배일 {formatDate(date)} · 선택한 주차에 자동으로 맞춰집니다.<input type="hidden" name="meetingDate" value={date} /></p> : <Field label="날짜">
        <input name="meetingDate" type="date" min={minDate} max={maxDate} required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </Field>}
    </>
  );
}
