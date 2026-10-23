export type Member = {
  id: string;
  group_id: string;
  name: string;
  team_position?: string | null;
  kind: "student" | "teacher";
  class_name: string | null;
  grade: string | null;
  birth_year: number | null;
  birth_date: string | null;
  photo_data: string | null;
  status: "newcomer" | "active" | "inactive";
  first_visit_date: string | null;
  follow_up_status: "new" | "contacted" | "settled" | "inactive" | null;
  follow_up_note: string | null;
  left_at: string | null;
};

export type Guardian = {
  id: string;
  member_id: string;
  slot: 1 | 2;
  name: string | null;
  relation: "부" | "모" | "조부모" | "기타" | null;
  contact: string | null;
  note: string | null;
  consent: boolean;
};

export const MEMBER_COLUMNS =
  "id, group_id, name, team_position, kind, class_name, grade, birth_year, birth_date, photo_data, status, first_visit_date, follow_up_status, follow_up_note, left_at";

export const KIND_LABEL: Record<Member["kind"], string> = { student: "학생", teacher: "교사" };

export const MEMBER_STATUS_LABEL: Record<Member["status"], string> = {
  newcomer: "새친구",
  active: "활동",
  inactive: "비활성",
};

export const FOLLOW_UP_LABEL: Record<NonNullable<Member["follow_up_status"]>, string> = {
  new: "연락 전",
  contacted: "연락함",
  settled: "정착",
  inactive: "안 나옴",
};

export const GUARDIAN_RELATIONS = ["부", "모", "조부모", "기타"] as const;
