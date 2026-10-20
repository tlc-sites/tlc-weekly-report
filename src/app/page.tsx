import { GroupPicker } from "@/components/group-picker";
import { MenuHeading, MenuIcon } from "@/components/menu-heading";
import { Suspense } from "react";
import Link from "next/link";
import { Card, Loading, PageTitle } from "@/components/ui";
import { PushBanner } from "@/components/push-banner";
import { SignOutButton } from "@/components/signout-button";
import { requireActive, canManage, isClergy, isSenior } from "@/lib/auth";
import { ROLE_LABEL, listGroupsOrdered } from "@/lib/groups";

export default function HomePage() {
  return (
    <Suspense fallback={<Loading />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const { supabase, profile } = await requireActive();

  const [{ data: memberships }, groups, pendingCount, notices] = await Promise.all([
    supabase.from("memberships").select("group_id, role").eq("user_id", profile.id),
    listGroupsOrdered(supabase),
    canManage(profile)
      ? supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
    supabase.from("notices").select("id,title").order("created_at", { ascending: false }).limit(3),
  ]);

  const roleByGroup = new Map((memberships ?? []).map((m) => [m.group_id as string, m.role as keyof typeof ROLE_LABEL]));
  const myGroups = groups.filter((g) => roleByGroup.has(g.id));
  const shared = isClergy(profile) && !isSenior(profile)
    ? await supabase.from("reports").select("id,group_id,author_name,meeting_date,group:groups(name,parent_id)").order("updated_at",{ascending:false}).returns<{id:string;group_id:string;author_name:string;meeting_date:string;group:{name:string;parent_id:string|null}|null}[]>()
    : {data:[]};
  const sharedReports=(shared.data ?? []).filter(r=>!roleByGroup.has(r.group_id) && !(r.group?.parent_id && roleByGroup.has(r.group.parent_id)));
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
      <Link href="/reports" className="mb-4 inline-flex min-h-12 items-center justify-between rounded-xl border border-accent/40 bg-surface px-4 py-3 font-semibold text-accent">사람별 보고 모아보기 <span aria-hidden>›</span></Link>
      {sharedReports.length ? <Card className="mb-4"><MenuHeading icon="report" description="다른 파트에서 공개해 주신 보고입니다.">공개받은 보고</MenuHeading><ul className="divide-y divide-border">{sharedReports.map(r=><li key={r.id}><Link href={`/reports/${r.id}`} className="block py-3 text-sm">{r.group?.name} · {r.meeting_date} · {r.author_name}</Link></li>)}</ul></Card>:null}
      <Card className="mb-4"><Link href="/notices" className="menu-link flex items-center justify-between gap-3"><MenuHeading icon="notice" description="우리 부서의 소식과 이야기를 확인해 주세요.">공지·소통</MenuHeading><span aria-hidden className="text-muted">›</span></Link><ul className="divide-y divide-border">{(notices.data ?? []).map(n => <li key={n.id}><Link href={`/notices/${n.id}`} className="block py-3 text-sm text-muted hover:text-accent">{n.title}</Link></li>)}</ul></Card>

      {canManage(profile) ? (
        <Card className="mb-4">
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
        </Card>
      ) : null}

      {isClergy(profile) ? (
        <Card className="mb-4">
          <Link href="/meeting" className="menu-link flex items-center justify-between gap-3">
            <MenuHeading icon="meeting" description="이번 주 사역 보고를 한눈에 살펴보세요.">교역자 회의 자료</MenuHeading>
            <span className="text-muted">›</span>
          </Link>
        </Card>
      ) : null}

      {reportGroups.length ? (
        <Card className="mb-4">
          <MenuHeading icon="report" description="담당 부서를 선택해 한 주의 사역을 기록해 주세요.">{isClergy(profile) ? "사역 보고" : "내 파트 보고"}</MenuHeading>
          <GroupPicker groups={reportGroups} defaultCategory={isClergy(profile) ? myGroups[0]?.type : undefined} />
        </Card>
      ) : null}

      <Card className="mb-4">
        <MenuHeading icon="people" description="함께 섬기는 부서와 나의 역할이에요.">내 소속</MenuHeading>
        {myGroups.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {myGroups.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-3">
                <span>{g.label}</span>
                <span className="text-xs text-muted">{ROLE_LABEL[roleByGroup.get(g.id)!]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">아직 배정된 소속이 없습니다. 관리자에게 문의해 주세요.</p>
        )}
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

      <Link href="/incidents" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-accent"><MenuIcon name="report" small />팀 이슈 모아보기 ›</Link>
      <div className="mt-auto flex items-center justify-between pt-8">
        <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-muted hover:text-accent">
          <MenuIcon name="bell" small />알림 설정
        </Link>
        <SignOutButton />
      </div>
    </>
  );
}
