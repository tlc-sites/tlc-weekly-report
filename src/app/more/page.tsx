import { Suspense } from "react";
import Link from "@/components/pending-link";
import { Card, listRowClass, Loading, PageTitle } from "@/components/ui";
import { SignOutButton } from "@/components/signout-button";
import { requireActive, canManage, isClergy, isSenior } from "@/lib/auth";
import { canSeePdChecklist } from "@/lib/pd-access";
import { ROLE_LABEL, listGroupsOrdered } from "@/lib/groups";
import { groupDisplayName } from "@/lib/group-display";

export default function MorePage() {
  return (
    <Suspense fallback={<Loading />}>
      <MoreContent />
    </Suspense>
  );
}

type Row = { href: string; label: string; hint?: string; external?: boolean };

// 더보기: 홈에서 뺀 메뉴를 모두 모은다. 보이는 항목은 홈·PC 왼쪽 메뉴와 같은 권한 기준.
async function MoreContent() {
  const { supabase, profile } = await requireActive();
  const clergy = isClergy(profile), manage = canManage(profile);
  const [pd, groups, { data: memberships }, pendingCount] = await Promise.all([
    canSeePdChecklist(supabase, profile),
    listGroupsOrdered(supabase),
    supabase.from("memberships").select("group_id, role, position").eq("user_id", profile.id),
    manage ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending").then((r) => r.count ?? 0) : Promise.resolve(0),
  ]);
  const roleByGroup = new Map((memberships ?? []).map((m) => [m.group_id as string, m.role as keyof typeof ROLE_LABEL]));
  const positionByGroup = new Map((memberships ?? []).map((m) => [m.group_id as string, m.position as string | null]));
  const myGroups = groups.filter((g) => roleByGroup.has(g.id));
  const rosterGroups = groups.filter((g) => g.type === "education" && g.childCount === 0 && (isSenior(profile) || roleByGroup.has(g.id) || (g.parent_id !== null && roleByGroup.has(g.parent_id))));
  const agenda = isSenior(profile) || (memberships ?? []).some((m) => m.role === "reviewer" || (profile.is_minister && ["교역자", "담당교역자"].includes(String(m.position))));

  const sections: { title: string; rows: Row[] }[] = [
    { title: "보고", rows: [
      { href: "/write", label: "보고 쓰기" },
      { href: "/reports", label: "보고 목록" },
      { href: "/notices", label: "공지·소통" },
      ...(agenda ? [{ href: "/agenda", label: "부서 안건" }] : []),
      { href: "/incidents", label: "확인·조치 목록" },
      { href: "/notifications", label: "알림" },
    ] },
    { title: "예배 도구", rows: [
      { href: "/worship-staff", label: "예배위원" },
      ...(pd ? [{ href: "/pd-checklist", label: "예배 PD 체크리스트" }] : []),
      { href: "/cue-sheet", label: "주일예배 큐시트" },
      ...(clergy ? [{ href: "/meeting", label: "교역자 회의 자료" }] : []),
    ] },
    ...(clergy || manage ? [{ title: "목회", rows: [
      ...(clergy ? [{ href: "/weekly-summary", label: "주간 요약", hint: "예배별 · 부서별 전체 보기" }, { href: "/prayer-meetings", label: "주중 기도회 보고" }, { href: "/notices?tab=restricted", label: "비공개 메시지" }, { href: "/missing", label: "미제출 보고" }] : []),
      { href: "/sunday-notice", label: "이번 주 공지", hint: "쓰면 모두의 첫 화면에 팝업으로 보입니다" },
    ] }] : []),
    ...(clergy || manage ? [{ title: "관리", rows: [
      { href: "/manage", label: "관리" },
      ...(clergy ? [{ href: "/team-management", label: "팀 명단", hint: "팀원 추가·수정" }] : []),
      ...(manage ? [
        { href: "/admin/submissions", label: "전체 제출현황" },
        { href: "/admin/users", label: "가입 승인·담당 지정", hint: pendingCount ? `승인 대기 ${pendingCount}명` : undefined },
        { href: "/admin/groups", label: "그룹 관리" },
        { href: "/admin/services", label: "예배 목록" },
      ] : []),
    ] }] : []),
    ...(rosterGroups.length ? [{ title: "교회학교 출결·명단", rows: rosterGroups.map((g) => ({ href: `/groups/${g.id}/members`, label: groupDisplayName(g.name) })) }] : []),
    { title: "설정·도움말", rows: [
      { href: "/settings", label: "알림 설정" },
      { href: "/guide.html", label: "사용 안내", external: true },
      ...(clergy || manage ? [{ href: "/staff-guide.html", label: "교역자·관리자 사용 안내", external: true }] : []),
    ] },
  ];

  const row = (r: Row) => {
    const body = <><span className="min-w-0"><span className="block">{r.label}</span>{r.hint ? <span className="block text-[15px] text-muted">{r.hint}</span> : null}</span><span aria-hidden className="text-accent">›</span></>;
    return <li key={r.href}>{r.external ? <a href={r.href} className={listRowClass}>{body}</a> : <Link href={r.href} className={listRowClass}>{body}</Link>}</li>;
  };

  return (
    <>
      <PageTitle>더보기</PageTitle>
      {sections.map((s) => (
        <section key={s.title} className="mb-6" aria-label={s.title}>
          <h2 className="mb-2 text-xl font-semibold">{s.title}</h2>
          <Card><ul className="divide-y divide-border">{s.rows.map(row)}</ul></Card>
        </section>
      ))}
      <section className="mb-6" aria-label="내 소속">
        <h2 className="mb-2 text-xl font-semibold">내 소속</h2>
        <Card>
          {myGroups.length ? (
            <ul className="divide-y divide-border">
              {myGroups.map((g) => (
                <li key={g.id} className="flex min-h-12 items-center justify-between gap-3 py-2">
                  <span>{g.label}</span>
                  <span className="text-[15px] text-muted">{positionByGroup.get(g.id) ?? ROLE_LABEL[roleByGroup.get(g.id)!]}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[15px] text-muted">아직 배정된 소속이 없습니다. 관리자에게 문의해 주세요.</p>}
        </Card>
      </section>
      <SignOutButton />
    </>
  );
}
