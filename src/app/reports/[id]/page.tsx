import { getReportIdentity } from "@/lib/report-identity";
import { SubmissionReceipt } from "@/components/submission-receipt";
import {TeamSessionForm} from "./team-session-form";
import {isTeamSession,teamSessionPayload} from "@/lib/team-session";
import { Suspense } from "react";
import { TeamIssues } from "@/components/team-issues";
import type { Incident } from "@/lib/incidents";
import { listGroupsOrdered } from "@/lib/groups";
import { notFound } from "next/navigation";
import { BackLink, Badge, Card, ErrorText, Loading, PageTitle, pickMessage, smallButtonClass } from "@/components/ui";
import { requireActive, isSenior, isClergy } from "@/lib/auth";
import type { Group } from "@/lib/groups";
import {
  CAMPUS_COUNTS,
  CAMPUS_TEXTS,
  CAMPUS_SECTIONS,
  ISSUE_STATUS_LABEL,
  REPORT_STATUS_LABEL,
  RESULT_LABEL,
  emptyMessages,
  type CampusPayload,
  type EducationPayload,
  type OtherPayload,
  type ReportStatus,
  type WorshipPayload,
} from "@/lib/report-forms";
import { formatDate, weekOf, todayKST } from "@/lib/week";
import { deleteDraft, saveReport } from "./actions";
import { PrivateSharing } from "./sharing";
import { Comments, ReviewPanel } from "./review";
import { CampusForm } from "./campus-form";
import { EducationForm, type RosterMember } from "./education-form";
import type { Issue, Messages } from "./form-parts";
import { OtherForm, WorshipForm } from "./worship-form";

const MESSAGES: Record<string, string> = {
  "attendance-assignment": "교육부서 출결 보고는 담당 파트 배정 후 제출할 수 있습니다. 작성 내용은 임시저장해 주세요.",
  invalid: "입력값이 올바르지 않습니다. 다시 확인해 주세요.",
  missing: "제출에 필요한 항목이 비어 있습니다.",
  consent: "보호자 연락처를 저장하려면 수집 동의를 체크해 주세요.",
  forbidden: "이 보고를 수정할 권한이 없습니다. 이미 확인 처리된 보고일 수 있습니다.",
  save: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  delete: "임시저장 상태인 내 보고만 삭제할 수 있습니다.",
  comment: "코멘트를 등록하지 못했습니다. 내용을 확인해 주세요.",
};

type ReportRow = {
  id: string;
  group_id: string;
  author_id: string;
  meeting_date: string;
  service_type_id: string | null;
  meeting_label: string | null;
  status: ReportStatus;
  details: Record<string, unknown>;
  attend_snapshot:number|null;
  enrolled_snapshot:number|null;
  updated_at: string;
  service: { name: string } | null;
  meeting: { name: string } | null;
  author: { real_name: string | null } | null;
  group: (Pick<Group, "id" | "name" | "type" | "settings"> & { parent: { name: string } | null }) | null;
};

export default function ReportPage({ params, searchParams }: PageProps<"/reports/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <ReportContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ReportContent({ params, searchParams }: PageProps<"/reports/[id]">) {
  const { supabase, profile } = await requireActive();
  const [{ id }, { error, saved, existing, edit, reviewed }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: report } = await supabase
    .from("reports")
    .select(
      "id, group_id, author_id, meeting_date, service_type_id, meeting_label, status, details, attend_snapshot, enrolled_snapshot, updated_at, service:service_types(name), meeting:group_meeting_types(name), author:profiles!reports_author_id_fkey(real_name), group:groups(id, name, type, settings, parent:parent_id(name))",
    )
    .eq("id", id)
    .maybeSingle<ReportRow>();
  if (!report?.group) notFound();
  const group = report.group;
  const serviceName=report.service?.name ?? report.meeting?.name ?? report.meeting_label ?? "예배";
  let incidentResult=null;
  let teamGroups:{id:string;name:string}[]=[];
  if(group.type==="worship") {
    let query=supabase.from("worship_incidents").select("*").contains("group_ids",[group.id]).eq("occurred_on",report.meeting_date).order("created_at");
    query=report.service_type_id ? query.eq("service_id",report.service_type_id) : query.is("service_id",null).eq("service_name",serviceName);
    incidentResult=await query;
    teamGroups=(await listGroupsOrdered(supabase)).filter(g=>g.type==="worship" && g.childCount===0);
  }

  const isAuthor = report.author_id === profile.id;
  const [canEditRes, canReviewRes, messagesRes, prayerRes, privateRes, teamWriteRes] = await Promise.all([
    supabase.rpc("can_edit_report", { rid: id }),
    supabase.rpc("can_review_report", { rid: id }),
    // 작성자에게는 자기가 쓴 글 전부, 받는 분에게는 자기에게 온 글만 돌아온다 (RLS)
    supabase.from("report_messages").select("recipient, body").eq("report_id", id),
    supabase.from("report_prayers").select("body").eq("report_id", id).maybeSingle(),
    supabase.rpc("can_read_private",{rid:id,kind:"prayer"}),
    supabase.rpc("can_write_group",{gid:group.id}),
  ]);
  const canEdit = Boolean(canEditRes.data);
  const canReview = Boolean(canReviewRes.data);
  // 검토자는 기본으로 읽기 화면을 보고, 필요할 때만 수정 화면으로 들어간다
  const editMode = canEdit && (isAuthor || edit === "1");
  const messages: Messages = { ...emptyMessages() };
  for (const m of messagesRes.data ?? []) messages[m.recipient as keyof Messages] = m.body;
  const messagesToMe = isAuthor ? [] : (messagesRes.data ?? []);
  const title = report.service?.name ?? report.meeting?.name ?? report.meeting_label ?? "보고";
  const message = pickMessage(MESSAGES, error);
  const d = report.details;
  const str = (key: string) => (typeof d[key] === "string" ? (d[key] as string) : "");
  const requests = Array.isArray(d.requests) ? (d.requests as WorshipPayload["details"]["requests"]) : [];

  let body: React.ReactNode = null;

  if(isTeamSession(report.details)) {
    const initial=teamSessionPayload.parse({details:{session_type:report.details.session_type,topic:str("topic"),passage:str("passage"),place:str("place"),content:str("content"),members:Array.isArray(report.details.members)?report.details.members:[]},messages});
    body=editMode?<TeamSessionForm reportId={id} initial={initial} action={saveReport} showMessages={isAuthor}/>:<ReadOnly rows={[["주제",initial.details.topic],["공과·성경 범위",initial.details.passage],["진행 장소",initial.details.place],["진행 내용",initial.details.content],["팀원별 보고",initial.details.members.map(m=>`${m.name} · ${m.present ? "참석":"불참"} · ${m.note} · ${m.follow_up}`).join("\n")]]}/>;
  } else if (group.type === "education") {
    const [{ data: members }, { data: attendance }] = await Promise.all([
      supabase.from("members").select("id, name, kind, class_name, status, photo_data, birth_date").eq("group_id", group.id).neq("status", "inactive").order("class_name").order("name"),
      supabase.from("attendance").select("member_id, present, absence_reason, contacted, guardian_present").eq("report_id", id),
    ]);
    const roster = (members ?? []) as RosterMember[];
    const att = new Map((attendance ?? []).map((a) => [a.member_id as string, a]));
    const initial: EducationPayload = {
      details: { sermon_passage: str("sermon_passage"), preacher: str("preacher"), activity: str("activity"), notes: str("notes"), requests },
      attendance: roster.map((m) => {
        const a = att.get(m.id);
        return {
          member_id: m.id,
          present: a?.present ?? false,
          absence_reason: a?.absence_reason ?? "",
          contacted: a?.contacted ?? false,
          guardian_present: a?.guardian_present ?? false,
        };
      }),
      newcomers: [],
      prayer: prayerRes.data?.body ?? "",
      messages,
    };
    body = editMode ? (
      <EducationForm
        key={report.updated_at}
        action={saveReport}
        reportId={id}
        initial={initial}
        roster={roster}
        canEditPrayer={Boolean(privateRes.data)}
        guardianCheck={Boolean(group.settings?.guardian_check)}
        showMessages={isAuthor}
      />
    ) : (
      <ReadOnly
        rows={[
          ["출석", `${report.attend_snapshot ?? roster.filter((m) => m.kind==="student" && att.get(m.id)?.present).length}명 / ${report.enrolled_snapshot ?? roster.filter(m=>m.kind==="student").length}명`],
          [
            "결석",
            roster
              .filter((m) => att.has(m.id) && !att.get(m.id)!.present)
              .map((m) => `${m.name}${att.get(m.id)!.absence_reason ? ` (${att.get(m.id)!.absence_reason})` : ""}${att.get(m.id)!.contacted ? " · 연락함" : ""}`)
              .join("\n"),
          ],
          ["설교 본문", str("sermon_passage")],
          ["설교자", str("preacher")],
          ["공과·활동", str("activity")],
          ["기도제목", prayerRes.data?.body ?? ""],
          ["특이사항", str("notes")],
          ["요청사항", requests.map((r) => `[${r.category}] ${r.content}`).join("\n")],
        ]}
      />
    );
  } else if (group.type === "worship" || group.type === "other") {
    const { data: issueRows } = group.type === "other" ? await supabase
      .from("report_issues")
      .select("category, content, status, action")
      .eq("report_id", id)
      .order("created_at") : {data:[]};
    const issues = (issueRows ?? []).map((i) => ({ ...i, action: i.action ?? "" })) as Issue[];
    if (editMode && group.type === "worship") {
      const result = str("result") as WorshipPayload["details"]["result"];
      body = (
        <WorshipForm
          key={report.updated_at}
          action={saveReport}
          reportId={id}
          initial={{ details: { result, notes: str("notes"), requests, sermon_passage:str("sermon_passage"),sermon_content:str("sermon_content"),service_staff:str("service_staff") }, issues, messages }}
          showMessages={isAuthor}
        />
      );
    } else if (editMode) {
      const initial: OtherPayload = {
        details: { song_list: str("song_list"), sharing_topic:str("sharing_topic"),sharing_passage:str("sharing_passage"),sharing_place:str("sharing_place"), sermon_passage: str("sermon_passage"), preacher: str("preacher"), content: str("content"), notes: str("notes"), requests },
        issues, messages,
      };
      body = <OtherForm internship={group.settings?.report_category==="internship"} key={report.updated_at} action={saveReport} reportId={id} initial={initial} showMessages={isAuthor} />;
    } else {
      body = (
        <ReadOnly
          rows={[
            ...(group.type === "other" ? [
              ["예배 송리스트", str("song_list")],
              ["설교본문", str("sermon_passage")],
              ["설교자", str("preacher")],
              ["예배·교육 내용", str("content")],
              ["나눔 주제",str("sharing_topic")],["나눔 범위",str("sharing_passage")],["나눔 장소",str("sharing_place")],
            ] as [string, string][] : [["말씀본문",str("sermon_passage")], ["말씀·예배 내용",str("sermon_content")], ["예배위원",str("service_staff")],
            ["진행 결과", RESULT_LABEL[str("result") as keyof typeof RESULT_LABEL] ?? ""]] as [string, string][]),
            ...issues.map(
              (i) => [`이슈 · ${i.category}`, `${i.content}${i.action ? `\n→ ${i.action}` : ""} (${ISSUE_STATUS_LABEL[i.status]})`] as [string, string],
            ),
            ["요청사항", requests.map((r) => `[${r.category}] ${r.content}`).join("\n")],
            [group.type === "worship" ? "사역 보고·다음 주 준비" : "특이사항", str("notes")],
          ]}
        />
      );
    }
  } else if (group.type === "campus") {
    const prev = d as Partial<CampusPayload["details"]>;
    const initial: CampusPayload = {
      details: {
        companion: prev.companion ?? "",
        depart_pangyo: prev.depart_pangyo ?? report.meeting_date,
        depart_busan: prev.depart_busan ?? "",
        offerings: prev.offerings ?? [],
        offerings_other: prev.offerings_other ?? "",
        counts: Object.fromEntries(CAMPUS_COUNTS.map(([k]) => [k, prev.counts?.[k] ?? null])) as CampusPayload["details"]["counts"],
        lodging: prev.lodging ?? "",
        saturday: prev.saturday ?? [],
        saturday_other: prev.saturday_other ?? "",
        report_mode:"sections",
        sections:prev.sections??{},
        texts: Object.fromEntries(CAMPUS_TEXTS.map(([k]) => [k, prev.texts?.[k] ?? ""])) as CampusPayload["details"]["texts"],
      },
      messages,
    };
    const dd = initial.details;
    body = editMode ? (
      <CampusForm
        key={report.updated_at}
        action={saveReport}
        reportId={id}
        initial={initial}
        showMessages={isAuthor}
        authorName={getReportIdentity(report.details,report.author?.real_name).author_name}
      />
    ) : (
      <ReadOnly
        rows={[
          ["동행 스텝", dd.companion],
          ["판교 출발 / 부산 출발", `${dd.depart_pangyo} / ${dd.depart_busan}`],
          ["헌금 챙김", [...dd.offerings, dd.offerings_other].filter(Boolean).join(", ")],
          ["경비", CAMPUS_COUNTS.map(([k, label]) => `${label.replace(" 횟수", "")} ${dd.counts[k] ?? "-"}`).join(", ")],
          ["숙소", dd.lodging],
          ["토요일 예배팀 모임", [...dd.saturday, dd.saturday_other].filter(Boolean).join(", ")],
          ...CAMPUS_SECTIONS.map(([k,label])=>[label,dd.sections?.[k]??""] as [string,string]),
          ...CAMPUS_TEXTS.map(([k, label]) => [label, dd.texts[k]] as [string, string]),
        ]}
      />
    );
  }

  return (
    <>
      <BackLink href={`/groups/${report.group_id}?week=${weekOf(report.meeting_date)}`}>{group.name}</BackLink>
      <PageTitle sub={`${group.parent ? `${group.parent.name} · ` : ""}${group.name} · ${formatDate(report.meeting_date)} · ${getReportIdentity(report.details,report.author?.real_name).author_name}`}>
        <span className="flex items-center gap-2">
          {title}
          <Badge tone={report.status === "draft" ? "danger" : report.status === "reviewed" ? "accent" : "muted"}>
            {REPORT_STATUS_LABEL[report.status]}
          </Badge>
        </span>
      </PageTitle>

      <p className="mb-4 text-xs text-muted">담당 파트: {getReportIdentity(report.details).duty_part || "미입력"} · 최종 수정: {getReportIdentity(report.details,report.author?.real_name).last_editor_name || getReportIdentity(report.details,report.author?.real_name).author_name} · {new Date(report.updated_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</p>
      {group.type === "worship" ? <TeamIssues canWrite={canEdit && Boolean(teamWriteRes.data)} items={(incidentResult?.data ?? []) as Incident[]} groups={teamGroups} error={Boolean(incidentResult?.error)} context={{report_id:id,group_id:group.id,occurred_on:report.meeting_date,service_id:report.service_type_id ?? "",service_name:serviceName}} today={todayKST()}/> : null}

      <div className="mb-4 flex flex-col gap-2">
        {editMode && group.type === "education" && !teamWriteRes.data ? <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">출결 명단은 담당 파트 배정 후 사용할 수 있습니다. 작성한 내용은 임시저장할 수 있습니다.</p> : null}
        {saved === "submit" && report.status !== "draft" && canEdit ? <SubmissionReceipt returnTo={`/groups/${group.id}?week=${weekOf(report.meeting_date)}`}/> : null}
        {message ? <ErrorText>{message}</ErrorText> : null}
        {existing ? <p className="rounded-lg bg-border/60 px-3 py-2 text-sm">이미 작성 중인 같은 보고가 있어서 이어서 엽니다.</p> : null}
        {saved ? (
          <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
            {saved === "submit" ? "제출했습니다. 확인 처리 전까지는 수정할 수 있습니다." : "임시저장했습니다."}
          </p>
        ) : null}
        {reviewed ? (
          <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
            {reviewed === "true" ? "확인 처리했습니다." : "확인을 취소했습니다. 작성자가 다시 수정할 수 있습니다."}
          </p>
        ) : null}
        {!canEdit && report.status === "reviewed" ? (
          <p className="rounded-lg bg-border/60 px-3 py-2 text-sm text-muted">검토자가 확인한 보고라 수정할 수 없습니다.</p>
        ) : null}
      </div>

      {canReview && report.status !== "draft" ? (
        <ReviewPanel reportId={id} status={report.status} canEditAsReviewer={canEdit && !isAuthor} editing={editMode && !isAuthor} />
      ) : null}

      <PrivateSharing reportId={id}/>
      {messagesToMe.map((m) => (
        <Card key={m.recipient} className="mb-4 border-accent/40">
          <p className="mb-1 text-xs font-medium text-accent">{m.recipient === "pastor" ? "담임 목사님께 드리는 글" : "담임 사모님께 드리는 글"}</p>
          <p className="whitespace-pre-wrap text-sm">{m.body}</p>
        </Card>
      ))}

      {body}

      {report.status !== "draft" || isAuthor ? <Comments reportId={id} myId={profile.id} isSenior={isSenior(profile)} canComment={isClergy(profile)} /> : null}

      {isAuthor && report.status === "draft" ? (
        <form action={deleteDraft} className="mt-6 flex justify-center">
          <input type="hidden" name="reportId" value={id} />
          <button type="submit" className={`${smallButtonClass} text-danger`}>
            이 임시저장 보고 삭제
          </button>
        </form>
      ) : null}
    </>
  );
}

function ReadOnly({ rows }: { rows: [string, string][] }) {
  return (
    <Card>
      <dl className="flex flex-col gap-3 text-sm">
        {rows
          .filter(([, value]) => value)
          .map(([label, value], i) => (
            <div key={`${label}-${i}`}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
      </dl>
    </Card>
  );
}
