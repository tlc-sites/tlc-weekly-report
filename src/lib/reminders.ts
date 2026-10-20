import { sendToSubscriptions, type PushPayload } from "./push";
import {
  adminTargets,
  digestTargets,
  missingGroups,
  reminderTargets,
  summarizeNames,
  type RtGroup,
  type RtMembership,
  type RtReport,
  type RtUser,
} from "./reminder-targets";
import { createAdminClient } from "./supabase/admin";
import { notifyRegistrationAlerts } from "./registration-alerts";
import { formatWeek, todayKST, weekOf } from "./week";

export const REMINDER_SLOTS = ["wed-am", "fri-am", "fri-digest"] as const;
export type ReminderSlot = (typeof REMINDER_SLOTS)[number];

type Plan = { userId: string; payload: PushPayload }[];

export async function runReminders(slot: ReminderSlot, { dryRun = false } = {}) {
  if(!dryRun) await notifyRegistrationAlerts();
  const admin = createAdminClient();
  const week = weekOf(todayKST());

  const [groupsRes, reportsRes, weekStatusRes, membershipsRes, usersRes] = await Promise.all([
    admin.from("groups").select("id, type, name, parent_id, schedule, is_active"),
    admin.from("reports").select("group_id, status").eq("week", week),
    admin.from("week_status").select("group_id, no_meeting").eq("week", week),
    admin.from("memberships").select("user_id, group_id, role"),
    admin.from("profiles").select("id, status, is_admin, is_minister, notify_enabled, recipient_role"),
  ]);
  for (const r of [groupsRes, reportsRes, weekStatusRes, membershipsRes, usersRes]) if (r.error) throw r.error;

  const groups: RtGroup[] = (groupsRes.data ?? []).map((g) => ({
    ...g,
    label: g.name,
  })) as RtGroup[];
  const noMeeting = new Set((weekStatusRes.data ?? []).filter((w) => w.no_meeting).map((w) => w.group_id as string));
  const missing = missingGroups(groups, (reportsRes.data ?? []) as RtReport[], noMeeting);
  const memberships = (membershipsRes.data ?? []) as RtMembership[];
  const users = (usersRes.data ?? []) as RtUser[];
  const weekText = formatWeek(week);

  const plan: Plan = [];
  if (slot === "wed-am" || slot === "fri-am") {
    for (const [userId, names] of reminderTargets(missing, memberships, users)) {
      plan.push({
        userId,
        payload: {
          title: slot === "wed-am" ? "이번 주 보고를 작성해 주세요" : "오늘 오후 5시에 보고를 전달해요",
          body: `${summarizeNames(names)} · ${weekText} 보고를 작성해 주세요.`,
          url: "/",
          tag: `reminder-${week}`,
        },
      });
    }
  }
  if (slot === "fri-am" && missing.length) {
    for (const userId of adminTargets(users)) {
      plan.push({
        userId,
        payload: {
          title: `미제출 ${missing.length}곳`,
          body: summarizeNames(missing.map((g) => g.label), 4),
          url: `/meeting?week=${week}`,
          tag: `admin-${week}`,
        },
      });
    }
  }
  if (slot === "fri-digest") {
    for (const userId of digestTargets(users)) {
      plan.push({
        userId,
        payload: {
          title: "이번 주 사역 보고가 준비됐어요",
          body: missing.length ? `${weekText} · 미제출 ${missing.length}곳` : `${weekText} · 모든 그룹 제출 완료`,
          url: `/meeting?week=${week}`,
          tag: `digest-${week}`,
        },
      });
    }
  }

  if (dryRun) return { week, slot, dryRun, missing: missing.map((g) => g.label), plan };

  // 같은 사람에게 같은 주·같은 슬롯은 한 번만 (크론이 다시 실행돼도 중복 발송하지 않도록 기록부터 남긴다)
  // 한 사람에게 미제출 알림과 관리자 요약이 함께 가는 경우를 위해 슬롯 이름을 알림 종류별로 나눈다
  const results = { week, slot, attempted: 0, sent: 0, removed: 0, failed: 0, skippedDuplicate: 0 };
  for (const item of plan) {
    const logSlot = `${slot}:${item.payload.tag?.split("-")[0]}`;
    const { data: logged } = await admin
      .from("notification_logs")
      .upsert({ user_id: item.userId, week, slot: logSlot }, { onConflict: "user_id,week,slot", ignoreDuplicates: true })
      .select("user_id");
    if (!logged?.length) {
      results.skippedDuplicate++;
      continue;
    }
    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", item.userId);
    if (!subs?.length) continue;
    results.attempted++;
    const r = await sendToSubscriptions(admin, subs, item.payload);
    results.sent += r.sent;
    results.removed += r.removed;
    results.failed += r.failed;
  }
  return results;
}
