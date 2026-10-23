import {groupDisplayName} from "@/lib/group-display";
import {meetingDisplayName} from "@/lib/group-display";
import { Suspense } from "react";
import Link from "@/components/pending-link";
import { requireAdmin } from "@/lib/auth";
import { loadAdminSubmissions } from "@/lib/admin-submissions";
import { addDays, formatWeek, reportWeek, todayKST } from "@/lib/week";
import { BackLink, Card, Field, Loading, PageTitle, selectClass, smallButtonClass } from "@/components/ui";
import { ReportStatusBadge } from "@/components/report-status";
import { AdminNav } from "@/components/admin-nav";

export default function Page(props: PageProps<"/admin/submissions">) {
  return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;
}

async function Content({ searchParams }: PageProps<"/admin/submissions">) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const week = reportWeek(params.week, todayKST());
  const status = ["draft","submitted","reviewed","sent"].includes(String(params.status)) ? String(params.status) : "all";
  const data = await loadAdminSubmissions(supabase, week);
  const group = typeof params.group === "string" && data.groups.some(g => g.id === params.group) ? params.group : "";
  const names = new Map(data.groups.map(g => [g.id, groupDisplayName(g.name)]));
  const rows = data.reports.filter(r => (!group || r.group_id === group) && (status === "all" || (status === "sent" ? r.status !== "draft" : r.status === status)));
  const href = (value: string) => `/admin/submissions?${new URLSearchParams({week:value,status,group})}`;
  return <>
    <BackLink href={`/?week=${week}`}>홈 · 제출현황</BackLink>
    <PageTitle sub={formatWeek(week)}>전체 제출현황</PageTitle>
    <AdminNav current="/admin/submissions"/>
    <p className="mb-4 text-sm text-muted">관리자에게는 파트·작성자·예배·제출 상태만 표시됩니다. 본문은 별도 열람 권한이 있을 때만 열 수 있습니다.</p>
    {data.setup_expires_at ? <Card className="mb-4"><p className="text-sm">셋업용 일반 내용 열람 중 · {new Date(data.setup_expires_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} 자동 종료</p><p className="mt-1 text-xs text-muted">읽기만 가능하며 기도제목·비공개 글·보호자 연락처는 포함하지 않습니다.</p></Card> : null}
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="현황 주차 이동"><Link className={smallButtonClass} href={href(addDays(week,-7))}>← 지난 주</Link>{week < reportWeek(undefined,todayKST()) ? <><Link className={smallButtonClass} href={href(addDays(week,7))}>다음 주 →</Link><Link className={smallButtonClass} href={href(reportWeek(undefined,todayKST()))}>이번 주</Link></> : null}</nav>
    <form method="get" className="mb-4 grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
      <input type="hidden" name="week" value={week}/>
      <Field label="파트"><select name="group" defaultValue={group} className={selectClass}><option value="">전체 파트</option>{data.groups.map(g => <option key={g.id} value={g.id}>{groupDisplayName(g.name)}</option>)}</select></Field>
      <Field label="제출 상태"><select name="status" defaultValue={status} className={selectClass}><option value="all">전체 상태</option><option value="draft">작성 중</option><option value="sent">제출 완료 전체</option><option value="submitted">제출 완료 · 확인 대기</option><option value="reviewed">확인 완료</option></select></Field>
      <button className={smallButtonClass}>선택 적용</button>
    </form>
    <Card><p className="mb-2 text-sm text-muted">보고 {rows.length}건</p><ul className="divide-y divide-border">{rows.map(r => {
      const body = <><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{names.get(r.group_id) ?? "이전 파트"} · {r.author_name}</p><ReportStatusBadge status={r.status}/></div><p className="mt-1 text-sm text-muted">{r.meeting_date} · {meetingDisplayName(r.service?.name ?? r.meeting?.name ?? r.meeting_label ?? "모임")}</p>{r.submitted_at ? <p className="mt-1 text-xs text-muted">제출 {new Date(r.submitted_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</p> : null}<p className="mt-1 text-xs text-muted">{r.can_open ? "보고 내용 열기 →" : "현황만 조회 가능"}</p></>;
      return <li key={r.id}>{r.can_open ? <Link href={`/reports/${r.id}`} className="block py-4">{body}</Link> : <div className="py-4">{body}</div>}</li>;
    })}</ul>{!rows.length ? <p>조건에 맞는 보고가 없습니다.</p> : null}</Card>
  </>;
}
