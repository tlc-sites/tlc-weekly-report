import type { ReactNode } from "react";

const paths = {
  notice: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/><path d="M8 10h8M8 14h5"/></>,
  report: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M8 10h3M8 15h3"/><path d="m14 11 6-6-2-2-6 6-1 4 3-2Z"/></>,
  people: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5.2"/></>,
  meeting: <><rect x="7" y="3" width="14" height="16" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12M11 7h6M11 11h6M11 15h3"/></>,
  manage: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
};

export type MenuIconName = keyof typeof paths;

export function MenuIcon({ name, small = false }: { name: MenuIconName; small?: boolean }) {
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-accent/8 text-accent ${small ? "size-9" : "size-11"}`}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={small ? "size-4" : "size-5"}>{paths[name]}</svg>
  </span>;
}

export function MenuHeading({ icon, children, description }: { icon: MenuIconName; children: ReactNode; description?: string }) {
  return <div className="mb-4 flex items-center gap-3">
    <MenuIcon name={icon} />
    <div className="min-w-0">
      <h2 className="font-semibold text-foreground">{children}</h2>
      {description ? <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p> : null}
    </div>
  </div>;
}
