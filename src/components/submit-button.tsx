"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { buttonClass } from "./ui";

// 한 폼에 버튼이 여럿이면 formAction을 넘긴다. 누른 버튼에만 진행 문구를 보이고 나머지는 잠시 막는다.
export function SubmitButton({ children, pendingText = "저장 중…", className = buttonClass, formAction, formNoValidate }: { children: ReactNode; pendingText?: string; className?: string; formAction?: (form: FormData) => void | Promise<void>; formNoValidate?: boolean }) {
  const { pending, action } = useFormStatus();
  const mine = pending && (!formAction || action === formAction);
  return <button type="submit" formAction={formAction} formNoValidate={formNoValidate} disabled={pending} aria-disabled={pending} aria-busy={mine} className={`${className} transition active:translate-y-px active:scale-[0.98] disabled:cursor-wait disabled:opacity-60`}>
    {mine ? <span role="status" className="inline-flex items-center gap-2"><span aria-hidden className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"/>{pendingText}</span> : children}
  </button>;
}
