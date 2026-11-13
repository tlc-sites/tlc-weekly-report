import Link from "@/components/pending-link";
import { groupDisplayName } from "@/lib/group-display";
import { partCardState, type CardReport, type CardPart } from "@/lib/home-parts";
import { StatusChip } from "./ui";
export type { CardReport };

export function HomePartCards({ parts, reports, noMeeting, userId, week }: { parts: CardPart[]; reports: CardReport[]; noMeeting: string[]; userId: string; week: string }) {
  return (
    <ul className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
      {parts.map((g) => {
        const s = partCardState(g, reports, noMeeting, userId, week);
        return (
          <li key={g.id} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
            <p className="font-semibold break-words">{groupDisplayName(g.name)}</p>
            <span>{"late" in s && s.late ? <span className="st bg-danger/10 text-danger">미제출</span> : <StatusChip tone={s.tone}>{s.label}</StatusChip>}</span>
            <Link href={s.href} className={`mt-auto inline-flex min-h-11 items-center gap-1 font-semibold ${s.primary ? "text-accent" : "text-muted hover:text-accent"}`}>
              {s.action} <span aria-hidden>›</span>
            </Link>
            {g.type === "education" ? (
              <Link href={`/groups/${g.id}/members`} className="inline-flex min-h-11 items-center gap-1 text-[15px] text-muted hover:text-accent">
                출결·명단 <span aria-hidden>›</span>
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
