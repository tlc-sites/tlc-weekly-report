import {FieldHighlight} from "./form-validation";
import {InfoTip} from "./info-tip";
import type { ReactNode } from "react";
import Link from "@/components/pending-link";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="page-back mb-2 inline-flex max-w-full min-h-11 self-start items-center gap-1 rounded-lg text-[15px] font-semibold text-accent underline-offset-4 transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      ← {children}
    </Link>
  );
}

// 보고 상태 표시: 작성 전 회색 · 작성 중 호박색 · 확인 대기 파랑 · 확인 완료 초록. 색만으로 구분하지 않도록 글자도 함께 쓴다.
export type StatusTone = "todo" | "draft" | "wait" | "done";
export function StatusChip({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`st st-${tone}`}>{children}</span>;
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "danger" }) {
  const toneClass = {
    muted: "bg-border/60 text-muted",
    accent: "bg-accent/15 text-accent",
    danger: "bg-danger/10 text-danger",
  }[tone];
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[15px] font-medium ${toneClass}`}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <FieldHighlight label={label}><label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[15px] font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label></FieldHighlight>
  );
}

// URL의 error 코드를 화면 문구로 바꾼다
export function pickMessage(messages: Record<string, string>, code: string | string[] | undefined) {
  return typeof code === "string" ? messages[code] : undefined;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`ui-card rounded-2xl border border-border bg-surface p-4 ${className}`}>{children}</section>;
}

export function PageTitle({ children, sub, info }: { children: ReactNode; sub?: ReactNode; info?: { body: ReactNode; guide?: string } }) {
  const heading = <h1 className="text-[26px]">{children}</h1>;
  return (
    <header className="page-title mb-6">
      {info ? <InfoTip title={heading} guide={info.guide}>{info.body}</InfoTip> : heading}
      {sub ? <p className="mt-2 text-[15px] leading-relaxed text-muted">{sub}</p> : null}
    </header>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{children}</p>;
}

export function Loading() {
  return <div role="status" aria-live="polite" className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-3 text-sm font-medium text-accent"><span aria-hidden className="size-5 shrink-0 rounded-full border-2 border-accent border-r-transparent motion-safe:animate-spin"/>화면을 불러오고 있습니다</div><p className="mt-2 text-xs text-muted">잠시만 기다려 주세요.</p><div aria-hidden className="mt-5 space-y-3 motion-safe:animate-pulse"><div className="h-4 w-2/3 rounded bg-accent/10"/><div className="h-16 rounded-xl bg-accent/5"/><div className="h-16 rounded-xl bg-accent/5"/></div></div>;
}

export const buttonClass =
  "ui-btn inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl border border-accent bg-accent px-[18px] py-3 text-[17px] font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition active:translate-y-px active:scale-[0.98]";
export const secondaryButtonClass =
  "ui-btn inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl border border-accent/50 bg-surface px-[18px] py-3 text-[17px] font-medium text-accent hover:bg-accent/5 disabled:opacity-50 transition active:translate-y-px active:scale-[0.98]";
// 작은 보조 버튼: 보조 버튼과 같은 모양(테두리·버건디 글자)에 크기만 작다
export const smallButtonClass =
  "ui-btn-sm inline-flex min-h-11 min-w-0 max-w-full items-center justify-center whitespace-normal break-words rounded-xl border border-accent/40 bg-surface px-3.5 py-2 text-[15px] font-semibold text-accent hover:bg-accent/5 disabled:opacity-50 transition active:translate-y-px active:scale-[0.98]";
// 목록 행: 줄 전체를 누르고 오른쪽에 › 를 둔다
export const listRowClass =
  "flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left transition hover:text-accent";
export const inputClass =
  "ui-input h-12 min-w-0 max-w-full w-full rounded-xl border border-border bg-surface px-3 text-base transition focus:border-accent";
export const selectClass =
  "ui-input h-12 w-full rounded-xl border border-border bg-surface px-3 text-base transition focus:border-accent";
export const textareaClass =
  "ui-textarea min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-3 text-base transition focus:border-accent";
