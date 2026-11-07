"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LOGIN_EMAIL_COOKIE } from "./constants";

const emailSchema = z.email().max(200);

// 셀케어와 같은 방식: 이메일로 숫자 코드(와 로그인 링크)를 받는다.
// 셀케어 교인 명단에 없는 이메일은 셀케어의 가입 차단 트리거가 거부한다. 단, 이 앱에서 가입 신청한 이메일은 통과한다(DB47).
export async function sendCode(formData: FormData) {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) redirect("/login?error=invalid-email");
  await sendOtp(parsed.data);
}

// 셀케어를 쓰지 않는 분의 가입: 이메일을 가입 신청 목록에 올린 뒤 같은 로그인 코드를 보낸다.
// 로그인하면 이름·파트를 적어 신청하고(onboarding), 관리자가 승인해야 보고서를 쓸 수 있다.
export async function signUp(formData: FormData) {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) redirect("/login?mode=signup&error=invalid-email");
  // 신청 함수는 service_role만 부를 수 있다(로그인 전 사용자에게 report 스키마를 열지 않는다).
  const { error } = await createAdminClient().rpc("request_signup", { p_email: parsed.data });
  if (error) redirect(error.code === "P0429" ? "/login?mode=signup&error=busy" : "/login?mode=signup&error=send");
  await sendOtp(parsed.data);
}

async function sendOtp(email: string) {
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    const message = error.message ?? "";
    if (error.code === "unexpected_failure" || /database error|NOT_APPROVED/i.test(message)) {
      redirect("/login?error=not-registered");
    }
    if (error.code === "over_email_send_rate_limit" || /rate|security purposes|seconds/i.test(message)) {
      redirect("/login?error=rate");
    }
    redirect("/login?error=send");
  }

  (await cookies()).set(LOGIN_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 30,
    path: "/login",
  });
  redirect("/login");
}

export async function verifyCode(formData: FormData) {
  const cookieStore = await cookies();
  const email = cookieStore.get(LOGIN_EMAIL_COOKIE)?.value;
  if (!email) redirect("/login");

  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (token.length < 6 || token.length > 10) redirect("/login?error=code-format");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) redirect("/login?error=code");

  cookieStore.delete({ name: LOGIN_EMAIL_COOKIE, path: "/login" });
  redirect("/");
}

export async function changeEmail() {
  (await cookies()).delete({ name: LOGIN_EMAIL_COOKIE, path: "/login" });
  redirect("/login");
}
