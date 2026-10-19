import { Suspense } from "react";
import Link from "next/link";
import { BackLink, Badge, Card, ErrorText, Loading, PageTitle, pickMessage, smallButtonClass } from "@/components/ui";
import { requireActive } from "@/lib/auth";
import { FOLLOW_UP_LABEL } from "@/lib/members";
import { loadMeeting, reportTitle, type GroupStatus } from "@/lib/meeting";
import { CAMPUS_TEXTS, ISSUE_STATUS_LABEL } from "@/lib/report-forms";
import { addDays, formatDate, formatWeek, reportWeek, todayKST, latestWeekday } from "@/lib/week";
import { updateIssueStatus } from "./actions";
import { PrintButton } from "./print-button";

const STATUS: Record<GroupStatus, { label: string; tone: "muted" | "accent" | "danger" }> = {
  reviewed: { label: "확인", tone: "accent" },
  submitted: { label: "제출", tone: "muted" },
  late: { label: "마감 후 제출", tone: "danger" },
  no_meeting: { label: "모임 없음", tone: "muted" },
  draft: { label: "작성 중", tone: "danger" },
  missing: { label: "미제출", tone: "danger" },
  none: { label: "-", tone: "muted" },
};

const MESSAGES: Record<string, string> = { issue: "이슈 상태를 바꾸지 못했습니다. 검토자만 바꿀 수 있습니다." };

export default function MeetingPage({ searchParams }: PageProps<"/meeting">) {
  return (
    <Suspense fallback={<Loading />}>
      <MeetingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MeetingContent({ searchParams }: Pick<PageProps<"/meeting">, "searchParams">) {
  const { supabase, profile } = await requireActive();
  const { week: weekParam, error } = await searchParams;
  // 기본은 가장 최근에 끝난 주 (화요일 회의에서 보는 것은 지난 월~일). 일요일이면 그날로 끝나는 이번 주.
  const today = todayKST();
  const lastWeek = latestWeekday(today, 0);
  const week = reportWeek(weekParam, today);
  const data = await loadMeeting(supabase, profile, week);
  const message = pickMessage(MESSAGES, error);
  const counts = data.overview.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});

  return (
    <>
      <div data-print-hide>
        <BackLink href="/">홈</BackLink>
      </div>
      <PageTitle sub={formatWeek(week)}>교역자 회의 자료</PageTitle>
      <nav data-print-hide className="mb-4 flex items-center justify-between text-sm">
        <Link href={`/meeting?week=${addDays(week, -7)}`} className="px-2 py-1 text-muted">
          ← 지난주
        </Link>
        <PrintButton />
        {week < lastWeek ? <Link href={`/meeting?week=${addDays(week, 7)}`} className="px-2 py-1 text-muted">다음 주 →</Link> : <span className="px-2 py-1 text-muted/40">다음 주 →</span>}
      </nav>
      {message ? (
        <div className="mb-4">
          <ErrorText>{message}</ErrorText>
        </div>
      ) : null}

      <Section title="1. 제출 현황" sub={Object.entries(counts).map(([k, n]) => `${STATUS[k as GroupStatus].label} ${n}`).join(" · ")}>
        <ul className="flex flex-col divide-y divide-border text-sm">
          {data.overview.map(({ group, status, reports, reason }) => (
            <li key={group.id} className="flex items-start justify-between gap-2 py-2">
              <div>
                <Link href={`/groups/${group.id}?week=${week}`} className="font-medium">
                  {group.label}
                </Link>
                {reports.length ? (
                  <p className="text-xs text-muted">
                    {reports.map((r) => `${reportTitle(r)} ${formatDate(r.meeting_date)}`).join(", ")}
                  </p>
                ) : null}
                {reason ? <p className="text-xs text-muted">사유: {reason}</p> : null}
              </div>
              <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
            </li>
          ))}
        </ul>
      </Section>

      {data.attendance.length ? (
        <Section title="2. 교육부서 출석" sub="그 주 보고 중 출석이 가장 많은 모임 기준 · 학생">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-left font-normal">부서</th>
                <th className="py-1 text-right font-normal">출석/재적</th>
                <th className="py-1 text-right font-normal">출석률</th>
                <th className="py-1 text-right font-normal">지난주 대비</th>
              </tr>
            </thead>
            <tbody>
              {data.attendance.map((a) => {
                const diff = a.attend !== null && a.prevAttend !== null ? a.attend - a.prevAttend : null;
                return (
                  <tr key={a.group.id} className="border-t border-border">
                    <td className="py-2">{a.group.name}</td>
                    <td className="py-2 text-right tabular-nums">{a.attend === null ? "-" : `${a.attend}/${a.enrolled}`}</td>
                    <td className="py-2 text-right tabular-nums">
                      {a.attend !== null && a.enrolled ? `${Math.round((a.attend / a.enrolled) * 100)}%` : "-"}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${diff && diff < 0 ? "text-danger" : ""}`}>
                      {diff === null ? "-" : diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      ) : null}

      <Section title="3. 새친구" sub={`이번 주 ${data.thisWeekNewcomers.length}명 · 후속 관리 중 ${data.followUps.length}명`}>
        {[...data.thisWeekNewcomers, ...data.followUps].length ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {[...data.thisWeekNewcomers, ...data.followUps].map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/groups/${m.group_id}/members/${m.id}`}>
                  <span className="font-medium">{m.name}</span>
                  <span className="ml-2 text-xs text-muted">
                    {data.groupName.get(m.group_id)} · {m.grade ?? ""} · 첫 방문 {m.first_visit_date ? formatDate(m.first_visit_date) : "-"}
                  </span>
                </Link>
                {m.follow_up_status ? <Badge tone={m.follow_up_status === "new" ? "danger" : "muted"}>{FOLLOW_UP_LABEL[m.follow_up_status as keyof typeof FOLLOW_UP_LABEL]}</Badge> : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="4. 장기결석" sub={`최근 출석 기록에서 연속 ${data.threshold}회 이상 결석한 학생`}>
        {data.longAbsent.length ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {data.longAbsent.map((s) => (
              <li key={s.memberId} className="flex items-center justify-between py-2">
                <Link href={`/groups/${s.groupId}/members/${s.memberId}`}>
                  <span className="font-medium">{s.member!.name}</span>
                  <span className="ml-2 text-xs text-muted">{data.groupName.get(s.groupId)}</span>
                </Link>
                <Badge tone="danger">연속 {s.streak}회</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="5. 이슈" sub="이번 주 이슈와 아직 해결되지 않은 이전 이슈">
        {data.issues.length ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {data.issues.map((i) => (
              <li key={i.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/reports/${i.report.id}`} className="text-xs text-muted">
                    {data.groupName.get(i.report.group_id)} · {reportTitle(i.report)} {formatDate(i.report.meeting_date)}
                    {i.report.week !== week ? " (이전 주)" : ""}
                  </Link>
                  <Badge tone={i.status === "resolved" ? "muted" : "danger"}>{ISSUE_STATUS_LABEL[i.status]}</Badge>
                </div>
                <p className="mt-1">
                  <span className="mr-1 text-xs font-medium text-muted">[{i.category}]</span>
                  {i.content}
                </p>
                {i.action ? <p className="text-xs text-muted">→ {i.action}</p> : null}
                {i.status !== "resolved" ? (
                  <form action={updateIssueStatus} data-print-hide className="mt-1 flex justify-end">
                    <input type="hidden" name="issueId" value={i.id} />
                    <input type="hidden" name="status" value="resolved" />
                    <input type="hidden" name="week" value={week} />
                    <button type="submit" className={smallButtonClass}>
                      해결로 표시
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="6. 요청사항">
        {data.requests.length ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {data.requests.map((q, i) => (
              <li key={i} className="py-2">
                <span className="mr-1 text-xs font-medium text-muted">[{q.category}]</span>
                {q.content}
                <span className="ml-2 text-xs text-muted">{data.groupName.get(q.report.group_id)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      {data.schools.length ? (
        <Section title="학교 예배·교육">
          <div className="flex flex-col gap-5 text-sm">
            {data.schools.map((r) => (
              <article key={r.id} className="break-inside-avoid">
                <Link href={`/reports/${r.id}`} className="font-semibold text-accent">
                  {data.groupName.get(r.group_id)} · {reportTitle(r)} · {formatDate(r.meeting_date)}
                </Link>
                {([
                  ["song_list", "예배 송리스트"], ["sermon_passage", "설교본문"],
                  ["preacher", "설교자"], ["content", "예배·교육 내용"], ["notes", "특이사항"],
                ] as const).map(([key, label]) => typeof r.details[key] === "string" && r.details[key] ? (
                  <div key={key} className="mt-2">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="whitespace-pre-wrap">{String(r.details[key])}</p>
                  </div>
                ) : null)}
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      {data.campus.length ? (
        <Section title="7. 부산 캠퍼스">
          {data.campus.map((r) => {
            const texts = (r.details.texts ?? {}) as Record<string, string>;
            return (
              <div key={r.id} className="flex flex-col gap-2 text-sm">
                <Link href={`/reports/${r.id}`} className="text-xs text-muted">
                  {r.author?.real_name} · {formatDate(r.meeting_date)} 출발
                </Link>
                {CAMPUS_TEXTS.filter(([k]) => texts[k]).map(([k, label]) => (
                  <div key={k}>
                    <p className="text-xs text-muted">{label}</p>
                    <p className="whitespace-pre-wrap">{texts[k]}</p>
                  </div>
                ))}
              </div>
            );
          })}
        </Section>
      ) : null}

      {data.prayers.length ? (
        <details className="mb-5">
          <summary className="mb-2 cursor-pointer text-sm font-semibold">기도제목 {data.prayers.length}건 (펼쳐야 보이고, 접힌 채로 인쇄하면 빠집니다)</summary>
          <Card className="flex flex-col gap-3 text-sm">
            {data.prayers.map((p) => (
              <div key={p.report_id}>
                <p className="text-xs text-muted">{data.groupName.get(p.report.group_id)} · {reportTitle(p.report)}</p>
                <p className="whitespace-pre-wrap">{p.body}</p>
              </div>
            ))}
          </Card>
        </details>
      ) : null}

      {data.messagesToMe.length ? (
        <details className="mb-5" data-print-hide>
          <summary className="mb-2 cursor-pointer text-sm font-semibold text-accent">나에게 온 글 {data.messagesToMe.length}건</summary>
          <Card className="flex flex-col gap-3 text-sm">
            {data.messagesToMe.map((m) => (
              <div key={`${m.report_id}-${m.recipient}`}>
                <Link href={`/reports/${m.report_id}`} className="text-xs text-muted">
                  {m.report.author?.real_name} · {data.groupName.get(m.report.group_id)}
                </Link>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </Card>
        </details>
      ) : null}
    </>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h2 className="text-sm font-semibold">{title}</h2>
      {sub ? <p className="mb-2 text-xs text-muted">{sub}</p> : <div className="mb-2" />}
      <Card>{children}</Card>
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-muted">없음</p>;
}
