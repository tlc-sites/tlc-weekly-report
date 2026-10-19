"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Field, textareaClass, secondaryButtonClass } from "@/components/ui";
import { setNoMeeting } from "./actions";

export function NoMeeting({ groupId, week, noMeeting, reason }: { groupId: string; week: string; noMeeting: boolean; reason: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [state, action] = useActionState(setNoMeeting, { error: "", saved: false });
  return <section className="rounded-xl border border-border bg-white p-4">
    {noMeeting ? <>
      <p role="status" className="mb-2 font-medium text-accent">✓ 이번 주 모임 없음으로 등록했습니다.</p>
      <p className="mb-3 whitespace-pre-wrap text-sm">사유: {reason}</p>
      <form action={action}>
        <input type="hidden" name="groupId" value={groupId} /><input type="hidden" name="week" value={week} /><input type="hidden" name="on" value="false" />
        <SubmitButton className={secondaryButtonClass} pendingText="해제 중…">모임 없음 해제</SubmitButton>
      </form>
    </> : <>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className={`${secondaryButtonClass} w-full transition active:scale-[0.98] ${expanded ? "border-accent bg-accent/10 text-accent" : ""}`}>이번 주 모임 없음 {expanded ? "▴" : "▾"}</button>
      {expanded ? <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="groupId" value={groupId} /><input type="hidden" name="week" value={week} /><input type="hidden" name="on" value="true" />
        <Field label="모임이 없는 사유"><textarea name="reason" required maxLength={100} rows={3} placeholder="예: 연합예배, 방학" className={textareaClass} /></Field>
        <SubmitButton pendingText="등록 중…">사유 저장</SubmitButton>
        <button type="button" onClick={() => setExpanded(false)} className={secondaryButtonClass}>취소</button>
      </form> : null}
    </>}
    {state.error ? <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p> : null}
  </section>;
}
