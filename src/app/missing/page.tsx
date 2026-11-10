import { Suspense } from "react";
import Link from "@/components/pending-link";
import { redirect } from "next/navigation";
import { BackLink, Badge, Card, Loading, PageTitle, smallButtonClass } from "@/components/ui";
import { requireActive, isClergy, isSenior } from "@/lib/auth";
import { listGroupsOrdered } from "@/lib/groups";
import { loadMissingReports, MISSING_RANGES } from "@/lib/missing-reports";
import { formatDate } from "@/lib/week";
import { HELP } from "@/lib/help-text";

export default function MissingPage({ searchParams }: PageProps<"/missing">) {
  return (
    <Suspense fallback={<Loading />}>
      <MissingContent searchParams={searchParams} />
    </Suspense>
  );
}

const tabClass = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-xl border px-3 py-2 text-sm font-semibold ${on ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface"}`;

async function MissingContent({ searchParams }: Pick<PageProps<"/missing">, "searchParams">) {
  const { supabase, profile } = await requireActive();
  if (!isClergy(profile)) redirect("/");
  const params = await searchParams;
  const n = MISSING_RANGES.find((r) => String(r) === params.n) ?? 4;
  const view = params.view === "groups" ? "groups" : "people";
  const ordered = await listGroupsOrdered(supabase);
  const data = await loadMissingReports(supabase, profile, new Map(ordered.map((g) => [g.id, g.label])), n);
  const href = (next: { n?: number; view?: string }) => `/missing?${new URLSearchParams({ n: String(next.n ?? n), view: next.view ?? view })}`;
  const weekText = (w: string) => `${formatDate(w)} 주`;
  const total = data.byGroup.reduce((s, g) => s + g.weeks.length, 0);

  return (
    <>
      <BackLink href="/meeting">회의 자료</BackLink>
      <span className="page-wide" hidden />
      <PageTitle info={HELP.missing} sub={`마감 지난 최근 ${n}주 · ${formatDate(data.weeks.at(-1)!)} 주 ~ ${formatDate(data.weeks[0])} 주`}>
        미제출 보고
      </PageTitle>
      <p className="mb-4 text-sm text-muted">
        {isSenior(profile) ? "전체 부서" : "담당하신 부서"}의 미제출 보고입니다. 금요일 오후 5시 마감이 지난 주만 세며, 모임 없음으로 표시한 주와 예배·기술팀은 빠집니다.
      </p>
      <nav className="mb-4 flex flex-wrap items-center gap-2" aria-label="보기 선택">
        <Link href={href({ view: "people" })} className={tabClass(view === "people")} aria-current={view === "people" ? "page" : undefined}>
          사람별
        </Link>
        <Link href={href({ view: "groups" })} className={tabClass(view === "groups")} aria-current={view === "groups" ? "page" : undefined}>
          부서별
        </Link>
        <span className="flex-1" />
        {MISSING_RANGES.map((r) => (
          <Link key={r} href={href({ n: r })} className={`${smallButtonClass} ${r === n ? "border-accent! text-accent" : ""}`} aria-current={r === n ? "page" : undefined}>
            {r}주
          </Link>
        ))}
      </nav>

      {!data.countedGroups ? (
        <Card>
          <p className="text-sm">맡은 부서 중 매주 보고하는 부서가 없습니다.</p>
        </Card>
      ) : !total ? (
        <Card>
          <p className="text-sm">최근 {n}주 동안 미제출 보고가 없습니다.</p>
        </Card>
      ) : view === "people" ? (
        <Card>
          <p className="mb-2 text-sm text-muted">
            미제출 {total}건 · {data.byPerson.filter((p) => p.id).length}명
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {data.byPerson.map((p) => (
              <li key={p.id || "none"} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className={`font-semibold ${p.id ? "" : "text-muted"}`}>{p.name}</p>
                  <Badge tone="danger">미제출 {p.items.length}</Badge>
                </div>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {p.items.map((it) => (
                    <li key={`${it.group.id}|${it.week}`}>
                      <Link href={`/groups/${it.group.id}?week=${it.week}`} className="text-accent">
                        {it.group.label} · {weekText(it.week)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">부서에 작성자로 지정된 분 기준입니다. 한 부서에 작성자가 여러 명이면 모두에게 표시됩니다.</p>
        </Card>
      ) : (
        <Card>
          <p className="mb-2 text-sm text-muted">
            미제출 {total}건 · {data.byGroup.length}개 부서
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {data.byGroup.map((g) => (
              <li key={g.group.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/groups/${g.group.id}`} className="font-semibold">
                    {g.group.label}
                  </Link>
                  <Badge tone="danger">
                    {g.weeks.length}/{n}주 미제출
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">작성자: {g.writers.length ? g.writers.map((w) => w.name).join(", ") : "지정 안 됨"}</p>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {g.weeks.map((w) => (
                    <li key={w}>
                      <Link href={`/groups/${g.group.id}?week=${w}`} className="text-accent">
                        {weekText(w)}
                      </Link>
                      {g.drafts.includes(w) ? <span className="text-xs text-muted"> (작성 중)</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
