"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { buttonClass } from "./ui";

export function SubmitButton({ children, pendingText = "저장 중…", className = buttonClass }: { children: ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-disabled={pending} aria-busy={pending} className={`${className} transition active:translate-y-px active:scale-[0.98] disabled:cursor-wait disabled:opacity-60`}>
    {pending ? <span role="status" className="inline-flex items-center gap-2"><span aria-hidden className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"/>{pendingText}</span> : children}
  </button>;
}
