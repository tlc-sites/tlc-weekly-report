import { Suspense } from "react";
import { AdminNav } from "@/components/admin-nav";
import {
  BackLink,
  Card,
  ErrorText,
  Loading,
  PageTitle,
  buttonClass,
  inputClass,
  pickMessage,
  selectClass,
  smallButtonClass,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { WEEKDAY_LABEL, type ServiceType } from "@/lib/services";
import { createService, moveService, toggleService, updateService } from "./actions";

const MESSAGES: Record<string, string> = {
  invalid: "입력값이 올바르지 않습니다.",
  save: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export default function AdminServicesPage({ searchParams }: PageProps<"/admin/services">) {
  return (
    <Suspense fallback={<Loading />}>
      <AdminServicesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminServicesContent({ searchParams }: Pick<PageProps<"/admin/services">, "searchParams">) {
  const { supabase } = await requireAdmin();
  const [{ error }, { data, error: loadError }] = await Promise.all([
    searchParams,
    supabase.from("service_types").select("id, name, weekday, sort_order, is_active").order("sort_order").order("name"),
  ]);
  if (loadError) throw loadError;
  const services = (data ?? []) as ServiceType[];
  const message = pickMessage(MESSAGES, error);

  return (
    <>
      <BackLink href="/">홈</BackLink>
      <PageTitle sub="교회 공통 예배 목록입니다. 예배를 고르면 그 주의 해당 요일로 날짜가 자동 지정됩니다.">
        예배 목록
      </PageTitle>
      <AdminNav current="/admin/services" />
      {message ? (
        <div className="mb-4">
          <ErrorText>{message}</ErrorText>
        </div>
      ) : null}

      <div className="mb-6 flex flex-col gap-3">
        {services.map((s, i) => (
          <Card key={s.id} className={s.is_active ? "" : "opacity-60"}>
            <form action={updateService} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={s.id} />
              <div className="flex gap-2">
                <input name="name" required maxLength={50} defaultValue={s.name} className={inputClass} />
              </div>
              <div className="flex items-center gap-2">
                <select name="weekday" defaultValue={s.weekday ?? ""} className={`${selectClass} w-24`}>
                  <option value="">요일 없음</option>
                  {WEEKDAY_LABEL.map((label, d) => (
                    <option key={label} value={d}>
                      {label}
                    </option>
                  ))}
                </select>
                <button type="submit" className={smallButtonClass}>
                  저장
                </button>
              </div>
            </form>
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
              <span className="flex-1 text-xs text-muted">{s.is_active ? "사용 중" : "사용 중지됨 (과거 보고는 유지)"}</span>
              {/* 버튼의 name/value가 그대로 전달되도록 폼을 따로 둔다 (formAction을 쓰면 React가 name을 덮어씀) */}
              <form action={moveService} className="flex gap-2">
                <input type="hidden" name="id" value={s.id} />
                <MoveButton direction="up" disabled={i === 0} />
                <MoveButton direction="down" disabled={i === services.length - 1} />
              </form>
              <form action={toggleService}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="isActive" value={String(!s.is_active)} />
                <button type="submit" className={smallButtonClass}>
                  {s.is_active ? "사용 중지" : "다시 사용"}
                </button>
              </form>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold">예배 추가</h2>
      <Card>
        <form action={createService} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input name="name" required maxLength={50} placeholder="예: 새벽예배, 라이프라인 수요예배" className={inputClass} />
          </div>
          <div className="flex gap-2">
            <select name="weekday" defaultValue="" className={selectClass}>
              <option value="">요일 없음</option>
              {WEEKDAY_LABEL.map((label, d) => (
                <option key={label} value={d}>
                  {label}요일
                </option>
              ))}
            </select>
            <button type="submit" className={`${buttonClass} shrink-0`}>
              추가
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}

function MoveButton({ direction, disabled }: { direction: "up" | "down"; disabled: boolean }) {
  return (
    <button
      type="submit"
      name="direction"
      value={direction}
      disabled={disabled}
      aria-label={direction === "up" ? "위로" : "아래로"}
      className={`${smallButtonClass} w-9 px-0`}
    >
      {direction === "up" ? "↑" : "↓"}
    </button>
  );
}
