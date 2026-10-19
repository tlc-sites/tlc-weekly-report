import { GroupPicker } from "@/components/group-picker";
import { Suspense } from "react";

import { AdminNav } from "@/components/admin-nav";
import {
  BackLink,
  Card,
  ErrorText,
  Field,
  Loading,
  PageTitle,
  buttonClass,
  inputClass,
  pickMessage,
  selectClass,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { GROUP_TYPE_LABEL, SCHEDULE_LABEL, listGroupsOrdered } from "@/lib/groups";
import { createGroup } from "./actions";
import { GROUP_MESSAGES } from "./messages";

export default function AdminGroupsPage({ searchParams }: PageProps<"/admin/groups">) {
  return (
    <Suspense fallback={<Loading />}>
      <AdminGroupsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminGroupsContent({ searchParams }: Pick<PageProps<"/admin/groups">, "searchParams">) {
  const { supabase } = await requireAdmin();
  const [{ error }, groups] = await Promise.all([searchParams, listGroupsOrdered(supabase, { includeInactive: true })]);
  const message = pickMessage(GROUP_MESSAGES, error);
  const roots = groups.filter((g) => g.depth === 0 && g.is_active);

  return (
    <>
      <BackLink href="/">홈</BackLink>
      <PageTitle>그룹 관리</PageTitle>
      <AdminNav current="/admin/groups" />
      {message ? (
        <div className="mb-4">
          <ErrorText>{message}</ErrorText>
        </div>
      ) : null}

      <Card className="mb-6">
        <GroupPicker groups={groups} base="/admin/groups" />
      </Card>

      <h2 className="mb-2 text-sm font-semibold">그룹 추가</h2>
      <Card>
        <form action={createGroup} className="flex flex-col gap-3">
          <Field label="이름">
            <input name="name" required maxLength={50} placeholder="예: 청소년부, 방송, 선교회" className={inputClass} />
          </Field>
          <Field label="상위 그룹" hint="상위 그룹을 고르면 유형은 상위 그룹을 따릅니다.">
            <select name="parentId" defaultValue="" className={selectClass}>
              <option value="">없음 (최상위 그룹)</option>
              {roots.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="유형 (최상위 그룹일 때)">
            <select name="type" defaultValue="other" className={selectClass}>
              {Object.entries(GROUP_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="보고 주기" hint="주간 그룹만 미제출 알림 대상이 됩니다.">
            <select name="schedule" defaultValue="weekly" className={selectClass}>
              <option value="weekly">{SCHEDULE_LABEL.weekly}</option>
              <option value="irregular">{SCHEDULE_LABEL.irregular}</option>
            </select>
          </Field>
          <button type="submit" className={buttonClass}>
            추가
          </button>
        </form>
      </Card>
    </>
  );
}
