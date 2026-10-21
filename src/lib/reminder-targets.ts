// 알림 대상 계산 (순수 함수). DB 조회와 발송은 reminders.ts가 하고, 여기서는 규칙만 정한다.
// 다른 모듈을 import하지 않아 node --test로 바로 검증할 수 있다.

export type RtGroup = {
  type?: string;
  id: string;
  label: string;
  parent_id: string | null;
  schedule: "weekly" | "irregular";
  is_active: boolean;
};
export type RtMembership = { user_id: string; group_id: string; role: "writer" | "reviewer" };
export type RtReport = { group_id: string; status: "draft" | "submitted" | "reviewed" };
export type RtUser = { id: string; status: "pending" | "active" | "disabled"; is_admin: boolean; is_minister?: boolean; notify_enabled: boolean; recipient_role?: "pastor" | "pastor_wife" | null };

/** 미제출 그룹: 하위 그룹이 없는 활성 주간 그룹 중 제출된 보고도, 모임 없음 표시도 없는 곳 (임시저장만 있으면 미제출) */
export function missingGroups(groups: RtGroup[], reports: RtReport[], noMeetingGroupIds: Set<string>) {
  const parents = new Set(groups.map((g) => g.parent_id).filter(Boolean));
  const submitted = new Set(reports.filter((r) => r.status !== "draft").map((r) => r.group_id));
  return groups.filter(
    (g) => g.type !== "worship" && g.is_active && g.schedule === "weekly" && !parents.has(g.id) && !submitted.has(g.id) && !noMeetingGroupIds.has(g.id),
  );
}

const canReceive = (u: RtUser | undefined) => Boolean(u && u.status === "active" && u.notify_enabled);

/** 미제출 알림: 그 그룹에 직접 소속된 사람(작성자·검토자)에게, 사람마다 그룹 이름을 모아서 한 번 */
export function reminderTargets(missing: RtGroup[], memberships: RtMembership[], users: RtUser[]) {
  const userById = new Map(users.map((u) => [u.id, u]));
  const targets = new Map<string, string[]>();
  for (const g of missing) {
    for (const m of memberships.filter((x) => x.group_id === g.id)) {
      if (!canReceive(userById.get(m.user_id))) continue;
      targets.set(m.user_id, [...(targets.get(m.user_id) ?? []), g.label]);
    }
  }
  return targets;
}

/** 관리자 요약 대상 */
export function adminTargets(users: RtUser[]) {
  return users.filter((u) => u.is_admin && canReceive(u)).map((u) => u.id);
}

/** 금요일 보고 안내는 교역자와 담임 목사님·담임 사모님에게 보낸다. */
export function digestTargets(users: RtUser[]) {
  return users.filter((u) => canReceive(u) && (u.is_minister || u.recipient_role==="pastor" || u.recipient_role==="pastor_wife")).map((u) => u.id);
}

/** 알림 문구에 쓸 그룹 이름 요약: "중등부, 음향 외 2곳" */
export function summarizeNames(names: string[], max = 2) {
  return names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} 외 ${names.length - max}곳`;
}
