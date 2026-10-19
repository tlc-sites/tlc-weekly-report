import { MemberCards } from "@/components/member-cards";
import { Suspense } from "react";
import Link from "next/link";
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
  smallButtonClass,
  textareaClass,
} from "@/components/ui";
import { getGroupAccess } from "@/lib/access";
import { requireActive } from "@/lib/auth";
import { getGroup } from "@/lib/groups";
import { FOLLOW_UP_LABEL, KIND_LABEL, MEMBER_COLUMNS, type Member } from "@/lib/members";
import { addMembersBulk, quickSetStatus } from "./actions";

const MESSAGES: Record<string, string> = {
  invalid: "입력값이 올바르지 않습니다.",
  empty: "등록할 이름을 한 줄에 하나씩 입력해 주세요.",
  "too-many": "한 번에 100명까지, 이름은 30자까지 등록할 수 있습니다.",
  save: "저장하지 못했습니다. 권한이 있는지 확인하고 다시 시도해 주세요.",
};

export default function MembersPage({ params, searchParams }: PageProps<"/groups/[id]/members">) {
  return (
    <Suspense fallback={<Loading />}>
      <MembersContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function MembersContent({ params, searchParams }: PageProps<"/groups/[id]/members">) {
  const { supabase } = await requireActive();
  const [{ id }, { error, added, skipped }] = await Promise.all([params, searchParams]);
  const { group, canReview, isLeaf } = await getGroupAccess(supabase, id);
  if (group.type !== "education" || !isLeaf) notFound();

  const [parent, { data, error: loadError }] = await Promise.all([
    group.parent_id ? getGroup(supabase, group.parent_id) : Promise.resolve(null),
    supabase.from("members").select(MEMBER_COLUMNS).eq("group_id", id).order("class_name").order("name"),
  ]);
  if (loadError) throw loadError;
  const members = (data ?? []) as Member[];

  const students = members.filter((m) => m.status === "active" && m.kind === "student");
  const teachers = members.filter((m) => m.status === "active" && m.kind === "teacher");
  const newcomers = members.filter((m) => m.status === "newcomer");
  const inactive = members.filter((m) => m.status === "inactive");
  const message = pickMessage(MESSAGES, error);

  return (
    <>
      <BackLink href="/">홈</BackLink>
      <PageTitle sub={`${parent ? `${parent.name} · ` : ""}재적 학생 ${students.length + newcomers.length}명 · 교사 ${teachers.length}명`}>
        {group.name} 명단
      </PageTitle>

      <div className="mb-4 flex flex-col gap-2">
        {message ? <ErrorText>{message}</ErrorText> : null}
        {typeof added === "string" ? (
          <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
            {added}명을 등록했습니다.
            {skipped && skipped !== "0" ? ` 이미 있는 이름 ${skipped}명은 건너뛰었습니다.` : ""}
          </p>
        ) : null}
      </div>

      <Link href={`/groups/${id}#new-report`} className={`${buttonClass} mb-4`}>출결 관리 · 예배 선택</Link>
      <MemberCards members={members} groupId={id} />
      <MemberSection title="학생" members={students} groupId={id} />
      {newcomers.length ? <MemberSection title="새친구" members={newcomers} groupId={id} showFollowUp /> : null}
      <MemberSection title="교사" members={teachers} groupId={id} />

      {inactive.length ? (
        <details className="mb-6">
          <summary className="mb-2 cursor-pointer text-sm font-semibold text-muted">비활성 {inactive.length}명</summary>
          <Card>
            <ul className="flex flex-col divide-y divide-border">
              {inactive.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/groups/${id}/members/${m.id}`} className="text-muted">
                    {m.name}
                    {m.left_at ? <span className="ml-2 text-xs">{m.left_at} 비활성</span> : null}
                  </Link>
                  {canReview ? (
                    <form action={quickSetStatus}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="groupId" value={id} />
                      <input type="hidden" name="status" value="active" />
                      <button type="submit" className={smallButtonClass}>
                        다시 활동
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </details>
      ) : null}

      {canReview ? (
        <>
          <h2 className="mb-2 text-sm font-semibold">명단 등록</h2>
          <Card>
            <form action={addMembersBulk} className="flex flex-col gap-3">
              <input type="hidden" name="groupId" value={id} />
              <Field label="이름" hint="한 줄에 한 명씩, 한 번에 100명까지 붙여 넣을 수 있습니다.">
                <textarea name="names" required rows={6} placeholder={"김하늘\n이바다\n박나무"} className={textareaClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="구분">
                  <select name="kind" defaultValue="student" className={selectClass}>
                    <option value="student">{KIND_LABEL.student}</option>
                    <option value="teacher">{KIND_LABEL.teacher}</option>
                  </select>
                </Field>
                <Field label="반 (선택)">
                  <input name="className" maxLength={30} placeholder="예: 1반" className={inputClass} />
                </Field>
              </div>
              <button type="submit" className={buttonClass}>
                등록
              </button>
            </form>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted">명단 등록과 수정은 부서 검토자가 할 수 있습니다. 새친구는 보고 작성 화면에서 추가합니다.</p>
      )}
    </>
  );
}

function MemberSection({
  title,
  members,
  groupId,
  showFollowUp = false,
}: {
  title: string;
  members: Member[];
  groupId: string;
  showFollowUp?: boolean;
}) {
  // 반이 하나라도 있으면 반별로 묶어서 보여 준다
  const byClass = new Map<string, Member[]>();
  for (const m of members) {
    const key = m.class_name ?? "";
    byClass.set(key, [...(byClass.get(key) ?? []), m]);
  }
  const grouped = byClass.size > 1 || (byClass.size === 1 && !byClass.has(""));

  return (
    <>
      <h2 className="mb-2 text-sm font-semibold">
        {title} {members.length}명
      </h2>
      <Card className="mb-6">
        {members.length === 0 ? <p className="text-sm text-muted">아직 없습니다.</p> : null}
        {[...byClass.entries()].map(([className, list]) => (
          <div key={className || "-"} className="mb-1 last:mb-0">
            {grouped ? <p className="mt-2 mb-1 text-xs font-medium text-muted">{className || "반 없음"}</p> : null}
            <ul className="flex flex-wrap gap-2">
              {list.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/groups/${groupId}/members/${m.id}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"
                  >
                    {m.name}
                    {m.grade ? <span className="text-xs text-muted">{m.grade}</span> : null}
                    {showFollowUp && m.follow_up_status ? (
                      <Badge tone={m.follow_up_status === "new" ? "danger" : "muted"}>
                        {FOLLOW_UP_LABEL[m.follow_up_status]}
                      </Badge>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>
    </>
  );
}
