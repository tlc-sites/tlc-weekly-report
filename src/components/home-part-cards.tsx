import Link from "@/components/pending-link";
import { groupDisplayName } from "@/lib/group-display";
import { partCardState, type CardReport, type CardPart } from "@/lib/home-parts";
import { StatusChip } from "./ui";
export type { CardReport };

// 홈의 '내 파트': 카드 하나에 파트마다 한 줄(이름 · 상태 · 할 일). 셀 케어와 같은 목록 모양.
export function HomePartCards({ parts, reports, noMeeting, userId, week }: { parts: CardPart[]; reports: CardReport[]; noMeeting: string[]; userId: string; week: string }) {
  return (
    <ul className="ui-card rounded-2xl border border-border bg-surface px-4">
      {parts.map((g) => {
        const s = partCardState(g, reports, noMeeting, userId, week);
        return (
          <li key={g.id} className="home-part-row py-2">
            <Link href={s.href} className="flex min-h-12 items-center justify-between gap-3">
              <span className="min-w-0 font-semibold break-words">{groupDisplayName(g.name)}</span>
              <span className="flex shrink-0 items-center gap-2">
                {"late" in s && s.late ? <span className="st text-danger">미제출</span> : <StatusChip tone={s.tone}>{s.label}</StatusChip>}
                <span className={`text-[15px] font-semibold ${s.primary ? "text-accent" : "text-muted"}`}>{s.action}</span>
                <span aria-hidden className="text-muted">›</span>
              </span>
            </Link>
            {s.action === "쓰기" || g.type === "education" ? (
              <span className="-mt-1 flex flex-wrap gap-x-4">
                {s.action === "쓰기" ? <Link href={`/groups/${g.id}?week=${week}#no-meeting`} className="inline-flex min-h-11 items-center gap-1 text-[15px] text-muted hover:text-accent">모임 없음 표시 <span aria-hidden>›</span></Link> : null}
                {g.type === "education" ? <Link href={`/groups/${g.id}/members`} className="inline-flex min-h-11 items-center gap-1 text-[15px] text-muted hover:text-accent">출결·명단 <span aria-hidden>›</span></Link> : null}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
