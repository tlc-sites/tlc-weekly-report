import { Suspense } from "react";
import Link from "@/components/pending-link";
import { requireActive, canManage, isSenior } from "@/lib/auth";
import { NAV_CATEGORY_LABEL, groupCategory, listGroupsOrdered } from "@/lib/groups";
import { groupDisplayName, meetingDisplayName } from "@/lib/group-display";
import { reportWeek, formatWeek, formatDate, todayKST } from "@/lib/week";
import { BackLink, Card, Loading, PageTitle, smallButtonClass } from "@/components/ui";
import {HELP} from "@/lib/help-text";
import { PastWeekNotice, WeekNav } from "@/components/week-nav";

export default function WritePage(props: PageProps<"/write">) {
  return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;
}

type Draft = { id: string; group_id: string; meeting_date: string; meeting_label: string | null; service: { name: string } | null; meeting: { name: string } | null };

// 보고 작성 첫 화면: 분류를 따로 고르지 않고 내 파트를 바로 보여 주고, 쓰다 만 보고는 맨 위에서 이어 쓴다.
async function Content({ searchParams }: PageProps<"/write">) {
  const { supabase, profile } = await requireActive();
  const week = reportWeek((await searchParams).week, todayKST());
  const [groups, {data: memberships}, {data: weekReports}, {data: drafts}] = await Promise.all([
    listGroupsOrdered(supabase),
    supabase.from("memberships").select("group_id").eq("user_id",profile.id),
    supabase.from("reports").select("group_id,status,author_id").eq("week",week),
    supabase.from("reports").select("id,group_id,meeting_date,meeting_label,service:service_types(name),meeting:group_meeting_types(name)").eq("author_id",profile.id).eq("status","draft").order("updated_at",{ascending:false}).limit(6).returns<Draft[]>(),
  ]);
  const mine = new Set((memberships ?? []).map(m => m.group_id as string));
  const isMine = (g: { id: string; parent_id: string | null }) => mine.has(g.id) || Boolean(g.parent_id && mine.has(g.parent_id));
  const writable = groups.filter(g => g.childCount===0 && (canManage(profile) || isSenior(profile) || isMine(g)));
  // 관리자는 모든 파트를 쓸 수 있어 목록이 길다. 내 파트를 먼저 보여 주고 나머지는 접어 둔다.
  const own = writable.filter(isMine), others = writable.filter(g => !isMine(g));
  const count = (gid: string) => { const rs = (weekReports ?? []).filter(r => r.group_id === gid); return { total: rs.filter(r => r.status !== "draft").length, mineDraft: rs.some(r => r.status === "draft" && r.author_id === profile.id), mineDone: rs.some(r => r.status !== "draft" && r.author_id === profile.id) }; };
  const nameOf = (gid: string) => { const g = groups.find(x => x.id === gid); return g ? groupDisplayName(g.name) : "파트"; };
  const tiles = (list: typeof writable) => Object.entries(NAV_CATEGORY_LABEL).map(([key, label]) => {
    const parts = list.filter(g => groupCategory(g) === key);
    return parts.length ? <section key={key} className="mb-4">
      <h3 className="mb-2 text-sm font-semibold text-muted">{label}</h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{parts.map(g => { const c = count(g.id); return <li key={g.id}>
        <Link href={`/groups/${g.id}?week=${week}#new-report`} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-accent">
          <span className="min-w-0"><span className="block font-semibold">{groupDisplayName(g.name)}</span><span className="block text-xs text-muted">{c.mineDone ? "내 보고 제출함 · " : c.mineDraft ? "내 임시저장 있음 · " : ""}이번 주 제출 {c.total}건</span></span>
          <span className="shrink-0 text-sm font-semibold text-accent">쓰기 ›</span>
        </Link></li>; })}</ul>
    </section> : null;
  });
  return <><BackLink href={`/?week=${week}`}>홈</BackLink><PageTitle info={HELP.write} sub={formatWeek(week)}>보고 쓰기</PageTitle>
    <WeekNav week={week} href="/write"/>
    {week < reportWeek(undefined, todayKST()) ? <PastWeekNotice week={week} href="/write"/> : null}
    <ol className="mb-4 grid grid-cols-3 gap-2 text-center text-xs" aria-label="작성 순서">
      {["파트 고르기", "예배·모임 고르기", "내용 쓰고 제출"].map((s, i) => <li key={s} className={`rounded-xl border px-2 py-2 ${i === 0 ? "border-accent bg-accent/10 font-semibold text-accent" : "border-border text-muted"}`}><span className="block text-[15px]">{i + 1}단계</span>{s}</li>)}
    </ol>
    {drafts?.length ? <Card className="mb-4">
      <h2 className="mb-2 font-semibold">쓰다 만 보고</h2>
      <ul className="divide-y divide-border">{drafts.map(d => <li key={d.id}><Link href={`/reports/${d.id}`} className="flex min-h-12 items-center justify-between gap-2 py-2"><span className="min-w-0"><span className="font-medium">{meetingDisplayName(d.service?.name ?? d.meeting?.name ?? d.meeting_label ?? "보고")}</span><span className="ml-2 text-xs text-muted">{nameOf(d.group_id)} · {formatDate(d.meeting_date)}</span></span><span className="shrink-0 text-sm font-semibold text-accent">이어서 쓰기 ›</span></Link></li>)}</ul>
    </Card> : null}
    <h2 className="mb-3 font-semibold">어느 파트 보고를 쓰시나요?</h2>
    {own.length ? tiles(own) : null}
    {others.length ? (own.length ? <details className="mb-4"><summary className="mb-3 cursor-pointer text-sm font-semibold text-accent">다른 파트 보기 ({others.length})</summary>{tiles(others)}</details> : tiles(others)) : null}
    {!writable.length ? <Card className="mb-4"><p className="text-sm text-muted">작성할 수 있는 파트가 없습니다. 담당 배정을 요청해 주세요.</p></Card> : null}
    {profile.is_admin ? <p className="mb-4 text-xs text-muted">관리자도 일반 작성자와 같은 폼을 사용합니다. 내 보고 작성 권한과 타인 내용·출결 명단·확인 권한은 별개입니다.</p> : null}
    <Link href={`/reports?week=${week}&author=${profile.id}`} className={smallButtonClass}>내 보고 모두 보기 →</Link>
  </>;
}
