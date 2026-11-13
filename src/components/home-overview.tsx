import {groupDisplayName} from "@/lib/group-display";
import { NAV_CATEGORY_LABEL, groupCategory } from "@/lib/groups";
import type { Group } from "@/lib/groups";
import Link from "@/components/pending-link";
import { Card, smallButtonClass } from "./ui";
import { ReportStatusBadge } from "./report-status";
import type { ReportStatus } from "@/lib/report-forms";
import { addDays, formatDate, formatWeek, reportDeadline } from "@/lib/week";

export type OverviewReport = {
  id: string; group_id: string; author_id: string; author_name: string;
  meeting_date: string; status: ReportStatus;
  service: { name: string } | null; meeting: { name: string } | null;
  meeting_label: string | null;
};

type Part = { id: string; name: string; type: string; schedule: string; settings?: Group["settings"] };

export function HomeOverview({ week, currentWeek, reports, parts, noMeeting, userId, failed, allParts = false, adminStatus = false, writablePartIds }: {
  week: string; currentWeek: string; reports: OverviewReport[]; parts: Part[];
  noMeeting: string[]; userId: string; failed: boolean; allParts?: boolean; adminStatus?: boolean; writablePartIds?: string[];
}) {
  const sent = reports.filter(r => r.status !== "draft");
  const drafts = reports.filter(r => r.status === "draft");
  const pending = sent.filter(r => r.status === "submitted");
  const myDrafts = drafts.filter(r => r.author_id === userId && (!writablePartIds || writablePartIds.includes(r.group_id)));
  const partNames = new Map(parts.map(g => [g.id, groupDisplayName(g.name)]));
  const overdue = new Date() > reportDeadline(week);
  const listBase = adminStatus ? "/admin/submissions" : "/reports";
  return <section className="mb-5" aria-label="주간 제출현황">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-semibold">{week === currentWeek ? "이번 주" : "선택한 주"} 제출현황</h2><p className="text-sm text-muted">{formatWeek(week)}</p></div>
      <nav aria-label="현황 주차 이동" className="flex flex-wrap gap-2">
        <Link href={`/?week=${addDays(week, -7)}`} className={smallButtonClass}>← 지난 주</Link>
        {week < currentWeek ? <><Link href={`/?week=${addDays(week, 7)}`} className={smallButtonClass}>다음 주 →</Link><Link href="/" className={smallButtonClass}>이번 주</Link></> : null}
      </nav>
    </div>
    <Card>
      {failed ? <p role="alert" className="text-sm text-danger">현황을 불러오지 못했습니다. 새로고침해 주세요.</p> : <>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[{ label: "작성 중", value: drafts.length, status: "draft" }, { label: "확인 대기", value: pending.length, status: "submitted" }, { label: "확인 완료", value: sent.length - pending.length, status: "reviewed" }].map(item =>
            <Link key={item.status} href={`${listBase}?week=${week}&status=${item.status}`} className="rounded-xl bg-background px-1 py-3 transition hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent">
              <span className="block text-2xl font-semibold tabular-nums text-accent">{item.value}<span className="ml-1 text-xs font-normal">건</span></span><span className="text-sm">{item.label}</span>
            </Link>)}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">{adminStatus ? "전체 파트의 보고 기준입니다." : "열람할 수 있는 보고 기준입니다."}</p>
        <Link href={`${listBase}?week=${week}`} className="mt-3 flex min-h-11 items-center justify-between border-t border-border pt-3 text-sm font-semibold text-accent">{adminStatus ? "전체 제출현황" : "보고 목록"} <span aria-hidden>›</span></Link>
      </>}
    </Card>
    {!failed && myDrafts.length ? <Card className="mt-3 border-accent/40">
      <h3 className="font-semibold">이어서 작성할 내 보고 {myDrafts.length}건</h3>
      <ul className="mt-1 divide-y divide-border">{myDrafts.slice(0, 3).map(r => <li key={r.id}><Link href={`/reports/${r.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3"><span><span className="block text-sm font-medium">{partNames.get(r.group_id) ?? "내 파트"} · {r.service?.name ?? r.meeting?.name ?? r.meeting_label ?? "모임"}</span><span className="text-xs text-muted">{formatDate(r.meeting_date)} · 이어서 쓰기</span></span><ReportStatusBadge status={r.status}/></Link></li>)}</ul>
      {myDrafts.length > 3 ? <Link className="text-sm text-accent" href={`/reports?week=${week}&status=draft&author=${userId}`}>내 작성 중 보고 전체 보기 →</Link> : null}
    </Card> : null}
    {!failed && parts.length ? <Card className="mt-3">
      <h3 className="mb-1 font-semibold">{allParts ? "파트별 제출현황" : "내 담당 파트"}</h3>
      <p className="mb-2 text-xs text-muted">{adminStatus ? "파트를 누르면 제출현황을 볼 수 있습니다." : "파트를 누르면 보고를 작성하거나 제출 내역을 볼 수 있습니다."}</p>
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
            <h4>{catLabel}</h4>
            <span className="home-part-cat-sum">완료 <b>{done}</b>/{rows.length}{inProgress ? <> · 작성 중 {inProgress}</> : null}</span>
            <span className="home-part-bar" aria-hidden="true"><i className="is-done" style={{ width: `${done / rows.length * 100}%` }}/><i className="is-draft" style={{ width: `${inProgress / rows.length * 100}%` }}/></span>
          </div>
          <ul className="home-parts divide-y divide-border">{rows.map(({ g, mine, submitted, drafting, no, state }) => {
            const required = g.type !== "worship" && g.schedule === "weekly";
            return <li key={g.id} className={"home-part is-" + state}><Link href={adminStatus ? `/admin/submissions?week=${week}&group=${g.id}` : `/groups/${g.id}?week=${week}`} className="flex min-h-16 flex-wrap items-center justify-between gap-2 py-3">
              <span className="flex min-w-0 items-center gap-2 font-medium"><span className="home-part-dot" aria-hidden="true"/>{groupDisplayName(g.name)}</span><span className="flex flex-wrap items-center gap-2 text-xs">
                {submitted ? <span className="font-semibold text-accent">제출 {submitted}건</span> : null}
                {drafting ? <span className="text-muted">작성 중 {drafting}건</span> : null}
                {no ? <span className="text-muted">모임 없음</span> : !mine.length ? <span className={required && overdue ? "text-danger" : "text-muted"}>{required ? overdue ? "미제출" : "작성 전" : "작성 전"}</span> : null}
                <span aria-hidden className="text-accent">›</span>
              </span>
            </Link></li>;
          })}</ul>
        </section>;
      })}
      <p className="mt-2 text-xs text-muted">예배·기술팀은 보고가 없어도 미제출로 집계하지 않습니다.</p>
    </Card> : null}
  </section>;
}
