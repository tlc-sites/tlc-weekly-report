import type { Profile } from "./auth";
import type { ReportClient } from "./groups";
import { addDays, latestWeekday, reportDeadline, todayKST } from "./week";

// 여러 주의 미제출 보고를 부서별·사람별로 모은다.
// 미제출 기준은 회의 자료·금요일 알림과 같다: 하위 그룹이 없는 활성 주간 그룹 중
// 그 주에 제출된 보고도, 모임 없음 표시도 없는 곳 (예배·기술팀은 세지 않는다).
// 마감(금요일 17시)이 지난 주만 세고, 그 주 마감 뒤에 만든 부서·맡은 사람은 그 주에 넣지 않는다.

export type MrGroup = { id: string; type: string; label: string; parent_id: string | null; schedule: string; is_active: boolean; created_at: string };
export type MrMembership = { user_id: string; group_id: string; role: "writer" | "reviewer"; position: string | null; created_at: string };
export type MrReport = { group_id: string; week: string; status: "draft" | "submitted" | "reviewed" };
export type MrNoMeeting = { group_id: string; week: string };

export type MissingGroup = { group: MrGroup; weeks: string[]; drafts: string[]; writers: { id: string; name: string }[] };
export type MissingPerson = { id: string; name: string; items: { group: MrGroup; week: string }[] };

export const MISSING_RANGES = [4, 8, 12] as const;

/** 마감이 지난 최근 n주(최근 주가 먼저) */
export function closedWeeks(n: number, now = new Date(), today = todayKST()) {
  let week = latestWeekday(today, 0);
  if (reportDeadline(week) > now) week = addDays(week, -7);
  return Array.from({ length: n }, (_, i) => addDays(week, -7 * i));
}

/** 담당 교역자가 맡은 그룹(상위 그룹을 맡으면 하위 그룹까지). DB의 report.assigned_clergy와 같은 기준 */
export function reviewScope(groups: Pick<MrGroup, "id" | "parent_id">[], mine: Pick<MrMembership, "group_id" | "role" | "position">[]) {
  const assigned = new Set(mine.filter((m) => (m.position === null && m.role === "reviewer") || m.position === "교역자" || m.position === "담당교역자").map((m) => m.group_id));
  const parent = new Map(groups.map((g) => [g.id, g.parent_id]));
  const inScope = (id: string) => {
    for (let cur: string | null | undefined = id, n = 0; cur && n < 20; cur = parent.get(cur), n++) if (assigned.has(cur)) return true;
    return false;
  };
  return new Set(groups.filter((g) => inScope(g.id)).map((g) => g.id));
}

export function summarizeMissing(
  groups: MrGroup[],
  reports: MrReport[],
  noMeeting: MrNoMeeting[],
  memberships: MrMembership[],
  names: Map<string, string>,
  weeks: string[],
) {
  const parents = new Set(groups.map((g) => g.parent_id).filter(Boolean));
  const counted = groups.filter((g) => g.type !== "worship" && g.is_active && g.schedule === "weekly" && !parents.has(g.id));
  const sent = new Set(reports.filter((r) => r.status !== "draft").map((r) => `${r.group_id}|${r.week}`));
  const draft = new Set(reports.filter((r) => r.status === "draft").map((r) => `${r.group_id}|${r.week}`));
  const skip = new Set(noMeeting.map((w) => `${w.group_id}|${w.week}`));
  const parent = new Map(groups.map((g) => [g.id, g.parent_id]));
  // 그 그룹의 작성자. 직접 맡은 사람이 없으면 가장 가까운 상위 그룹의 작성자
  const writersOf = (gid: string) => {
    for (let cur: string | null | undefined = gid, n = 0; cur && n < 20; cur = parent.get(cur), n++) {
      const found = memberships.filter((m) => m.group_id === cur && m.role === "writer");
      if (found.length) return found;
    }
    return [];
  };

  const byGroup: MissingGroup[] = [];
  const people = new Map<string, MissingPerson>();
  for (const g of counted) {
    const writers = writersOf(g.id);
    const missed = weeks.filter((w) => new Date(g.created_at) <= reportDeadline(w) && !sent.has(`${g.id}|${w}`) && !skip.has(`${g.id}|${w}`));
    if (!missed.length) continue;
    byGroup.push({
      group: g,
      weeks: missed,
      drafts: missed.filter((w) => draft.has(`${g.id}|${w}`)),
      writers: writers.map((m) => ({ id: m.user_id, name: names.get(m.user_id) ?? "이름 없음" })),
    });
    for (const w of missed) {
      const owners = writers.filter((m) => new Date(m.created_at) <= reportDeadline(w));
      for (const m of owners.length ? owners : [{ user_id: "", created_at: "" }]) {
        const p = people.get(m.user_id) ?? { id: m.user_id, name: m.user_id ? (names.get(m.user_id) ?? "이름 없음") : "작성자 미지정", items: [] };
        p.items.push({ group: g, week: w });
        people.set(m.user_id, p);
      }
    }
  }
  byGroup.sort((a, b) => b.weeks.length - a.weeks.length);
  const byPerson = [...people.values()].sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : b.items.length - a.items.length || a.name.localeCompare(b.name, "ko")));
  return { byGroup, byPerson, countedGroups: counted.length };
}

export async function loadMissingReports(supabase: ReportClient, profile: Profile, groupLabels: Map<string, string>, n: number) {
  const weeks = closedWeeks(n);
  const [groupsRes, mineRes] = await Promise.all([
    supabase.from("groups").select("id, type, name, parent_id, schedule, is_active, created_at").eq("is_active", true),
    supabase.from("memberships").select("group_id, role, position").eq("user_id", profile.id),
  ]);
  if (groupsRes.error) throw groupsRes.error;
  const all = (groupsRes.data ?? []).map((g) => ({ ...g, label: groupLabels.get(g.id) ?? g.name })) as MrGroup[];
  // 담임 목사님·담임 사모님은 전체, 담당 교역자는 맡은 부서만
  const scope = profile.recipient_role !== null ? new Set(all.map((g) => g.id)) : reviewScope(all, (mineRes.data ?? []) as MrMembership[]);
  const ids = [...scope];
  if (!ids.length) return { weeks, byGroup: [], byPerson: [], countedGroups: 0 };
  const [reportsRes, weekRes, membersRes] = await Promise.all([
    supabase.from("reports").select("group_id, week, status").in("group_id", ids).in("week", weeks),
    supabase.from("week_status").select("group_id, week").eq("no_meeting", true).in("group_id", ids).in("week", weeks),
    supabase.from("memberships").select("user_id, group_id, role, position, created_at").in("group_id", ids).eq("role", "writer"),
  ]);
  for (const r of [reportsRes, weekRes, membersRes]) if (r.error) throw r.error;
  const memberships = (membersRes.data ?? []) as MrMembership[];
  const userIds = [...new Set(memberships.map((m) => m.user_id))];
  const profilesRes = userIds.length ? await supabase.from("profiles").select("id, real_name, status").in("id", userIds) : { data: [], error: null };
  if (profilesRes.error) throw profilesRes.error;
  // 사용이 끝난(비활성) 계정은 작성자로 세지 않는다
  const active = new Set((profilesRes.data ?? []).filter((p) => p.status === "active").map((p) => p.id as string));
  const names = new Map((profilesRes.data ?? []).map((p) => [p.id as string, (p.real_name as string | null)?.trim() || "이름 없음"]));
  const result = summarizeMissing(
    all.filter((g) => scope.has(g.id)).concat(all.filter((g) => !scope.has(g.id) && all.some((c) => c.parent_id === g.id && scope.has(c.id)))),
    (reportsRes.data ?? []) as MrReport[],
    (weekRes.data ?? []) as MrNoMeeting[],
    memberships.filter((m) => active.has(m.user_id)),
    names,
    weeks,
  );
  return { weeks, ...result };
}
