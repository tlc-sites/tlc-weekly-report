"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "./ui";

export function SubmissionReceipt() {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);
  function dismiss() {
    const url = new URL(window.location.href);
    url.searchParams.delete("saved");
    router.replace(url.pathname + url.search, { scroll: false });
  }
  return <dialog ref={dialog} onClose={dismiss} aria-labelledby="submission-receipt-title" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-surface p-6 text-center text-foreground shadow-xl backdrop:bg-foreground/40">
    <span aria-hidden className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent/10 text-2xl text-accent">✓</span>
    <h2 id="submission-receipt-title" className="text-xl font-semibold">제출이 완료되었습니다!</h2>
    <p className="mb-5 mt-2 text-sm text-muted">보고서가 정상적으로 저장되었습니다.<br/>확인 처리 전까지 수정할 수 있습니다.</p>
    <button autoFocus type="button" onClick={() => dialog.current?.close()} className={`${buttonClass} w-full`}>확인</button>
  </dialog>;
}
