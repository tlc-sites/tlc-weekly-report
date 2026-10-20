import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type Profile = {
  id: string;
  email: string | null;
  real_name: string | null;
  requested_group_ids: string[];
  status: "pending" | "active" | "disabled";
  is_admin: boolean;
  is_minister: boolean;
  recipient_role: "pastor" | "pastor_wife" | null;
};

const PROFILE_COLUMNS = "id, email, real_name, requested_group_ids, status, is_admin, is_minister, recipient_role";

export async function getSessionProfile() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, profile: null };

  const fetchProfile = () =>
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle<Profile>();

  let { data: profile } = await fetchProfile();
  if (!profile) {
    // 셀케어 계정으로 보고 앱에 처음 들어온 경우: 승인 대기 프로필을 만든다
    const { error } = await supabase.rpc("ensure_profile");
    if (error) throw error;
    ({ data: profile } = await fetchProfile());
  }
  return { supabase, profile };
}

// 승인된 사용자만 통과시키고, 아니면 상태에 맞는 화면으로 보낸다
export async function requireActive() {
  const { supabase, profile } = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.status === "pending" && profile.requested_group_ids.length === 0) redirect("/onboarding");
  if (profile.status !== "active") redirect("/pending");
  return { supabase, profile };
}

export async function requireAdmin() {
  const ctx = await requireActive();
  if (!canManage(ctx.profile)) redirect("/");
  return ctx;
}

export const isSenior = (profile: Profile) => profile.recipient_role !== null;
export const isClergy = (profile: Profile) => isSenior(profile) || profile.is_minister;
export const canManage = (profile: Profile) => isSenior(profile) || profile.is_admin;
