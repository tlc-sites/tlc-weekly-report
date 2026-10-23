"use client";

import { useState } from "react";
import { Field, inputClass, selectClass } from "@/components/ui";

type Option = { value: string; label: string; date: string; fixedDate?: boolean };

// 예배를 고르면 그 요일에 맞춰 날짜가 자동으로 바뀐다 (직접 고친 날짜는 다음에 예배를 바꿀 때까지 유지)
export function NewReportFields({ options, fallbackDate, maxDate, minDate }: { options: Option[]; fallbackDate: string; maxDate: string; minDate: string }) {
  const [meeting, setMeeting] = useState(options[0]?.value ?? "custom");
  const [date, setDate] = useState(options[0]?.date ?? fallbackDate);

  return (
    <>
      <Field label="예배·모임">
        <select
          name="meeting"
          value={meeting}
          onChange={(e) => {
            setMeeting(e.target.value);
            setDate(options.find((o) => o.value === e.target.value)?.date ?? fallbackDate);
          }}
          className={selectClass}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="custom">기타 보고·행사 (직접 입력)</option>
        </select>
      </Field>
      {meeting === "custom" ? (
        <Field label="보고·행사 이름">
          <input name="customLabel" required maxLength={50} placeholder="예: 장비 점검, 팀 준비, 특별예배" className={inputClass} />
        </Field>
      ) : null}
      {options.find(o => o.value === meeting)?.fixedDate ? <p className="text-sm text-muted">예배일 {date} · 선택한 주차에 자동으로 맞춰집니다.<input type="hidden" name="meetingDate" value={date} /></p> : <Field label="날짜">
        <input name="meetingDate" type="date" min={minDate} max={maxDate} required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </Field>}
    </>
  );
}
