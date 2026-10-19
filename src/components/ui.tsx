import type { ReactNode } from "react";
import Link from "next/link";

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-3 self-start text-sm text-muted">
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
  return <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-xs ${toneClass}`}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
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
  return <section className={`rounded-xl border border-border bg-surface p-4 ${className}`}>{children}</section>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-xl font-semibold">{children}</h1>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
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
  "inline-flex h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50 transition active:translate-y-px active:scale-[0.98]";
export const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50 transition active:translate-y-px active:scale-[0.98]";
export const smallButtonClass =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-50 transition active:translate-y-px active:scale-[0.98]";
export const inputClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent";
export const selectClass =
  "h-11 w-full rounded-lg border border-border bg-surface px-2 text-base outline-none focus:border-accent";
export const textareaClass =
  "min-h-28 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent";
