"use client";

import { useState } from "react";
import { buttonClass, secondaryButtonClass } from "./ui";

export function ArchiveGroupButton({ id, name, action }: { id: string; name: string; action: (data: FormData) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  return <div className="mt-6 rounded-xl border border-border p-4">
    <h2 className="font-semibold">그룹 삭제</h2>
    <p className="my-2 text-sm text-muted">목록과 미제출 알림에서 제외됩니다. 하위 그룹도 함께 숨겨지며, 지난 보고와 명단은 보존됩니다. 그룹 관리에서 다시 사용할 수 있습니다.</p>
    {confirm ? <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <p role="alert">{name} 그룹을 삭제하시겠습니까?</p>
      <div className="flex gap-2"><button type="submit" className={buttonClass}>삭제하기</button><button type="button" className={secondaryButtonClass} onClick={() => setConfirm(false)}>취소</button></div>
    </form> : <button type="button" className={secondaryButtonClass} onClick={() => setConfirm(true)}>그룹 삭제</button>}
  </div>;
}
