import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ErrorText, Loading, buttonClass, inputClass } from "@/components/ui";
import { getSessionProfile } from "@/lib/auth";
import { changeEmail, sendCode, verifyCode } from "./actions";
import { LOGIN_EMAIL_COOKIE } from "./constants";

const ERRORS: Record<string, string> = {
  "invalid-email": "이메일 주소를 다시 확인해 주세요.",
  "not-registered":
    "아직 승인되지 않은 이메일입니다. 셀케어 앱의 「등록 신청하기」로 먼저 신청하거나 담당 교역자에게 문의해 주세요.",
  rate: "메일을 너무 자주 요청했습니다. 잠시 후 다시 시도해 주세요.",
  send: "메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "code-format": "메일로 받은 숫자 코드를 그대로 입력해 주세요.",
  code: "코드가 맞지 않거나 시간이 지났습니다. 메일을 다시 받아 주세요.",
  callback: "로그인 링크 처리 중 문제가 생겼습니다. 코드를 입력해 로그인해 주세요.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<Loading />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { profile } = await getSessionProfile();
  if (profile) redirect("/");

  const [{ error }, cookieStore] = await Promise.all([searchParams, cookies()]);
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const sentTo = cookieStore.get(LOGIN_EMAIL_COOKIE)?.value;

  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold">TLC 교회 보고서</h1>
        <p className="mt-2 text-sm text-muted">교회학교 · 예배팀 · 캠퍼스 보고</p>
      </header>

      {message ? <ErrorText>{message}</ErrorText> : null}

      {sentTo ? (
        <>
          <form action={verifyCode} className="flex flex-col gap-2">
            <p className="mb-1 text-sm leading-relaxed">
              <strong>{sentTo}</strong>로 로그인 메일을 보냈습니다. 메일의 숫자 코드를 입력하거나 링크를 눌러 주세요.
            </p>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="숫자 코드"
              className={`${inputClass} text-center text-lg tracking-widest`}
            />
            <button type="submit" className={`${buttonClass} mt-2`}>
              로그인
            </button>
          </form>
          <div className="flex justify-center gap-4 text-sm text-muted">
            <form action={sendCode}>
              <input type="hidden" name="email" value={sentTo} />
              <button type="submit" className="underline underline-offset-4">
                메일 다시 받기
              </button>
            </form>
            <form action={changeEmail}>
              <button type="submit" className="underline underline-offset-4">
                다른 이메일로
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <form action={sendCode} className="flex flex-col gap-2">
            <input name="email" type="email" required autoComplete="email" placeholder="이메일" className={inputClass} />
            <button type="submit" className={`${buttonClass} mt-2`}>
              로그인 메일 받기
            </button>
          </form>
          <p className="text-center text-sm leading-relaxed text-muted">
            셀케어에서 쓰는 이메일을 입력하면 로그인 코드를 보내 드립니다.
          </p>
        </>
      )}
    </div>
  );
}
