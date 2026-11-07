import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Card, ErrorText, Loading, PageTitle, buttonClass, inputClass } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { listGroupsOrdered } from "@/lib/groups";
import { saveRealName, submitOnboarding } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "이름을 입력하고 소속을 하나 이상 선택해 주세요.",
  save: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  name: "이름을 적어 주세요.",
};

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <Suspense fallback={<Loading />}>
      <OnboardingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function OnboardingContent({ searchParams }: Pick<PageProps<"/onboarding">, "searchParams">) {
  const { supabase, profile } = await getSessionProfile();
  if (!profile) redirect("/login");
  // 이미 승인됐는데 이름이 비어 있으면 이름만 받는다.
  if (profile.status === "active" && !profile.real_name?.trim()) {
    const { error } = await searchParams;
    const message = typeof error === "string" ? ERRORS[error] : undefined;
    return (
      <>
        <PageTitle sub="보고서 작성자 이름으로 쓰입니다.">이름을 알려 주세요</PageTitle>
        <form action={saveRealName} className="flex flex-col gap-4">
          {message ? <ErrorText>{message}</ErrorText> : null}
          <Card>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">실명</span>
              <input name="realName" required maxLength={30} placeholder="홍길동" className={inputClass} />
              {profile.email ? <span className="text-xs text-muted">로그인 이메일: {profile.email}</span> : null}
            </label>
          </Card>
          <button type="submit" className={buttonClass}>저장하고 시작하기</button>
        </form>
      </>
    );
  }
  if (profile.status !== "pending") redirect("/");

  const [{ error }, groups] = await Promise.all([searchParams, listGroupsOrdered(supabase)]);
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const requested = new Set(profile.requested_group_ids);

  return (
    <>
      <PageTitle sub="관리자가 확인한 뒤 승인하면 사용할 수 있습니다.">가입 신청</PageTitle>
      <form action={submitOnboarding} className="flex flex-col gap-4">
        {message ? <ErrorText>{message}</ErrorText> : null}

        <Card>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">실명</span>
            <input
              name="realName"
              required
              maxLength={30}
              defaultValue={profile.real_name ?? ""}
              placeholder="홍길동"
              className={inputClass}
            />
            {profile.email ? <span className="text-xs text-muted">로그인 이메일: {profile.email}</span> : null}
          </label>
        </Card>

        <Card>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 text-sm font-medium">섬기는 곳 (여러 개 선택 가능)</legend>
            {groups.map((g) => (
              <label
                key={g.id}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-2 ${g.depth ? "pl-6" : "font-medium"}`}
              >
                <input
                  type="checkbox"
                  name="groupIds"
                  value={g.id}
                  defaultChecked={requested.has(g.id)}
                  className="size-5 accent-accent"
                />
                {g.depth ? g.name : g.label}
              </label>
            ))}
          </fieldset>
        </Card>

        <button type="submit" className={buttonClass}>
          신청하기
        </button>
      </form>
    </>
  );
}
