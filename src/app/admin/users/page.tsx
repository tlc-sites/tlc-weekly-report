import { Suspense } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { Card, ErrorText, Loading, PageTitle, buttonClass, secondaryButtonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABEL, listGroupsOrdered } from "@/lib/groups";
import { approveUser, setUserStatus } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "입력값이 올바르지 않습니다.",
  "no-group": "소속을 하나 이상 배정하거나 관리자로 지정해 주세요.",
  save: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

type UserRow = {
  id: string;
  real_name: string | null;
  email: string | null;
  status: "pending" | "active" | "disabled";
  is_admin: boolean;
  requested_group_ids: string[];
  created_at: string;
  memberships: { group_id: string; role: keyof typeof ROLE_LABEL }[];
};

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<Loading />}>
      <AdminUsersContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminUsersContent({ searchParams }: Pick<PageProps<"/admin/users">, "searchParams">) {
  const { supabase, profile: me } = await requireAdmin();

  const [{ error: errorCode }, groups, { data: users, error }, { data: pushStatus }] = await Promise.all([
    searchParams,
    listGroupsOrdered(supabase),
    supabase
      .from("profiles")
      .select("id, real_name, email, status, is_admin, requested_group_ids, created_at, memberships(group_id, role)")
      .order("created_at")
      .returns<UserRow[]>(),
    supabase.rpc("push_status"),
  ]);
  if (error) throw error;

  const message = typeof errorCode === "string" ? ERRORS[errorCode] : undefined;
  const groupLabel = new Map(groups.map((g) => [g.id, g.label]));
  const pending = (users ?? []).filter((u) => u.status === "pending");
  const active = (users ?? []).filter((u) => u.status === "active");
  const disabled = (users ?? []).filter((u) => u.status === "disabled");
  const noPush = ((pushStatus ?? []) as { user_id: string; real_name: string | null; devices: number }[]).filter((p) => p.devices === 0);

  return (
    <>
      <Link href="/" className="mb-3 text-sm text-muted">
        ← 홈
      </Link>
      <PageTitle>사용자 관리</PageTitle>
      <AdminNav current="/admin/users" />
      {message ? (
        <div className="mb-4">
          <ErrorText>{message}</ErrorText>
        </div>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold">승인 대기 {pending.length}명</h2>
      <div className="mb-8 flex flex-col gap-3">
        {pending.length === 0 ? <p className="text-sm text-muted">대기 중인 신청이 없습니다.</p> : null}
        {pending.map((u) => {
          const requested = new Set(u.requested_group_ids);
          return (
            <Card key={u.id}>
              <form action={approveUser} className="flex flex-col gap-3">
                <input type="hidden" name="userId" value={u.id} />
                <div>
                  <p className="font-semibold">{u.real_name ?? "(이름 미입력)"}</p>
                  <p className="text-xs text-muted">
                    {u.email ?? "-"} · 신청 {new Date(u.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {groups
                    .filter((g) => requested.has(g.id))
                    .map((g) => (
                      <RoleSelect key={g.id} groupId={g.id} label={g.label} defaultRole="writer" />
                    ))}
                  {requested.size === 0 ? <p className="text-sm text-muted">신청한 소속이 없습니다.</p> : null}
                </div>

                <details>
                  <summary className="cursor-pointer text-sm text-muted">다른 소속 추가</summary>
                  <div className="mt-2 flex flex-col gap-2">
                    {groups
                      .filter((g) => !requested.has(g.id))
                      .map((g) => (
                        <RoleSelect key={g.id} groupId={g.id} label={g.label} defaultRole="" />
                      ))}
                  </div>
                </details>

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="makeAdmin" className="size-4 accent-accent" />
                  관리자로 지정
                </label>

                <button type="submit" className={buttonClass}>
                  승인
                </button>
              </form>
            </Card>
          );
        })}
      </div>

      <h2 className="mb-2 text-sm font-semibold">사용 중 {active.length}명</h2>
      <Card className="mb-8">
        <ul className="flex flex-col divide-y divide-border">
          {active.map((u) => (
            <li key={u.id} className="flex items-start justify-between gap-3 py-3">
              <Link href={`/admin/users/${u.id}`} className="min-w-0 flex-1">
                <p className="font-medium">
                  {u.real_name}
                  {u.is_admin ? <span className="ml-2 text-xs text-accent">관리자</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {u.memberships.length
                    ? u.memberships.map((m) => `${groupLabel.get(m.group_id) ?? "?"} ${ROLE_LABEL[m.role]}`).join(", ")
                    : "소속 없음"}
                </p>
              </Link>
              {u.id !== me.id ? (
                <form action={setUserStatus}>
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="status" value="disabled" />
                  <button type="submit" className={`${secondaryButtonClass} h-9 shrink-0 text-xs`}>
                    사용 중지
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <h2 className="mb-2 text-sm font-semibold">알림 미설정 {noPush.length}명</h2>
      <Card className="mb-8">
        {noPush.length ? (
          <p className="text-sm leading-relaxed">
            {noPush.map((p) => p.real_name).join(", ")}
            <span className="mt-2 block text-xs text-muted">
              알림을 켠 기기가 없는 사람입니다. 단톡방으로 &quot;홈 → 알림 설정에서 알림 켜기&quot;를 안내해 주세요.
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted">모두 알림을 켰습니다.</p>
        )}
      </Card>

      {disabled.length ? (
        <>
          <h2 className="mb-2 text-sm font-semibold">사용 중지 {disabled.length}명</h2>
          <Card>
            <ul className="flex flex-col divide-y divide-border">
              {disabled.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-3">
                  <span className="text-muted">{u.real_name ?? u.email}</span>
                  <form action={setUserStatus}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="status" value="active" />
                    <button type="submit" className={`${secondaryButtonClass} h-9 text-xs`}>
                      다시 사용
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}

function RoleSelect({ groupId, label, defaultRole }: { groupId: string; label: string; defaultRole: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <select
        name={`role:${groupId}`}
        defaultValue={defaultRole}
        className="h-9 rounded-lg border border-border bg-surface px-2"
      >
        <option value="">배정 안 함</option>
        <option value="writer">{ROLE_LABEL.writer}</option>
        <option value="reviewer">{ROLE_LABEL.reviewer}</option>
      </select>
    </label>
  );
}
