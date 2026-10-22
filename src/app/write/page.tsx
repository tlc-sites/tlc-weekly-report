import { Suspense } from "react";
import Link from "@/components/pending-link";
import { requireActive, canManage, isSenior } from "@/lib/auth";
import { groupCategory, listGroupsOrdered } from "@/lib/groups";
import { reportWeek, formatWeek, todayKST } from "@/lib/week";
import { GroupPicker } from "@/components/group-picker";
import { BackLink, Card, Loading, PageTitle, smallButtonClass } from "@/components/ui";

export default function WritePage(props: PageProps<"/write">) {
  return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;
}
async function Content({ searchParams }: PageProps<"/write">) {
  const { supabase, profile } = await requireActive();
  const week = reportWeek((await searchParams).week, todayKST());
  const [groups, {data: memberships}] = await Promise.all([listGroupsOrdered(supabase),supabase.from("memberships").select("group_id").eq("user_id",profile.id)]);
  const mine = new Set((memberships ?? []).map(m => m.group_id as string));
  const writable = groups.filter(g => g.childCount===0 && (canManage(profile) || isSenior(profile) || mine.has(g.id) || Boolean(g.parent_id && mine.has(g.parent_id))));
  writable.sort((a,b) => Number(mine.has(b.id) || Boolean(b.parent_id && mine.has(b.parent_id))) - Number(mine.has(a.id) || Boolean(a.parent_id && mine.has(a.parent_id))));
  return <><BackLink href={`/?week=${week}`}>홈</BackLink><PageTitle sub={formatWeek(week)}>보고 작성</PageTitle>
    <p className="mb-4 text-sm text-muted">파트와 예배·모임을 선택한 뒤 새 보고를 추가해 주세요. 기존 보고가 있어도 내 이름으로 따로 작성할 수 있습니다.</p>
    <Card className="mb-4"><GroupPicker groups={writable} defaultCategory={writable[0] ? groupCategory(writable[0]) : undefined} suffix={`?week=${week}`}/>{!writable.length ? <p className="mt-3 text-sm text-muted">작성할 수 있는 파트가 없습니다. 담당 배정을 요청해 주세요.</p> : null}</Card>
    {profile.is_admin ? <p className="mb-4 text-xs text-muted">관리자도 일반 작성자와 같은 폼을 사용합니다. 내 보고 작성 권한과 타인 내용·출결 명단·확인 권한은 별개입니다.</p> : null}
    <Link href={`/reports?week=${week}&author=${profile.id}`} className={smallButtonClass}>내 보고 이어서 보기 →</Link>
  </>;
}
