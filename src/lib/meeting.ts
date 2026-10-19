import type { Profile } from "./auth";
import { listGroupsOrdered, type OrderedGroup, type ReportClient } from "./groups";
import type { ReportStatus } from "./report-forms";
import { addDays } from "./week";

// 교역자 회의 자료에 필요한 데이터를 모은다. 조회는 모두 로그인한 사람의 권한(RLS) 안에서만 된다.

export type MeetingReport = {
  id: string;
  group_id: string;
  author_id: string;
  meeting_date: string;
  meeting_label: string | null;
  status: ReportStatus;
  submitted_at: string | null;
  enrolled_snapshot: number | null;
  attend_snapshot: number | null;
  details: Record<string, unknown>;
  week: string;
  service: { name: string } | null;
  meeting: { name: string } | null;
  author: { real_name: string | null } | null;
};

export type GroupStatus = "reviewed" | "submitted" | "late" | "no_meeting" | "draft" | "missing" | "none";

const REPORT_COLUMNS =
  "id, group_id, author_id, meeting_date, meeting_label, status, submitted_at, enrolled_snapshot, attend_snapshot, details, week, service:service_types(name), meeting:group_meeting_types(name), author:profiles!reports_author_id_fkey(real_name)";

export const reportTitle = (r: Pick<MeetingReport, "service" | "meeting" | "meeting_label">) =>
  r.service?.name ?? r.meeting?.name ?? r.meeting_label ?? "보고";

// 마감: 그 주 다음 날(월요일) 23:59 (한국 시간)
export const deadlineOf = (week: string) => new Date(`${addDays(week, 1)}T23:59:59+09:00`);

export async function loadMeeting(supabase: ReportClient, profile: Profile, week: string) {
  const prevWeek = addDays(week, -7);
  const [groups, memberships, reportsRes, prevRes, weekStatusRes, thresholdRes] = await Promise.all([
    listGroupsOrdered(supabase),
    supabase.from("memberships").select("group_id").eq("user_id", profile.id).then((r) => new Set((r.data ?? []).map((m) => m.group_id as string))),
    supabase.from("reports").select(REPORT_COLUMNS).eq("week", week).order("meeting_date").returns<MeetingReport[]>(),
    supabase.from("reports").select("group_id, attend_snapshot, enrolled_snapshot, status").eq("week", prevWeek).neq("status", "draft"),
    supabase.from("week_status").select("group_id, no_meeting, reason").eq("week", week),
    supabase.from("app_settings").select("value").eq("key", "long_absence_threshold").maybeSingle(),
  ]);
  if (reportsRes.error) throw reportsRes.error;
  const threshold = Number(thresholdRes.data?.value ?? 3) || 3;

  // 볼 수 있는 보고 그룹: 관리자는 전체, 그 외에는 소속 그룹과 그 하위 그룹 (비활성 그룹은 제외)
  // 아래 모든 항목은 이 그룹 범위 안의 보고만 쓴다
  const visible = groups.filter(
    (g) => g.childCount === 0 && (profile.is_admin || memberships.has(g.id) || (g.parent_id !== null && memberships.has(g.parent_id))),
  );
  const visibleIds = new Set(visible.map((g) => g.id));
  const reports = (reportsRes.data ?? []).filter((r) => visibleIds.has(r.group_id));
  const noMeeting = new Map((weekStatusRes.data ?? []).filter((w) => w.no_meeting).map((w) => [w.group_id as string, w.reason as string | null]));
  const deadline = deadlineOf(week);

  const statusOf = (g: OrderedGroup): GroupStatus => {
    const mine = reports.filter((r) => r.group_id === g.id);
    const sent = mine.filter((r) => r.status !== "draft");
    if (sent.length) {
      if (sent.some((r) => r.submitted_at && new Date(r.submitted_at) > deadline)) return "late";
      return sent.every((r) => r.status === "reviewed") ? "reviewed" : "submitted";
    }
    if (noMeeting.has(g.id)) return "no_meeting";
    if (mine.length) return "draft";
    return g.type !== "worship" && g.schedule === "weekly" ? "missing" : "none";
  };
  const overview = visible.map((g) => ({ group: g, status: statusOf(g), reports: reports.filter((r) => r.group_id === g.id), reason: noMeeting.get(g.id) ?? null }));

  const sentReports = reports.filter((r) => r.status !== "draft");
  const reportIds = sentReports.map((r) => r.id);
  const educationIds = new Set(visible.filter((g) => g.type === "education").map((g) => g.id));

  // 교육부서 출석: 그 주 보고 중 출석이 가장 많은 모임을 대표로, 지난주와 비교
  const bestAttend = (list: { group_id: string; attend_snapshot: number | null; enrolled_snapshot: number | null }[], groupId: string) =>
    list
      .filter((r) => r.group_id === groupId && r.attend_snapshot !== null)
      .sort((a, b) => (b.attend_snapshot ?? 0) - (a.attend_snapshot ?? 0))[0];
  const attendance = visible
    .filter((g) => g.type === "education")
    .map((g) => {
      const now = bestAttend(sentReports, g.id);
      const prev = bestAttend(prevRes.data ?? [], g.id);
      return { group: g, attend: now?.attend_snapshot ?? null, enrolled: now?.enrolled_snapshot ?? null, prevAttend: prev?.attend_snapshot ?? null };
    });

  const sixWeeksAgo = addDays(week, -42);
  const [newcomersRes, issuesRes, prayersRes, messagesRes, absenceRes] = await Promise.all([
    supabase
      .from("members")
      .select("id, group_id, name, grade, first_visit_date, follow_up_status")
      .eq("status", "newcomer")
      .gte("first_visit_date", addDays(week, -55))
      .order("first_visit_date", { ascending: false }),
    supabase
      .from("report_issues")
      .select("id, category, content, status, action, report:reports!inner(id, group_id, week, meeting_date, meeting_label, service:service_types(name), meeting:group_meeting_types(name))")
      .or(`status.neq.resolved,report_id.in.(${reportIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
      .lte("report.week", week),
    reportIds.length ? supabase.from("report_prayers").select("report_id, body").in("report_id", reportIds) : Promise.resolve({ data: [] }),
    reportIds.length
      ? supabase.from("report_messages").select("report_id, recipient, body").in("report_id", reportIds)
      : Promise.resolve({ data: [] }),
    educationIds.size
      ? supabase
          .from("attendance")
          .select("member_id, present, report:reports!inner(meeting_date, group_id, status)")
          .gte("report.meeting_date", sixWeeksAgo)
          .lte("report.meeting_date", week)
          .neq("report.status", "draft")
      : Promise.resolve({ data: [] }),
  ]);

  const groupName = new Map(groups.map((g) => [g.id, g.label]));
  const newcomers = (newcomersRes.data ?? []).filter((m) => visibleIds.has(m.group_id));
  const thisWeekNewcomers = newcomers.filter((m) => m.first_visit_date && m.first_visit_date > addDays(week, -7));
  const followUps = newcomers.filter((m) => !thisWeekNewcomers.includes(m) && (m.follow_up_status === "new" || m.follow_up_status === "contacted"));

  type IssueRow = {
    id: string;
    category: string;
    content: string;
    status: "open" | "temporary" | "resolved";
    action: string | null;
    report: Pick<MeetingReport, "id" | "group_id" | "week" | "meeting_date" | "meeting_label" | "service" | "meeting">;
  };
  const issues = ((issuesRes.data ?? []) as unknown as IssueRow[]).filter((i) => visibleIds.has(i.report.group_id)).sort((a, b) => b.report.meeting_date.localeCompare(a.report.meeting_date));

  // 장기결석: 최근 6주 출석 기록에서 마지막부터 연속 결석이 기준 횟수 이상인 학생
  type AbsenceRow = { member_id: string; present: boolean; report: { meeting_date: string; group_id: string } };
  const byMember = new Map<string, AbsenceRow[]>();
  for (const row of ((absenceRes.data ?? []) as unknown as AbsenceRow[]).filter((r) => visibleIds.has(r.report.group_id))) {
    byMember.set(row.member_id, [...(byMember.get(row.member_id) ?? []), row]);
  }
  const streaks = [...byMember.entries()]
    .map(([memberId, rows]) => {
      const sorted = rows.sort((a, b) => b.report.meeting_date.localeCompare(a.report.meeting_date));
      const streak = sorted.findIndex((r) => r.present);
      return { memberId, groupId: sorted[0].report.group_id, streak: streak === -1 ? sorted.length : streak };
    })
    .filter((s) => s.streak >= threshold);
  const absentMembers = streaks.length
    ? ((await supabase.from("members").select("id, name, kind, status").in("id", streaks.map((s) => s.memberId))).data ?? [])
    : [];
  const longAbsent = streaks
    .map((s) => ({ ...s, member: absentMembers.find((m) => m.id === s.memberId) }))
    .filter((s) => s.member && s.member.kind === "student" && s.member.status !== "inactive")
    .sort((a, b) => b.streak - a.streak);

  const requests = sentReports.flatMap((r) =>
    (Array.isArray(r.details.requests) ? (r.details.requests as { category: string; content: string }[]) : []).map((q) => ({ ...q, report: r })),
  );
  const prayers = ((prayersRes.data ?? []) as { report_id: string; body: string }[]).map((p) => ({
    ...p,
    report: sentReports.find((r) => r.id === p.report_id)!,
  }));
  // 나에게 온 글만 (내가 작성한 보고의 글은 제외)
  const messagesToMe = ((messagesRes.data ?? []) as { report_id: string; recipient: string; body: string }[])
    .map((m) => ({ ...m, report: sentReports.find((r) => r.id === m.report_id)! }))
    .filter((m) => m.report && m.report.author_id !== profile.id);
  const campus = sentReports.filter((r) => visible.find((g) => g.id === r.group_id)?.type === "campus");
  const schools = sentReports.filter((r) => visible.find((g) => g.id === r.group_id)?.type === "other");

  return { overview, attendance, thisWeekNewcomers, followUps, longAbsent, threshold, issues, requests, prayers, messagesToMe, campus, schools, groupName, week };
}
