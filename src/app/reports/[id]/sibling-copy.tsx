"use client";
import { useState } from "react";
import { smallButtonClass } from "@/components/ui";
import { loadSiblingSermon, type SiblingSermon } from "./sibling-actions";

type Fields = Pick<SiblingSermon, "sermon_passage" | "preacher" | "sermon_summary" | "activity">;

// 중등부·고등부 보고 화면의 「○○부 보고 가져오기」: 설교 본문·설교자·설교 요약·공과·활동만 채운다
export function SiblingCopy({ reportId, from, current, onApply }: { reportId: string; from: string; current: Fields; onApply: (f: Fields) => void }) {
  const [state, setState] = useState<"idle" | "loading" | "confirm" | "done" | "none" | "error">("idle");
  const [found, setFound] = useState<SiblingSermon | null>(null);
  const pick = (s: SiblingSermon): Fields => ({ sermon_passage: s.sermon_passage, preacher: s.preacher, sermon_summary: s.sermon_summary, activity: s.activity });
  const apply = (s: SiblingSermon) => { onApply(pick(s)); setState("done"); };
  async function load() {
    setState("loading");
    const s = await loadSiblingSermon(reportId).catch(() => "error" as const);
    if (s === "error") return setState("error");
    if (!s) return setState("none");
    setFound(s);
    // 이미 적은 내용이 있으면 덮어쓸지 한 번 묻는다
    if (Object.values(current).some((v) => v?.trim())) setState("confirm");
    else apply(s);
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2">
      <button type="button" onClick={load} disabled={state === "loading"} className={`${smallButtonClass} self-start`}>
        {state === "loading" ? "가져오는 중…" : `${from} 보고 가져오기`}
      </button>
      <p className="text-[15px] text-muted">
        {state === "done" ? `${from} 보고의 설교 본문·설교자·설교 요약·공과·활동을 채웠습니다. 고친 뒤 저장해 주세요.`
          : state === "none" ? `같은 날 ${from} 보고가 아직 없습니다.`
          : state === "error" ? "가져오지 못했습니다. 잠시 후 다시 눌러 주세요."
          : `같은 날 ${from} 보고의 설교 본문·설교자·설교 요약·공과·활동을 가져옵니다. 출결과 기도제목은 가져오지 않습니다.`}
      </p>
      {state === "confirm" && found ? (
        <div role="alert" className="flex flex-col gap-2">
          <p>이미 적은 내용이 있습니다. {from} 보고 내용으로 바꿀까요?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => apply(found)} className={smallButtonClass}>바꾸기</button>
            <button type="button" onClick={() => setState("idle")} className={smallButtonClass}>그대로 두기</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
