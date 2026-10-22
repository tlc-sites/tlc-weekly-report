import { ArchiveGroupButton } from "@/components/archive-group-button";
import { Suspense } from "react";
import Link from "@/components/pending-link";
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
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { GROUP_TYPE_LABEL, ROLE_LABEL, SCHEDULE_LABEL, getGroup } from "@/lib/groups";
import { WEEKDAY_LABEL } from "@/lib/services";
import { archiveGroup, addMeetingType, setGroupServices, toggleMeetingType, updateGroup } from "../actions";
import { GROUP_MESSAGES } from "../messages";

export default function AdminGroupPage({ params, searchParams }: PageProps<"/admin/groups/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <AdminGroupContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type MemberRow = { role: keyof typeof ROLE_LABEL; profile: { id: string; real_name: string | null } | null };

async function AdminGroupContent({ params, searchParams }: PageProps<"/admin/groups/[id]">) {
  const { supabase } = await requireAdmin();
  const [{ id }, { error, saved }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const group = await getGroup(supabase, id);
  if (!group) notFound();

  const [parent, children, services, linked, meetingTypes, members] = await Promise.all([
    group.parent_id ? getGroup(supabase, group.parent_id) : Promise.resolve(null),
    supabase.from("groups").select("id").eq("parent_id", id).then((r) => r.data ?? []),
    supabase
      .from("service_types")
      .select("id, name, weekday, is_active")
      .order("sort_order")
      .then((r) => r.data ?? []),
    supabase
      .from("group_service_types")
      .select("service_type_id")
      .eq("group_id", id)
      .then((r) => new Set((r.data ?? []).map((x) => x.service_type_id as string))),
    supabase
      .from("group_meeting_types")
      .select("id, name, weekday, is_active")
      .eq("group_id", id)
      .order("sort_order")
      .order("name")
      .then((r) => r.data ?? []),
    supabase
      .from("memberships")
      .select("role, profile:profiles(id, real_name)")
      .eq("group_id", id)
      .returns<MemberRow[]>()
      .then((r) => r.data ?? []),
  ]);

  const message = pickMessage(GROUP_MESSAGES, error);
  const reportsHere = children.length === 0; // 보고는 하위 그룹(또는 하위가 없는 그룹)에서 한다

  return (
    <>
      <BackLink href="/admin/groups">그룹 관리</BackLink>
      <PageTitle sub={`${GROUP_TYPE_LABEL[group.type]}${parent ? ` · ${parent.name} 소속` : " · 최상위 그룹"}`}>
        {group.name}
      </PageTitle>
      <div className="mb-4 flex flex-col gap-2">
        {message ? <ErrorText>{message}</ErrorText> : null}
        {saved ? <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">저장했습니다.</p> : null}
      </div>

      <Card className="mb-6">
        <form action={updateGroup} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={group.id} />
          <Field label="이름">
            <input name="name" required maxLength={50} defaultValue={group.name} className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="보고 주기">
              <select name="schedule" defaultValue={group.schedule} className={selectClass}>
                <option value="weekly">{SCHEDULE_LABEL.weekly}</option>
                <option value="irregular">{SCHEDULE_LABEL.irregular}</option>
              </select>
            </Field>
            <Field label="정렬 순서">
              <input
                name="sortOrder"
                type="number"
                min={0}
                max={9999}
                defaultValue={group.sort_order}
                className={inputClass}
              />
            </Field>
          </div>
          {group.type === "education" && reportsHere ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="guardianCheck"
                defaultChecked={Boolean(group.settings.guardian_check)}
                className="size-5 accent-accent"
              />
              출석 체크할 때 &apos;보호자 동반&apos; 표시 사용
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={group.is_active} className="size-5 accent-accent" />
            사용 중 (끄면 목록과 가입 신청에서 숨겨지고, 과거 보고는 남습니다)
          </label>
          <button type="submit" className={buttonClass}>
            저장
          </button>
        </form>
      </Card>

      {reportsHere ? (
        <>
          <h2 className="mb-2 text-sm font-semibold">보고할 예배</h2>
          <Card className="mb-6">
            <form action={setGroupServices} className="flex flex-col gap-1">
              <input type="hidden" name="id" value={group.id} />
              {services.map((s) => (
                <label key={s.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    name="serviceIds"
                    value={s.id}
                    defaultChecked={linked.has(s.id)}
                    className="size-5 accent-accent"
                  />
                  <span className={s.is_active ? "" : "text-muted line-through"}>
                    {s.name}
                  </span>
                  {s.weekday !== null ? <Badge>{WEEKDAY_LABEL[s.weekday]}</Badge> : null}
                </label>
              ))}
              <button type="submit" className={`${buttonClass} mt-2`}>
                예배 선택 저장
              </button>
            </form>
          </Card>

          <h2 className="mb-2 text-sm font-semibold">그룹 고유 모임</h2>
          <Card className="mb-6">
            {meetingTypes.length ? (
              <ul className="mb-3 flex flex-col divide-y divide-border">
                {meetingTypes.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <span className={m.is_active ? "" : "text-muted line-through"}>
                      {m.name}
                      {m.weekday !== null ? <span className="ml-2 text-xs text-muted">{WEEKDAY_LABEL[m.weekday]}</span> : null}
                    </span>
                    <form action={toggleMeetingType}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="groupId" value={group.id} />
                      <input type="hidden" name="isActive" value={String(!m.is_active)} />
                      <button type="submit" className={smallButtonClass}>
                        {m.is_active ? "사용 중지" : "다시 사용"}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-muted">예: 중고등부 토요모임, 수련회</p>
            )}
            <form action={addMeetingType} className="flex gap-2">
              <input type="hidden" name="groupId" value={group.id} />
              <input name="name" required maxLength={50} placeholder="모임 이름" className={inputClass} />
              <select name="weekday" defaultValue="" className={`${selectClass} w-24 shrink-0`}>
                <option value="">요일</option>
                {WEEKDAY_LABEL.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
              <button type="submit" className={`${buttonClass} shrink-0`}>
                추가
              </button>
            </form>
          </Card>
        </>
      ) : null}

      <h2 className="mb-2 text-sm font-semibold">소속 사용자 {members.length}명</h2>
      <Card className="mb-6">
        {members.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {members.map((m) =>
              m.profile ? (
                <li key={m.profile.id}>
                  <Link href={`/admin/users/${m.profile.id}`} className="flex items-center justify-between py-2">
                    <span>{m.profile.real_name}</span>
                    <span className="text-xs text-muted">{ROLE_LABEL[m.role]} ›</span>
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted">아직 배정된 사용자가 없습니다. 사용자 관리에서 배정할 수 있습니다.</p>
        )}
      </Card>

      {group.is_active ? <ArchiveGroupButton id={group.id} name={group.name} action={archiveGroup} /> : null}
      {group.type === "education" && reportsHere ? (
        <Link href={`/groups/${group.id}/members`} className="text-sm text-accent underline underline-offset-4">
          {group.name} 명단 관리 →
        </Link>
      ) : null}
    </>
  );
}
