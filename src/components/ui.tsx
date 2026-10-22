import type { ReactNode } from "react";
import Link from "next/link";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-4 inline-flex min-h-11 self-start items-center gap-2 rounded-xl border border-accent/40 bg-surface px-4 py-2 text-sm font-semibold text-accent shadow-sm transition hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]">
      ← {children}
    </Link>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "danger" }) {
  const toneClass = {
    muted: "bg-border/60 text-muted",
    accent: "bg-accent/15 text-accent",
    danger: "bg-danger/10 text-danger",
  }[tone];
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[15px] font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

// URL의 error 코드를 화면 문구로 바꾼다
export function pickMessage(messages: Record<string, string>, code: string | string[] | undefined) {
  return typeof code === "string" ? messages[code] : undefined;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[14px] border border-border bg-surface p-[18px] ${className}`}>{children}</section>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-[26px]">{children}</h1>
      {sub ? <p className="mt-2 text-[15px] leading-relaxed text-muted">{sub}</p> : null}
    </header>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{children}</p>;
}

export function Loading() {
  return <p className="py-10 text-center text-sm text-muted">불러오는 중…</p>;
}

export const buttonClass =
  "inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl border border-accent bg-accent px-[18px] py-3 text-[17px] font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition active:translate-y-px active:scale-[0.98]";
export const secondaryButtonClass =
  "inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl border border-accent/50 bg-surface px-[18px] py-3 text-[17px] font-medium text-accent hover:bg-accent/5 disabled:opacity-50 transition active:translate-y-px active:scale-[0.98]";
export const smallButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface px-3.5 py-2 text-[15px] font-medium hover:bg-accent/5 disabled:opacity-50 transition active:translate-y-px active:scale-[0.98]";
export const inputClass =
  "h-12 min-w-0 max-w-full w-full rounded-xl border border-border bg-surface px-3 text-base transition focus:border-accent";
export const selectClass =
  "h-12 w-full rounded-xl border border-border bg-surface px-3 text-base transition focus:border-accent";
export const textareaClass =
  "min-h-28 w-full rounded-xl border border-border bg-surface px-3 py-3 text-base transition focus:border-accent";
