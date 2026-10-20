import type { createClient } from "./supabase/server";

export type ReportClient = Awaited<ReturnType<typeof createClient>>;

export type Group = {
  id: string;
  type: "education" | "worship" | "other" | "campus";
  name: string;
  parent_id: string | null;
  schedule: "weekly" | "irregular";
  settings: { guardian_check?: boolean; report_category?:"internship" };
  sort_order: number;
  is_active: boolean;
};

export type OrderedGroup = Group & { depth: number; label: string; childCount: number };

export const GROUP_TYPE_LABEL: Record<Group["type"], string> = {
  education: "교육부서",
  worship: "예배/기술팀",
  other: "학교",
  campus: "부산캠퍼스",
};

export const NAV_CATEGORY_LABEL={...GROUP_TYPE_LABEL,internship:"스데반 인턴십"};
export const groupCategory=(g:Pick<Group,"type"|"settings">)=>g.settings?.report_category==="internship" ? "internship" : g.type;

export const SCHEDULE_LABEL: Record<Group["schedule"], string> = {
  weekly: "주간",
  irregular: "비정기",
};

export const ROLE_LABEL = { writer: "작성자", reviewer: "파트총괄·담당 교역자 소속" } as const;

const GROUP_COLUMNS = "id, type, name, parent_id, schedule, settings, sort_order, is_active";

// 상위 그룹 바로 뒤에 하위 그룹이 오도록 정렬한 목록 (2단계 계층 기준)
export async function listGroupsOrdered(supabase: ReportClient, { includeInactive = false } = {}) {
  let query = supabase.from("groups").select(GROUP_COLUMNS).order("sort_order").order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;

  const groups = (data ?? []) as Group[];
  const ids = new Set(groups.map((g) => g.id));
  // 상위 그룹이 비활성이라 목록에 없으면 하위 그룹을 최상위처럼 보여 준다
  const roots = groups.filter((g) => !g.parent_id || !ids.has(g.parent_id));
  const ordered: OrderedGroup[] = [];
  for (const root of roots) {
    // 비활성 하위 그룹은 맨 아래로 (정렬은 안정적이라 나머지 순서는 유지된다)
    const children = groups
      .filter((g) => g.parent_id === root.id)
      .sort((a, b) => Number(b.is_active) - Number(a.is_active));
    ordered.push({
      ...root,
      depth: 0,
      label: children.length ? `${root.name} 전체` : root.name,
      childCount: children.length,
    });
    for (const child of children) {
      ordered.push({ ...child, depth: 1, label: child.name, childCount: 0 });
    }
  }
  return ordered;
}

export async function getGroup(supabase: ReportClient, id: string) {
  const { data, error } = await supabase.from("groups").select(GROUP_COLUMNS).eq("id", id).maybeSingle<Group>();
  if (error) throw error;
  return data;
}
