"use client";

import { useState, type ReactNode } from "react";

// 서버로 보내기 전에 연락처-동의 조건을 확인해, 입력한 내용이 지워지지 않게 한다
export function GuardianForm({ action, children }: { action: (formData: FormData) => Promise<void>; children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const missing = ([1, 2] as const).find(
          (slot) => String(data.get(`g${slot}.contact`) ?? "").trim() && data.get(`g${slot}.consent`) !== "on",
        );
        if (missing) {
          event.preventDefault();
          setError(`보호자 ${missing}의 연락처를 저장하려면 후속 연락 목적 수집 동의를 받았는지 체크해 주세요.`);
        } else {
          setError(null);
        }
      }}
      className="flex flex-col gap-4"
    >
      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {children}
    </form>
  );
}
