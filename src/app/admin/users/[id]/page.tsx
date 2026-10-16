import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BackLink, Badge, Card, ErrorText, Loading, PageTitle, buttonClass, pickMessage, secondaryButtonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL, listGroupsOrdered } from "@/lib/groups";
import { saveMemberships, setUserAdmin, setUserStatus } from "../actions";

const MESSAGES: Record<string, string> = {
  invalid: "입력값이 올바르지 않습니다.",
  save: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "own-admin": "자기 자신의 관리자 권한은 해제할 수 없습니다. 다른 관리자에게 요청해 주세요.",
};

type UserDetail = {
  id: string;
  real_name: string | null;
  email: string | null;
  status: "pending" | "active" | "disabled";
  is_admin: boolean;
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
      .select("id, real_name, email, status, is_admin, memberships(group_id, role)")
      .eq("id", id)
      .maybeSingle<UserDetail>(),
    listGroupsOrdered(supabase),
  ]);
  if (!user) notFound();

  const roleByGroup = new Map(user.memberships.map((m) => [m.group_id, m.role]));
  const message = pickMessage(MESSAGES, error);
  const isMe = user.id === me.id;

  return (
    <>
      <BackLink href="/admin/users">사용자 관리</BackLink>
      <PageTitle sub={user.email ?? undefined}>
        <span className="flex items-center gap-2">
          {user.real_name ?? "(이름 미입력)"}
          {user.is_admin ? <Badge tone="accent">관리자</Badge> : null}
          {user.status !== "active" ? <Badge tone="danger">{user.status === "pending" ? "승인 대기" : "사용 중지"}</Badge> : null}
        </span>
      </PageTitle>
      <div className="mb-4 flex flex-col gap-2">
        {message ? <ErrorText>{message}</ErrorText> : null}
        {saved ? <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">저장했습니다.</p> : null}
      </div>

      <h2 className="mb-2 text-sm font-semibold">소속과 역할</h2>
      <Card className="mb-6">
        <form action={saveMemberships} className="flex flex-col gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <p className="mb-1 text-xs text-muted">
            상위 그룹(예: 교육부 전체)에 배정하면 하위 그룹 전체에 같은 역할이 적용됩니다.
          </p>
          {groups.map((g) => (
            <label key={g.id} className={`flex items-center justify-between gap-3 text-sm ${g.depth ? "pl-4" : "font-medium"}`}>
              <span>{g.depth ? g.name : g.label}</span>
              <select
                name={`role:${g.id}`}
                defaultValue={roleByGroup.get(g.id) ?? ""}
                className="h-9 rounded-lg border border-border bg-surface px-2"
              >
                <option value="">-</option>
                <option value="writer">{ROLE_LABEL.writer}</option>
                <option value="reviewer">{ROLE_LABEL.reviewer}</option>
              </select>
            </label>
          ))}
          <button type="submit" className={`${buttonClass} mt-2`}>
            소속 저장
          </button>
        </form>
      </Card>

      {user.status === "active" ? (
        <Card className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-medium">관리자 권한</p>
            <p className="text-xs text-muted">전체 보고 열람, 가입 승인, 그룹·예배 관리</p>
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
