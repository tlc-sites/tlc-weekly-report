"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActive } from "@/lib/auth";
import { GUARDIAN_RELATIONS } from "@/lib/members";
import { todayKST } from "@/lib/week";

const MAX_BULK = 100;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

// 이름을 한 줄에 하나씩 붙여 넣어 한 번에 등록 (검토자)
export async function addMembersBulk(formData: FormData) {
  const { supabase } = await requireActive();
  const parsed = z
    .object({
      groupId: z.uuid(),
      names: z.string().max(5000),
      kind: z.enum(["student", "teacher"]),
      teamPosition: optionalText(100),
      className: optionalText(30),
    })
    .safeParse({
      groupId: formData.get("groupId"),
      names: formData.get("names") ?? "",
      kind: formData.get("kind"),
      teamPosition: formData.get("teamPosition") ?? "",
      className: formData.get("className") ?? "",
    });
  if (!parsed.success) redirect(`/groups/${formData.get("groupId")}/members?error=invalid`);
  const { groupId, kind, className } = parsed.data;
  const path = `/groups/${groupId}/members`;

  const names = [...new Set(parsed.data.names.split(/\r?\n/).map((n) => n.trim()).filter(Boolean))];
  if (names.length === 0) redirect(`${path}?error=empty`);
  if (names.length > MAX_BULK || names.some((n) => n.length > 30)) redirect(`${path}?error=too-many`);

  // 같은 부서에 이미 있는 이름(비활성 제외)은 건너뛴다
  const { data: existing } = await supabase
    .from("members")
    .select("name")
    .eq("group_id", groupId)
    .neq("status", "inactive")
    .in("name", names);
  const taken = new Set((existing ?? []).map((m) => m.name as string));
  const fresh = names.filter((n) => !taken.has(n));

  if (fresh.length) {
    const { error } = await supabase
      .from("members")
      .insert(fresh.map((name) => ({ group_id: groupId, name, kind, team_position:parsed.data.teamPosition, class_name: className, status: "active" })));
    if (error) redirect(`${path}?error=save`);
  }
  redirect(`${path}?added=${fresh.length}&skipped=${taken.size}`);
}

const memberSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  newGroupId: z.uuid(),
  name: z.string().trim().min(1).max(30),
  kind: z.enum(["student", "teacher"]),
  teamPosition: optionalText(100),
  className: optionalText(30),
  grade: optionalText(20),
  school: optionalText(50),
  birthDate: z.union([z.iso.date(), z.literal("").transform(() => null)]),
  photoData: z.string().max(200000).regex(/^$|^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/),
  status: z.enum(["newcomer", "active", "long_absent", "long_visitor", "inactive"]),
  firstVisitDate: z.union([z.iso.date(), z.literal("").transform(() => null)]),
  followUpStatus: z.union([z.enum(["new", "contacted", "settled", "inactive"]), z.literal("").transform(() => null)]),
  followUpNote: optionalText(1000),
});

// 명단 수정 (검토자). 부서 이동도 여기서 한다.
export async function updateMember(formData: FormData) {
  const { supabase } = await requireActive();
  const parsed = memberSchema.safeParse({
    id: formData.get("id"),
    groupId: formData.get("groupId"),
    newGroupId: formData.get("newGroupId"),
    name: formData.get("name"),
    kind: formData.get("kind"),
    teamPosition: formData.get("teamPosition") ?? "",
    className: formData.get("className") ?? "",
    grade: formData.get("grade") ?? "",
    school: formData.get("school") ?? "",
    birthDate: formData.get("birthDate") ?? "",
    photoData: formData.get("photoData") ?? "",
    status: formData.get("status"),
    firstVisitDate: formData.get("firstVisitDate") ?? "",
    followUpStatus: formData.get("followUpStatus") ?? "",
    followUpNote: formData.get("followUpNote") ?? "",
  });
  const back = `/groups/${formData.get("groupId")}/members/${formData.get("id")}`;
  if (!parsed.success) redirect(`${back}?error=invalid`);
  const v = parsed.data;

  const { data: current } = await supabase.from("members").select("status, left_at,group_id").eq("id", v.id).maybeSingle();
  if (!current) redirect(`${back}?error=save`);

  const {data:memberGroup}=await supabase.from("groups").select("type").eq("id",current.group_id).single();
  const team=memberGroup?.type==="worship";
  const { data, error } = await supabase
    .from("members")
    .update({
      group_id: v.newGroupId,
      name: v.name,
      kind: v.kind,
      team_position:v.teamPosition,
      status:v.status,
      ...(team?{}:{class_name: v.className,
      grade: v.grade,
      // 출생연도는 따로 받지 않고 생년월일이 있을 때만 맞춘다 (기존 값 보존)
      ...(v.birthDate ? { birth_year: Number(v.birthDate.slice(0, 4)) } : {}),
      birth_date: v.birthDate,
      school: v.school,
      photo_data: v.photoData || null,
      status: v.status,
      first_visit_date: v.firstVisitDate}),
      follow_up_status: v.followUpStatus,
      follow_up_note: v.followUpNote,
      // 비활성으로 바꾸면 그날을 기록하고, 다시 활동으로 돌리면 지운다
      left_at: v.status === "inactive" ? (current.left_at ?? todayKST()) : null,
    })
    .eq("id", v.id)
    .select("id");
  if (error || !data?.length) redirect(`${back}?error=save`);
  redirect(`/groups/${v.newGroupId}/members/${v.id}?saved=1`);
}

// 새친구 후속 관리 (작성자도 가능: DB가 새친구 상태인 행만 허용)
export async function updateFollowUp(formData: FormData) {
  const { supabase } = await requireActive();
  const parsed = z
    .object({
      id: z.uuid(),
      groupId: z.uuid(),
      followUpStatus: z.enum(["new", "contacted", "settled", "inactive"]),
      followUpNote: optionalText(1000),
    })
    .safeParse({
      id: formData.get("id"),
      groupId: formData.get("groupId"),
      followUpStatus: formData.get("followUpStatus"),
      followUpNote: formData.get("followUpNote") ?? "",
    });
  const back = `/groups/${formData.get("groupId")}/members/${formData.get("id")}`;
  if (!parsed.success) redirect(`${back}?error=invalid`);

  const { data, error } = await supabase
    .from("members")
    .update({ follow_up_status: parsed.data.followUpStatus, follow_up_note: parsed.data.followUpNote })
    .eq("id", parsed.data.id)
    .select("id");
  if (error || !data?.length) redirect(`${back}?error=save`);
  redirect(`${back}?saved=1`);
}

const guardianSchema = z.object({
  name: optionalText(30),
  relation: z.union([z.enum(GUARDIAN_RELATIONS), z.literal("").transform(() => null)]),
  contact: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s()]*$/)
    .transform((v) => v || null),
  note: optionalText(100),
  consent: z.boolean(),
});

// 보호자 정보 저장 (검토자). 칸을 모두 비우면 그 보호자를 지운다.
export async function saveGuardians(formData: FormData) {
  const { supabase } = await requireActive();
  const ids = z
    .object({ memberId: z.uuid(), groupId: z.uuid() })
    .safeParse({ memberId: formData.get("memberId"), groupId: formData.get("groupId") });
  if (!ids.success) redirect("/");
  const back = `/groups/${ids.data.groupId}/members/${ids.data.memberId}`;

  for (const slot of [1, 2] as const) {
    const parsed = guardianSchema.safeParse({
      name: formData.get(`g${slot}.name`) ?? "",
      relation: formData.get(`g${slot}.relation`) ?? "",
      contact: formData.get(`g${slot}.contact`) ?? "",
      note: formData.get(`g${slot}.note`) ?? "",
      consent: formData.get(`g${slot}.consent`) === "on",
    });
    if (!parsed.success) redirect(`${back}?error=guardian`);
    const g = parsed.data;
    const empty = !g.name && !g.relation && !g.contact && !g.note;

    if (empty) {
      const { error } = await supabase.from("member_guardians").delete().eq("member_id", ids.data.memberId).eq("slot", slot);
      if (error) redirect(`${back}?error=save`);
      continue;
    }
    if (g.contact && !g.consent) redirect(`${back}?error=consent`);

    const { error } = await supabase
      .from("member_guardians")
      .upsert({ member_id: ids.data.memberId, slot, ...g }, { onConflict: "member_id,slot" });
    if (error) redirect(`${back}?error=save`);
  }
  redirect(`${back}?saved=1`);
}

export async function quickSetStatus(formData: FormData) {
  const { supabase } = await requireActive();
  const parsed = z
    .object({ id: z.uuid(), groupId: z.uuid(), status: z.enum(["active", "inactive"]) })
    .safeParse({ id: formData.get("id"), groupId: formData.get("groupId"), status: formData.get("status") });
  if (!parsed.success) redirect("/");

  const { error } = await supabase
    .from("members")
    .update({ status: parsed.data.status, left_at: parsed.data.status === "inactive" ? todayKST() : null })
    .eq("id", parsed.data.id);
  if (error) redirect(`/groups/${parsed.data.groupId}/members?error=save`);
  refresh();
}
