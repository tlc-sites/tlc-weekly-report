import { NoMeeting } from "./no-meeting";
import { SubmitButton } from "@/components/submit-button";
import { serviceOccursOn } from "@/lib/service-schedule";
import { Suspense } from "react";
import Link from "next/link";
import {
  BackLink,
  Badge,
  Card,
  ErrorText,
  Field,
  Loading,
  PageTitle,
  inputClass,
  pickMessage,
} from "@/components/ui";
import { getGroupAccess } from "@/lib/access";
import { requireActive } from "@/lib/auth";
import { listGroupsOrdered } from "@/lib/groups";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/report-forms";
import { addDays, dateInWeek, formatDate, formatWeek, reportWeek, reportDateMax, latestWeekday, todayKST } from "@/lib/week";
import { createReport } from "./actions";
import { NewReportFields } from "./new-report-fields";

const MESSAGES: Record<string, string> = {
  invalid: "입력값이 올바르지 않습니다.",
  label: "행사 이름을 입력해 주세요.",
  save: "저장하지 못했습니다. 권한이 있는지 확인하고 다시 시도해 주세요.",
};

type ReportRow = {
  id: string;
  meeting_date: string;
  meeting_label: string | null;
  status: ReportStatus;
  submitted_at: string | null;
  author: { real_name: string | null } | null;
  service: { name: string } | null;
  meeting: { name: string } | null;
};

export default function GroupPage({ params, searchParams }: PageProps<"/groups/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <GroupContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function GroupContent({ params, searchParams }: PageProps<"/groups/[id]">) {
  const { supabase } = await requireActive();
  const [{ id }, { week: weekParam, error }] = await Promise.all([params, searchParams]);
  const { group, canWrite, isLeaf } = await getGroupAccess(supabase, id);
  const today = todayKST();
  const week = reportWeek(weekParam, today);
  const maxDate=reportDateMax(week,today);

  // 상위 그룹이면 하위 그룹 목록만 보여 준다
  if (!isLeaf) {
    const children = (await listGroupsOrdered(supabase)).filter((g) => g.parent_id === id);
    return (
      <>
        <BackLink href="/">홈</BackLink>
        <PageTitle>{group.name}</PageTitle>
        <Card>
          <ul className="flex flex-col divide-y divide-border">
            {children.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}`} className="flex justify-between py-3">
                  {g.name}
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </>
    );
  }

  const [reportsRes, weekStatus, services, meetingTypes] = await Promise.all([
    supabase
      .from("reports")
      .select(
        "id, meeting_date, meeting_label, status, submitted_at, author:profiles!reports_author_id_fkey(real_name), service:service_types(name), meeting:group_meeting_types(name)",
      )
      .eq("group_id", id)
      .eq("week", week)
      .order("meeting_date")
      .returns<ReportRow[]>(),
    supabase.from("week_status").select("no_meeting, reason").eq("group_id", id).eq("week", week).maybeSingle(),
    supabase
      .from("group_service_types")
      .select("service:service_types(id, name, weekday, month_week, sort_order, is_active)")
      .eq("group_id", id)
      .then((r) =>
        (r.data ?? [])
          .map((x) => x.service as unknown as { id: string; name: string; weekday: number | null; month_week: number | null; sort_order: number; is_active: boolean })
          .filter((s) => s && s.is_active)
          .sort((a, b) => a.sort_order - b.sort_order),
      ),
    supabase
      .from("group_meeting_types")
      .select("id, name, weekday")
      .eq("group_id", id)
      .eq("is_active", true)
      .order("sort_order")
      .then((r) => r.data ?? []),
  ]);
  if (reportsRes.error) throw reportsRes.error;
  const reports = reportsRes.data ?? [];
  const noMeeting = weekStatus.data?.no_meeting ?? false;
  const message = pickMessage(MESSAGES, error);
  const isCurrentWeek = week === latestWeekday(today, 0);

  // 선택한 주차 안에서 예배 요일을 자동 지정한다.
  const defaultDate = (weekday: number | null) =>
    weekday === null ? maxDate : dateInWeek(week, weekday);
  const options = [
    ...services.filter(s => serviceOccursOn(defaultDate(s.weekday), s)).filter(s => defaultDate(s.weekday) <= today).map((s) => ({ value: `service:${s.id}`, label: s.name, date: defaultDate(s.weekday), fixedDate: s.weekday !== null })),
    ...meetingTypes.filter(m => defaultDate(m.weekday) <= today).map((m) => ({ value: `meeting:${m.id}`, label: m.name, date: defaultDate(m.weekday), fixedDate: m.weekday !== null })),
  ];

  return (
    <>
      <BackLink href="/">홈</BackLink>
      <PageTitle>{group.name}</PageTitle>
      <p className="mb-4 text-sm text-muted">일요일~토요일 주간 보고 · 금요일 오후 5시 전달</p>
      <Link href="/notices" className="mb-4 self-start text-sm text-accent underline">공지·소통 확인하기</Link>
      {message ? (
        <div className="mb-4">
          <ErrorText>{message}</ErrorText>
        </div>
      ) : null}

      <nav className="mb-4 flex items-center justify-between text-sm">
        <Link href={`/groups/${id}?week=${addDays(week, -7)}`} className="px-2 py-1 text-muted">
          ← 지난주
        </Link>
        <span className="font-semibold">{formatWeek(week)}</span>
        {isCurrentWeek ? (
          <span className="px-2 py-1 text-muted/40">다음 주 →</span>
        ) : (
          <Link href={`/groups/${id}?week=${addDays(week, 7)}`} className="px-2 py-1 text-muted">
            다음 주 →
          </Link>
        )}
      </nav>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-medium text-muted">이번 주 보고 {reports.length}건</h2>
        {reports.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`} className="flex items-center justify-between gap-2 py-3">
                  <span>
                    <span className="font-medium">{r.service?.name ?? r.meeting?.name ?? r.meeting_label}</span>
                    <span className="ml-2 text-xs text-muted">
                      {formatDate(r.meeting_date)} · {r.author?.real_name}
                    </span>
                  </span>
                  <Badge tone={r.status === "draft" ? "danger" : r.status === "reviewed" ? "accent" : "muted"}>
                    {REPORT_STATUS_LABEL[r.status]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{noMeeting ? "이번 주는 모임 없음으로 표시되어 있습니다." : "아직 보고가 없습니다."}</p>
        )}
      </Card>

      {canWrite ? (
        <>
          <h2 id="new-report" className="mb-2 text-sm font-semibold">{group.type === "education" ? "출결 관리 · 새 보고 작성" : "새 보고 작성"}</h2>
          <Card className="mb-4">
            <form action={createReport} className="flex flex-col gap-3">
              <input type="hidden" name="groupId" value={id} />
              <input type="hidden" name="reportWeek" value={week} />
              {group.type === "campus" ? (
                <>
                  <input type="hidden" name="meeting" value="campus" />
                  <Field label="판교 출발 날짜">
                    <input name="meetingDate" type="date" min={week} max={maxDate} required defaultValue={maxDate} className={inputClass} />
                  </Field>
                </>
              ) : (
                <NewReportFields key={week} options={options} fallbackDate={defaultDate(null)} maxDate={maxDate} minDate={week} />
              )}
              <SubmitButton pendingText="작성 화면 여는 중…">{group.type === "education" ? "출결 체크 시작" : "작성 시작"}</SubmitButton>
            </form>
          </Card>

          {group.type === "education" || group.type === "other" ? <NoMeeting key={week + String(noMeeting)} groupId={id} week={week} noMeeting={noMeeting} reason={weekStatus.data?.reason ?? null} /> : null}
        </>
      ) : null}

      {group.type === "education" ? (
        <Link href={`/groups/${id}/members`} className="mt-6 text-sm text-accent underline underline-offset-4">
          {group.name} 명단 →
        </Link>
      ) : null}
    </>
  );
}

