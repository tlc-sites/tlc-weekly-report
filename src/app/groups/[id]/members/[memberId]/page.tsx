import {TeamMemberFields} from "@/components/team-member-fields";
import {groupDisplayName} from "@/lib/group-display";
import { PhotoInput } from "@/components/photo-input";
import { MemberPhoto } from "@/components/member-photo";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  BackLink,
  Badge,
  Card,
  ErrorText,
  Field,
  Loading,
  PageTitle,
  buttonClass,
  inputClass,
  pickMessage,
  selectClass,
  textareaClass,
} from "@/components/ui";
import { getGroupAccess } from "@/lib/access";
import { requireActive } from "@/lib/auth";
import { listGroupsOrdered } from "@/lib/groups";
import {
  FOLLOW_UP_LABEL,
  GUARDIAN_RELATIONS,
  KIND_LABEL,
  MEMBER_COLUMNS,
  MEMBER_STATUS_LABEL,
  type Guardian,
  type Member,
} from "@/lib/members";
import { saveGuardians, updateFollowUp, updateMember } from "../actions";
import { GuardianForm } from "./guardian-form";

const MESSAGES: Record<string, string> = {
  invalid: "입력값이 올바르지 않습니다.",
  save: "저장하지 못했습니다. 권한이 있는지 확인하고 다시 시도해 주세요.",
  guardian: "보호자 정보를 다시 확인해 주세요. 연락처는 숫자와 -만 쓸 수 있습니다.",
  consent: "연락처를 저장하려면 후속 연락 목적 수집 동의를 받았는지 체크해 주세요.",
};

export default function MemberPage({ params, searchParams }: PageProps<"/groups/[id]/members/[memberId]">) {
  return (
    <Suspense fallback={<Loading />}>
      <MemberContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function MemberContent({ params, searchParams }: PageProps<"/groups/[id]/members/[memberId]">) {
  const { supabase } = await requireActive();
  const [{ id, memberId }, { error, saved }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) notFound();
  const { group, canReview, canWrite } = await getGroupAccess(supabase, id);

  const canEditMember=canReview || (group.type==="worship" && Boolean((await supabase.rpc("can_manage_rehearsal",{gid:id})).data));
  const rosterAccess=await supabase.rpc("can_view_roster",{gid:id});if(!rosterAccess.data)notFound();
  const [{ data: member }, guardians, groups] = await Promise.all([
    supabase.from("members").select(MEMBER_COLUMNS).eq("id", memberId).eq("group_id", id).maybeSingle<Member>(),
    // 보호자 정보는 검토자만 조회된다 (RLS)
    canReview && group.type!=="worship"
      ? supabase
          .from("member_guardians")
          .select("id, member_id, slot, name, relation, contact, note, consent")
          .eq("member_id", memberId)
          .then((r) => (r.data ?? []) as Guardian[])
      : Promise.resolve([] as Guardian[]),
    canEditMember ? listGroupsOrdered(supabase) : Promise.resolve([]),
  ]);
  if (!member) notFound();

  const message = pickMessage(MESSAGES, error);
  const moveTargets = groups.filter((g) => g.type === group.type && (canReview || g.id===id) && g.childCount === 0);
  const guardianBySlot = new Map(guardians.map((g) => [g.slot, g]));

  return (
    <>
      <BackLink href={`/groups/${id}/members`}>{groupDisplayName(group.name)} 명단</BackLink>
      <PageTitle>
        <span className="flex items-center gap-2">
          {member.name}
          <Badge tone={member.status === "inactive" ? "danger" : member.status === "newcomer" ? "accent" : "muted"}>
            {group.type==="worship"?MEMBER_STATUS_LABEL[member.status]:member.kind === "teacher" ? KIND_LABEL.teacher : MEMBER_STATUS_LABEL[member.status]}
          </Badge>
        </span>
      </PageTitle>
      <div className="mb-4 flex flex-col gap-2">
        {message ? <ErrorText>{message}</ErrorText> : null}
        {saved ? <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">저장했습니다.</p> : null}
      </div>

      {canEditMember ? (
        <Card className="mb-6">
          <form action={updateMember} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="groupId" value={id} />
            {group.type==="worship"?<TeamMemberFields member={member}/>:<>
            <PhotoInput initial={member.photo_data} name={member.name} />
            <Field label="생년월일"><input name="birthDate" type="date" min="1900-01-01" max="2100-12-31" defaultValue={member.birth_date ?? ""} className={inputClass} /></Field>
            <Field label="이름">
              <input name="name" required maxLength={30} defaultValue={member.name} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="구분">
                <select name="kind" defaultValue={member.kind} className={selectClass}>
                  <option value="student">{KIND_LABEL.student}</option>
                  <option value="teacher">{KIND_LABEL.teacher}</option>
                </select>
              </Field>
              <Field label="상태">
                <select name="status" defaultValue={member.status} className={selectClass}>
                  {Object.entries(MEMBER_STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="반">
                <input name="className" maxLength={30} defaultValue={member.class_name ?? ""} className={inputClass} />
              </Field>
              <Field label="학년">
                <input name="grade" maxLength={20} defaultValue={member.grade ?? ""} placeholder="예: 중2" className={inputClass} />
              </Field>
              <Field label="출생연도">
                <input
                  name="birthYear"
                  type="number"
                  min={1900}
                  max={2100}
                  defaultValue={member.birth_year ?? ""}
                  className={inputClass}
                />
              </Field>
              <Field label="첫 방문일">
                <input name="firstVisitDate" type="date" defaultValue={member.first_visit_date ?? ""} className={inputClass} />
              </Field>
            </div>
            <Field label="부서" hint="다른 부서를 고르면 그 부서 명단으로 옮겨집니다. 지난 출석 기록은 그대로 남습니다.">
              <select name="newGroupId" defaultValue={id} className={selectClass}>
                {moveTargets.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <FollowUpFields member={member} /></>}
            <button type="submit" className={buttonClass}>
              저장
            </button>
          </form>
        </Card>
      ) : (
        <Card className="mb-6 text-sm">
          {group.type==="worship"?<><p>구분: {member.team_position||"팀원"}</p><p>상태: {MEMBER_STATUS_LABEL[member.status]}</p><p className="whitespace-pre-wrap">후속 메모: {member.follow_up_note||"없음"}</p></>:<>
          <MemberPhoto name={member.name} photo={member.photo_data} large />
          <p className="my-3">생년월일 {member.birth_date ?? (member.birth_year ? member.birth_year + "년" : "미등록")}</p>
          <dl className="grid grid-cols-[5rem_1fr] gap-y-2">
            <dt className="text-muted">반</dt>
            <dd>{member.class_name ?? "-"}</dd>
            <dt className="text-muted">학년</dt>
            <dd>{member.grade ?? "-"}</dd>
            <dt className="text-muted">첫 방문일</dt>
            <dd>{member.first_visit_date ?? "-"}</dd>
          </dl></>}
          {group.type!=="worship" && member.status === "newcomer" && canWrite ? (
            <form action={updateFollowUp} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
              <input type="hidden" name="id" value={member.id} />
              <input type="hidden" name="groupId" value={id} />
              <FollowUpFields member={member} required />
              <button type="submit" className={buttonClass}>
                후속 관리 저장
              </button>
            </form>
          ) : null}
        </Card>
      )}

      {canReview && group.type!=="worship" ? (
        <>
          <h2 className="mb-2 text-sm font-semibold">보호자 (선택)</h2>
          <Card>
            <GuardianForm action={saveGuardians}>
              <input type="hidden" name="memberId" value={member.id} />
              <input type="hidden" name="groupId" value={id} />
              {([1, 2] as const).map((slot) => {
                const g = guardianBySlot.get(slot);
                return (
                  <fieldset key={slot} className="flex flex-col gap-2">
                    <legend className="mb-1 text-xs font-medium text-muted">보호자 {slot}</legend>
                    <div className="grid grid-cols-[1fr_7rem] gap-2">
                      <input name={`g${slot}.name`} maxLength={30} defaultValue={g?.name ?? ""} placeholder="이름" className={inputClass} />
                      <select name={`g${slot}.relation`} defaultValue={g?.relation ?? ""} className={selectClass}>
                        <option value="">관계</option>
                        {GUARDIAN_RELATIONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      name={`g${slot}.contact`}
                      type="tel"
                      maxLength={20}
                      defaultValue={g?.contact ?? ""}
                      placeholder="연락처 010-0000-0000"
                      className={inputClass}
                    />
                    <input
                      name={`g${slot}.note`}
                      maxLength={100}
                      defaultValue={g?.note ?? ""}
                      placeholder="메모 (예: 2부 예배 참석)"
                      className={inputClass}
                    />
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        name={`g${slot}.consent`}
                        defaultChecked={g?.consent ?? false}
                        className="size-4 accent-accent"
                      />
                      후속 연락 목적으로 연락처 수집에 동의받았습니다
                    </label>
                  </fieldset>
                );
              })}
              <p className="text-xs text-muted">보호자 연락처는 부서 검토자와 관리자만 볼 수 있습니다. 칸을 모두 비우면 삭제됩니다.</p>
              <button type="submit" className={buttonClass}>
                보호자 저장
              </button>
            </GuardianForm>
          </Card>
        </>
      ) : null}
    </>
  );
}

function FollowUpFields({ member, required = false }: { member: Member; required?: boolean }) {
  return (
    <>
      <Field label="새친구 후속 상태">
        <select
          name="followUpStatus"
          required={required}
          defaultValue={member.follow_up_status ?? (required ? "new" : "")}
          className={selectClass}
        >
          {required ? null : <option value="">해당 없음</option>}
          {Object.entries(FOLLOW_UP_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="후속 메모">
        <textarea
          name="followUpNote"
          maxLength={1000}
          rows={3}
          defaultValue={member.follow_up_note ?? ""}
          placeholder="건강, 가정사 등 민감한 내용은 적지 마세요"
          className={textareaClass}
        />
      </Field>
    </>
  );
}
