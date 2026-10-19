import { GroupPicker } from "@/components/group-picker";
import { Suspense } from "react";
import Link from "next/link";
import { Card, Loading, PageTitle } from "@/components/ui";
import { PushBanner } from "@/components/push-banner";
import { SignOutButton } from "@/components/signout-button";
import { requireActive } from "@/lib/auth";
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
    profile.is_admin
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
  // 보고할 수 있는 그룹: 하위 그룹이 없는 그룹 중 직접 소속이거나 상위 그룹 소속이면 포함 (관리자는 전체)
  const reportGroups = groups.filter(
    (g) =>
      g.childCount === 0 &&
      (profile.is_admin || roleByGroup.has(g.id) || (g.parent_id !== null && roleByGroup.has(g.parent_id))),
  );
  const rosterGroups = reportGroups.filter((g) => g.type === "education");

  return (
    <>
      <PageTitle>{profile.real_name}님, 안녕하세요</PageTitle>
      <PushBanner />
      <Card className="mb-4"><Link href="/notices" className="flex min-h-10 items-center justify-between font-medium"><span>공지·소통</span><span aria-hidden>›</span></Link><ul className="divide-y divide-border">{(notices.data ?? []).map(n => <li key={n.id}><Link href={`/notices/${n.id}`} className="block py-2 text-sm text-muted">{n.title}</Link></li>)}</ul></Card>

      {profile.is_admin ? (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-medium text-muted">관리</h2>
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

      {profile.is_admin || [...roleByGroup.values()].includes("reviewer") ? (
        <Card className="mb-4">
          <Link href="/meeting" className="flex items-center justify-between font-medium">
            <span>교역자 회의 자료</span>
            <span className="text-muted">›</span>
          </Link>
        </Card>
      ) : null}

      {reportGroups.length ? (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-medium text-muted">보고 작성</h2>
          <GroupPicker groups={reportGroups} />
        </Card>
      ) : null}

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-medium text-muted">내 소속</h2>
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
          <h2 className="mb-2 text-sm font-medium text-muted">교육부서 출결·명단</h2>
          <ul className="flex flex-wrap gap-2">
            {rosterGroups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}/members`}
                  className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm"
                >
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-auto flex items-center justify-between pt-8">
        <Link href="/settings" className="text-sm text-muted underline underline-offset-4">
          알림 설정
        </Link>
        <SignOutButton />
      </div>
    </>
  );
}
