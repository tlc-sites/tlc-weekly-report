import {groupDisplayName} from "@/lib/group-display";
import { groupIncidentEvents } from "@/lib/incident-events";
import { MeetingSummary } from "@/components/meeting-summary";
import { Suspense } from "react";
import Link from "@/components/pending-link";
import { redirect } from "next/navigation";
import { BackLink, Badge, Card, ErrorText, Loading, PageTitle, pickMessage, smallButtonClass } from "@/components/ui";
import { requireActive, isClergy } from "@/lib/auth";
import { FOLLOW_UP_LABEL } from "@/lib/members";
import { loadMeeting, reportTitle, type GroupStatus } from "@/lib/meeting";
import { CAMPUS_TEXTS, ISSUE_STATUS_LABEL } from "@/lib/report-forms";
import { addDays, formatDate, formatWeek, reportWeek, reportDateMax, todayKST, latestWeekday } from "@/lib/week";
import { updateIssueStatus } from "./actions";
import { PrintButton } from "./print-button";
import { INCIDENT_STATUS, type Incident } from "@/lib/incidents";

const STATUS: Record<GroupStatus, { label: string; tone: "muted" | "accent" | "danger" }> = {
  reviewed: { label: "확인", tone: "accent" },
  submitted: { label: "제출", tone: "muted" },
  late: { label: "전달 후 추가", tone: "muted" },
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
  if (!isClergy(profile)) redirect("/");
  const { week: weekParam, error } = await searchParams;
  // 일요일에 시작한 이번 주의 보고를 모은다. 금요일에는 그때까지 기록된 내용을 본다.
  const today = todayKST();
  const lastWeek = latestWeekday(today, 0);
  const week = reportWeek(weekParam, today);
  const data = await loadMeeting(supabase, profile, week);
  const followUps = await supabase.from("worship_incidents").select("*").or(`status.neq.resolved,occurred_on.gte.${week}`).lte("occurred_on",reportDateMax(week,today)).order("occurred_on",{ascending:false});
  const message = pickMessage(MESSAGES, error);
  const counts = data.overview.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }), {});

  return (
    <>
      <div data-print-hide>
        <BackLink href="/">홈</BackLink>
      </div>
      <PageTitle sub={formatWeek(week)}>교역자 회의 자료</PageTitle>
      <p className="mb-4 text-sm text-muted">금요일 오후 5시 전달 기준 · 현재까지 작성된 내용을 표시합니다.</p>
      <nav data-print-hide className="mb-4 flex items-center justify-between text-sm">
        <Link href={`/meeting?week=${addDays(week, -7)}`} className="inline-flex min-h-11 items-center rounded-xl border border-accent/40 bg-surface px-3 py-2 font-semibold text-accent shadow-sm hover:bg-accent/10">
          ← 지난주
        </Link>
        <PrintButton />
        {week < lastWeek ? <Link href={`/meeting?week=${addDays(week, 7)}`} className="inline-flex min-h-11 items-center rounded-xl border border-accent/40 bg-surface px-3 py-2 font-semibold text-accent shadow-sm hover:bg-accent/10">다음 주 →</Link> : <span className="px-2 py-1 text-muted/40">다음 주 →</span>}
      </nav>
      {message ? (
        <div className="mb-4">
          <ErrorText>{message}</ErrorText>
        </div>
      ) : null}

      <MeetingSummary reports={data.overview.flatMap(o=>o.reports)} groupName={data.groupName}/>
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
        <Section title="2. 교회학교 출석" sub="그 주 보고 중 출석이 가장 많은 모임 기준 · 학생">
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
                    <td className="py-2">{groupDisplayName(a.group.name)}</td>
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

      <Section title="예배 사고·경미한 팀 이슈" sub="이번 주 해결된 건도 포함 · 이전 주 미해결 건은 계속 표시 · 열람 권한 범위 내 공유">
        {followUps.error ? <ErrorText>예배 이슈를 불러오지 못했습니다.</ErrorText> : followUps.data?.length ? <ul className="divide-y divide-border">{groupIncidentEvents(followUps.data as Incident[]).map(event=><li key={event.key} className="py-3"><h3 className="rounded-xl bg-accent/10 px-3 py-2 font-semibold text-accent">{event.date} · {event.name}</h3><ul>{event.items.map(i=><li key={i.id} className="py-3 text-sm"><div className="flex items-center justify-between gap-2"><Link href={`/incidents/${i.id}`} className="font-semibold text-accent">{i.title}</Link><Badge tone="danger">{INCIDENT_STATUS[i.status]}</Badge></div><p className="mt-1 text-xs text-muted">{i.occurred_on} · {i.service_name} · 담당 {i.follow_up_owner || "미정"} · 목표일 {i.due_on || "미정"}</p><p className="mt-2 whitespace-pre-wrap">{i.circumstances}</p>{i.response ? <p className="mt-2 whitespace-pre-wrap text-muted">조치: {i.response}</p>:null}{i.prevention ? <p className="mt-2 whitespace-pre-wrap text-muted">개선대책: {i.prevention}</p>:null}</li>)}</ul></li>)}</ul> : <Empty/>}
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
        <Section title="채플·교육">
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
        <details className="mb-5" data-print-hide>
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
