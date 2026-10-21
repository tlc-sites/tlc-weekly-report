import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BackLink, Badge, Card, ErrorText, Loading, PageTitle, buttonClass, pickMessage, secondaryButtonClass } from "@/components/ui";
import { requireAdmin, isSenior } from "@/lib/auth";
import { ROLE_LABEL, listGroupsOrdered } from "@/lib/groups";
import { saveMemberships, setRecipientRole, setMinister, setUserAdmin, setUserStatus } from "../actions";

const MESSAGES: Record<string, string> = {
  invalid: "입력값이 올바르지 않습니다.",
  save: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "own-admin": "자기 자신의 관리자 권한은 해제할 수 없습니다. 다른 관리자에게 요청해 주세요.",
  "own-memberships": "현재 계정은 본인의 소속·역할을 변경할 수 없습니다. 담당 파트 배정은 담임목사님·사모님 권한으로 처리해야 합니다. 잠시 후 재시도해도 저장되지 않습니다.",
  "assignment-permission": "소속을 저장할 권한이 없습니다. 로그인 계정의 관리 권한을 확인해 주세요.",
};

type UserDetail = {
  id: string;
  real_name: string | null;
  email: string | null;
  status: "pending" | "active" | "disabled";
  is_admin: boolean;
  is_minister: boolean;
  recipient_role: "pastor" | "pastor_wife" | null;
  memberships: { group_id: string; role: keyof typeof ROLE_LABEL }[];
};

export default function AdminUserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <AdminUserContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminUserContent({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const { supabase, profile: me } = await requireAdmin();
  const [{ id }, { error, saved }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [{ data: user }, groups] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, real_name, email, status, is_admin, is_minister, recipient_role, memberships(group_id, role)")
      .eq("id", id)
      .maybeSingle<UserDetail>(),
    listGroupsOrdered(supabase),
  ]);
  if (!user) notFound();

  const roleByGroup = new Map(user.memberships.map((m) => [m.group_id, m.role]));
  const message = pickMessage(MESSAGES, error);
  const isMe = user.id === me.id;
  const ownAssignmentsLocked = isMe && !isSenior(me);

  return (
    <>
      <BackLink href="/admin/users">사용자 관리</BackLink>
      <PageTitle sub={user.email ?? undefined}>
        <span className="flex items-center gap-2">
          {user.real_name ?? "(이름 미입력)"}
          {user.is_admin ? <Badge tone="accent">관리자</Badge> : null}
          {user.is_minister ? <Badge tone="accent">교역자</Badge> : null}
          {user.recipient_role ? <Badge tone="accent">{user.recipient_role === "pastor" ? "담임목사님" : "사모님"}</Badge> : null}
          {user.status !== "active" ? <Badge tone="danger">{user.status === "pending" ? "승인 대기" : "사용 중지"}</Badge> : null}
        </span>
      </PageTitle>
      <div className="mb-4 flex flex-col gap-2">
        {message ? <ErrorText>{message}</ErrorText> : null}
        {saved ? <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">저장했습니다.</p> : null}
      </div>

      {isSenior(me) && user.status === "active" ? <Card className="mb-4"><form action={setMinister} className="flex items-center justify-between gap-3">
        <input type="hidden" name="userId" value={user.id}/><input type="hidden" name="enabled" value={String(!user.is_minister)}/>
        <div><p className="font-semibold">교역자 역할</p><p className="text-xs text-muted">담당 파트 수정·확인과 목회 피드백 작성. 다른 파트는 동급 작성 보고 또는 공개받은 내용만 열람합니다.</p></div>
        <button className={secondaryButtonClass}>{user.is_minister ? "교역자 해제" : "교역자 지정"}</button>
      </form></Card> : null}
      {isSenior(me) && user.status === "active" && !isMe ? <Card className="mb-4"><form action={setRecipientRole} className="flex flex-col gap-2">
        <input type="hidden" name="userId" value={user.id}/><label className="text-sm font-semibold">최상단 역할<select name="role" defaultValue={user.recipient_role ?? ""} className="mt-1 w-full rounded-xl border border-border bg-surface p-2"><option value="">해당 없음</option><option value="pastor">담임목사님</option><option value="pastor_wife">사모님</option></select></label>
        <p className="text-xs text-muted">모든 비공개 내용과 관리 기능에 접근합니다. 같은 역할의 기존 지정은 해제됩니다.</p><button className={secondaryButtonClass}>최상단 역할 저장</button>
      </form></Card> : null}
      <h2 className="mb-2 text-sm font-semibold">소속과 역할</h2>
      {ownAssignmentsLocked ? <div role="note" className="mb-3 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">
        <p className="font-semibold">본인의 소속·역할은 여기서 변경할 수 없습니다.</p>
        <p className="mt-1 text-muted">담임목사님·사모님 권한으로 담당 파트를 배정해야 합니다. 아래는 현재 배정 상태입니다.</p>
        {!user.memberships.length ? <p className="mt-2 text-muted">담당 파트는 아직 없습니다. 관리자 제출현황과 승인된 셋업용 임시 열람은 홈에서 확인할 수 있습니다.</p> : null}
      </div> : null}
      <Card className="mb-6">
        <form action={saveMemberships} className="flex flex-col gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <p className="mb-1 text-xs text-muted">
            상위 그룹 배정은 하위 그룹에 상속됩니다. 파트총괄은 열람만 가능하며, 교역자에게 배정한 담당 파트는 비공개 내용 열람 범위가 됩니다. 본인 소속 변경은 담임목사님·사모님께 요청해 주세요.
          </p>
          {groups.map((g) => (
            <label key={g.id} className={`flex items-center justify-between gap-3 text-sm ${g.depth ? "pl-4" : "font-medium"}`}>
              <span>{g.depth ? g.name : g.label}</span>
              <select
                name={`role:${g.id}`}
                defaultValue={roleByGroup.get(g.id) ?? ""}
                disabled={ownAssignmentsLocked}
                className="h-9 rounded-lg border border-border bg-surface px-2"
              >
                <option value="">-</option>
                <option value="writer">{ROLE_LABEL.writer}</option>
                <option value="reviewer">{ROLE_LABEL.reviewer}</option>
              </select>
            </label>
          ))}
          {!ownAssignmentsLocked ? <button type="submit" className={`${buttonClass} mt-2`}>
            소속 저장
          </button> : null}
        </form>
      </Card>

      {user.status === "active" ? (
        <Card className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">관리자 권한</p>
            <p className="text-xs text-muted">가입 승인, 그룹·예배·기능 관리 (내용 열람 권한과 별도)</p>
          </div>
          <form action={setUserAdmin}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="isAdmin" value={String(!user.is_admin)} />
            <button type="submit" disabled={isMe && user.is_admin} className={`${secondaryButtonClass} h-9 text-xs`}>
              {user.is_admin ? "관리자 해제" : "관리자로 지정"}
            </button>
          </form>
        </Card>
      ) : null}

      {!isMe && user.status !== "pending" ? (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{user.status === "active" ? "사용 중지" : "다시 사용"}</p>
          <form action={setUserStatus}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="status" value={user.status === "active" ? "disabled" : "active"} />
            <button type="submit" className={`${secondaryButtonClass} h-9 text-xs`}>
              {user.status === "active" ? "사용 중지" : "다시 사용"}
            </button>
          </form>
        </Card>
      ) : null}
    </>
  );
}
