import { GroupPicker } from "@/components/group-picker";
import { HomeOverview, type OverviewReport } from "@/components/home-overview";
import { MenuHeading, MenuIcon } from "@/components/menu-heading";
import { Suspense } from "react";
import Link from "next/link";
import { Card, Loading, PageTitle } from "@/components/ui";
import { PushBanner } from "@/components/push-banner";
import { SignOutButton } from "@/components/signout-button";
import { requireActive, canManage, isClergy, isSenior } from "@/lib/auth";
import { ROLE_LABEL, groupCategory, listGroupsOrdered } from "@/lib/groups";
import { reportWeek, todayKST } from "@/lib/week";
import { loadAdminSubmissions } from "@/lib/admin-submissions";

export default function HomePage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<Loading />}>
      <HomeContent {...props} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: PageProps<"/">) {
  const { supabase, profile } = await requireActive();
  const week = reportWeek((await searchParams).week, todayKST());
  const adminStatus = canManage(profile) ? await loadAdminSubmissions(supabase, week) : null;

  const [{ data: memberships }, groups, pendingCount, notices, weeklyReports, weekStatuses] = await Promise.all([
    supabase.from("memberships").select("group_id, role, position").eq("user_id", profile.id),
    listGroupsOrdered(supabase),
    canManage(profile)
      ? supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
    supabase.from("notices").select("id,title").order("created_at", { ascending: false }).limit(3),
    supabase.from("reports").select("id,group_id,author_id,author_name,meeting_date,status,meeting_label,service:service_types(name),meeting:group_meeting_types(name)").eq("week", week).order("updated_at", { ascending: false }).returns<OverviewReport[]>(),
    supabase.from("week_status").select("group_id").eq("week", week).eq("no_meeting", true),
  ]);

  const roleByGroup = new Map((memberships ?? []).map((m) => [m.group_id as string, m.role as keyof typeof ROLE_LABEL]));
  const positionByGroup = new Map((memberships ?? []).map(m => [m.group_id as string, m.position as string | null]));
  const myGroups = groups.filter((g) => roleByGroup.has(g.id));
  // 보고할 수 있는 그룹: 하위 그룹이 없는 그룹 중 직접 소속이거나 상위 그룹 소속이면 포함 (관리자는 전체)
  const reportGroups = groups.filter(
    (g) =>
      g.childCount === 0 &&
      (isSenior(profile) || roleByGroup.has(g.id) || (g.parent_id !== null && roleByGroup.has(g.parent_id))),
  );
  reportGroups.sort((a,b) => Number(roleByGroup.has(b.id) || Boolean(b.parent_id && roleByGroup.has(b.parent_id))) - Number(roleByGroup.has(a.id) || Boolean(a.parent_id && roleByGroup.has(a.parent_id))));
  const rosterGroups = reportGroups.filter((g) => g.type === "education");

  return (
    <>
      <PageTitle sub="한 주의 사역과 소식을 함께 나눠요.">{profile.real_name}님, 안녕하세요</PageTitle>
      <PushBanner />
      {isClergy(profile)?<Link href="/weekly-summary" className="mb-4 flex min-h-14 items-center justify-between rounded-xl border border-accent/30 bg-surface px-4 py-3 font-semibold text-accent">주간 요약 <span>예배별 · 부서별 전체 보기 ›</span></Link>:null}
      {isClergy(profile) ? <div className="mb-4 grid grid-cols-2 gap-2"><Link href="/prayer-meetings" className="rounded-xl border border-border bg-surface p-4 font-semibold text-accent">주중 기도회 보고</Link><Link href="/messages" className="rounded-xl border border-border bg-surface p-4 font-semibold text-accent">비공개 메시지</Link></div> : null}
      <nav aria-label="주요 메뉴" className="mb-4 grid grid-cols-2 gap-2">
        <Link href={`/write?week=${week}`} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-semibold text-accent-foreground"><MenuIcon name="report" small/>보고 작성 · 추가</Link>
        {canManage(profile) ? <Link href={`/admin/submissions?week=${week}`} className="flex min-h-14 items-center justify-center rounded-xl border border-accent/40 bg-surface px-4 py-3 font-semibold text-accent">관리 · 제출현황</Link> : <Link href={`/reports?week=${week}`} className="flex min-h-14 items-center justify-center rounded-xl border border-accent/40 bg-surface px-4 py-3 font-semibold text-accent">내 보고 목록</Link>}
      </nav>
      {adminStatus?.setup_expires_at ? <Card className="mb-4"><p className="font-semibold">셋업용 일반 보고 열람 중</p><p className="mt-1 text-sm text-muted">{new Date(adminStatus.setup_expires_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}에 자동 종료됩니다. 기도제목·비공개 글·보호자 연락처는 포함하지 않습니다.</p></Card> : null}
      <HomeOverview week={week} currentWeek={reportWeek(undefined, todayKST())} reports={adminStatus?.reports ?? weeklyReports.data ?? []} parts={adminStatus?.groups ?? reportGroups} noMeeting={adminStatus?.no_meeting ?? (weekStatuses.data ?? []).map(s => s.group_id as string)} userId={profile.id} failed={!adminStatus && Boolean(weeklyReports.error || weekStatuses.error)} allParts={canManage(profile)} adminStatus={Boolean(adminStatus)} writablePartIds={(canManage(profile) ? adminStatus?.groups ?? reportGroups : reportGroups).map(g => g.id)} />
      {!reportGroups.length ? <Card className="mb-4"><p className="font-semibold">아직 담당 파트가 배정되지 않았습니다.</p><p className="mt-1 text-sm text-muted">{canManage(profile) ? "보고 작성 탭에서 파트를 선택해 내 보고를 추가할 수 있습니다. 출결 명단이나 팀 이슈 작성은 담당 파트 권한이 필요합니다." : "담당 관리자에게 배정을 요청해 주세요."}</p></Card> : null}
      {reportGroups.length ? (
        <Card className="mb-4">
          <MenuHeading icon="report" description="새 보고를 작성할 파트를 선택해 주세요.">보고 작성</MenuHeading>
          <GroupPicker groups={reportGroups} suffix={`?week=${week}`} defaultCategory={myGroups[0] ? groupCategory(myGroups[0]) : undefined} />
        </Card>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {isClergy(profile) ? <Link href={`/meeting?week=${week}`} className="flex min-h-16 items-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm font-semibold"><MenuIcon name="meeting" small />교역자 회의 자료</Link> : null}
        <Link href={`/incidents?week=${week}`} className="flex min-h-16 items-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm font-semibold"><MenuIcon name="report" small />예배·팀 이슈</Link>
      </div>
      <Card className="mb-4"><Link href="/notices" className="menu-link flex items-center justify-between gap-3"><MenuHeading icon="notice" description="우리 부서의 소식과 이야기를 확인해 주세요.">공지·소통</MenuHeading><span aria-hidden className="text-muted">›</span></Link><ul className="divide-y divide-border">{(notices.data ?? []).map(n => <li key={n.id}><Link href={`/notices/${n.id}`} className="block py-3 text-sm text-muted hover:text-accent">{n.title}</Link></li>)}</ul></Card>

      {canManage(profile) ? (
        <Card className="mb-4">
          <details>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">관리 메뉴 · 승인 대기 {pendingCount}명</summary>
          <MenuHeading icon="manage" description="담당자와 부서, 예배 정보를 관리해요.">관리</MenuHeading>
          <ul className="flex flex-col divide-y divide-border text-sm">
            <li>
              <Link href="/admin/users" className="flex items-center justify-between py-3 font-medium">
                <span>사용자 관리</span>
                <span className={pendingCount ? "text-accent" : "text-muted"}>승인 대기 {pendingCount}명 ›</span>
              </Link>
            </li>
            <li>
              <Link href="/admin/groups" className="flex items-center justify-between py-3 font-medium">
                <span>그룹 관리</span>
                <span className="text-muted">›</span>
              </Link>
            </li>
            <li>
              <Link href="/admin/services" className="flex items-center justify-between py-3 font-medium">
                <span>예배 목록</span>
                <span className="text-muted">›</span>
              </Link>
            </li>
          </ul>
          </details>
        </Card>
      ) : null}

      <Card className="mb-4">
        <details>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">내 소속 · {myGroups.length}개 파트</summary>
        <MenuHeading icon="people" description="함께 섬기는 부서와 나의 역할이에요.">내 소속</MenuHeading>
        {myGroups.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {myGroups.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-3">
                <span>{g.label}</span>
                <span className="text-xs text-muted">{positionByGroup.get(g.id) ?? ROLE_LABEL[roleByGroup.get(g.id)!]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">아직 배정된 소속이 없습니다. 관리자에게 문의해 주세요.</p>
        )}
        </details>
      </Card>

      {rosterGroups.length ? (
        <Card>
          <MenuHeading icon="people" description="아이들의 출결과 명단을 살펴보세요.">교육부서 출결·명단</MenuHeading>
          <ul className="flex flex-wrap gap-2">
            {rosterGroups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}/members`}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border bg-background/60 px-3 text-sm transition hover:border-accent/40 hover:bg-accent/5 active:scale-[0.98]"
                >
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-auto flex items-center justify-between pt-8">
        <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent">
          <MenuIcon name="bell" small />알림 설정
        </Link>
        <SignOutButton />
      </div>
    </>
  );
}
