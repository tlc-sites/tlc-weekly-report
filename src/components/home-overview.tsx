import {groupDisplayName} from "@/lib/group-display";
import { NAV_CATEGORY_LABEL, groupCategory } from "@/lib/groups";
import type { Group } from "@/lib/groups";
import Link from "@/components/pending-link";
import { Card, StatusChip } from "./ui";
import type { ReportStatus } from "@/lib/report-forms";
import { reportDeadline } from "@/lib/week";

export type OverviewReport = {
  id: string; group_id: string; author_id: string; author_name: string;
  meeting_date: string; status: ReportStatus;
  service: { name: string } | null; meeting: { name: string } | null;
  meeting_label: string | null;
};

type Part = { id: string; name: string; type: string; schedule: string; settings?: Group["settings"] };

// 파트별 이번 주 제출현황(분류별 목록). 홈에서 「전체 제출현황」 화면으로 옮겼다.
export function PartStatusList({ week, reports, parts, noMeeting, linkFor }: {
  week: string; reports: OverviewReport[]; parts: Part[]; noMeeting: string[]; linkFor: (groupId: string) => string;
}) {
  const overdue = new Date() > reportDeadline(week);
  if (!parts.length) return null;
  return <Card className="mb-4">
      <h2 className="mb-1 font-semibold">파트별 제출현황</h2>
      <p className="mb-2 text-sm text-muted">파트를 누르면 그 파트의 보고만 볼 수 있습니다.</p>
      {Object.entries(NAV_CATEGORY_LABEL).map(([cat, catLabel]) => {
        const list = parts.filter(g => groupCategory({ type: g.type as Group["type"], settings: g.settings ?? {}, name: g.name }) === cat);
        if (!list.length) return null;
        const rows = list.map(g => {
          const mine = reports.filter(r => r.group_id === g.id);
          const submitted = mine.filter(r => r.status !== "draft").length;
          const drafting = mine.length - submitted;
          const no = noMeeting.includes(g.id);
          return { g, mine, submitted, drafting, no, state: submitted ? "done" : drafting ? "draft" : no ? "none" : "todo" };
        });
        const done = rows.filter(r => r.state === "done" || r.state === "none").length;
        const inProgress = rows.filter(r => r.state === "draft").length;
        return <section key={cat} className="home-part-cat" aria-label={`${catLabel} 제출현황`}>
          <div className="home-part-cat-head">
            <h3>{catLabel}</h3>
            <span className="home-part-cat-sum">완료 <b>{done}</b>/{rows.length}{inProgress ? <> · 작성 중 {inProgress}</> : null}</span>
            <span className="home-part-bar" aria-hidden="true"><i className="is-done" style={{ width: `${done / rows.length * 100}%` }}/><i className="is-draft" style={{ width: `${inProgress / rows.length * 100}%` }}/></span>
          </div>
          <ul className="home-parts divide-y divide-border">{rows.map(({ g, mine, submitted, drafting, no, state }) => {
            const required = g.type !== "worship" && g.schedule === "weekly";
            return <li key={g.id} className={"home-part is-" + state}><Link href={linkFor(g.id)} className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-3">
              <span className="flex min-w-0 items-center gap-2 font-medium"><span className="home-part-dot" aria-hidden="true"/>{groupDisplayName(g.name)}</span><span className="flex flex-wrap items-center gap-2">
                {submitted ? <StatusChip tone={mine.some(r => r.status === "submitted") ? "wait" : "done"}>제출 {submitted}건</StatusChip> : null}
                {drafting ? <StatusChip tone="draft">작성 중 {drafting}건</StatusChip> : null}
                {no ? <span className="text-muted">모임 없음</span> : !mine.length ? required && overdue ? <span className="font-semibold text-danger">미제출</span> : <StatusChip tone="todo">작성 전</StatusChip> : null}
                <span aria-hidden className="text-accent">›</span>
              </span>
            </Link></li>;
          })}</ul>
        </section>;
      })}
      <p className="mt-2 text-sm text-muted">예배·기술팀은 보고가 없어도 미제출로 집계하지 않습니다.</p>
    </Card>;
}
