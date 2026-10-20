import { z } from "zod";
import { GUARDIAN_RELATIONS } from "./members";

// 보고 양식 정의. 브라우저(입력 화면)와 서버(저장 검증)가 함께 쓴다.

export const REPORT_STATUS_LABEL = { draft: "임시저장", submitted: "제출", reviewed: "확인됨" } as const;
export type ReportStatus = keyof typeof REPORT_STATUS_LABEL;

export const REQUEST_CATEGORIES = ["시설", "물품", "예산", "기타"] as const;
export const WORSHIP_ISSUE_CATEGORIES = ["장비", "인력", "진행·큐시트", "소통", "기타"] as const;
export const OTHER_ISSUE_CATEGORIES = ["장소·시설", "인력·관계", "진행", "안전", "기타"] as const;
export const ISSUE_STATUS_LABEL = { open: "미해결", temporary: "임시 조치", resolved: "해결" } as const;
export const RESULT_LABEL = { normal: "정상", minor: "경미한 문제", incident: "사고" } as const;

// 부산 캠퍼스 보고: 기존 구글 폼 항목 그대로
export const CAMPUS_OFFERINGS = ["금요", "주일 1부", "주일 2부", "라이프라인", "헌금함"] as const;
export const CAMPUS_SATURDAY = ["바리타", "곡 연습", "기도회", "안 함"] as const;
export const CAMPUS_LODGING_NONE = "지출 안 함 (김미정 성도님 집에 묵음)";
export const CAMPUS_COUNTS = [
  ["train", "기차 이용 횟수"],
  ["bus", "고속버스 이용 횟수"],
  ["taxi", "택시 이용 횟수"],
  ["parking", "주차 이용 횟수"],
  ["meals", "식비 지출 횟수"],
] as const;
export const CAMPUS_TEXTS = [
  ["youth", "중고등부 소식", "학생, 교사, 장소, 일정 등 이슈를 적어주세요"],
  ["young_adults", "청년부 모임", "모임 개괄 적어주세요"],
  ["adults", "장년부 관련 소식이나 대화", "장년부 관련 특이사항 적어주세요. 성도 개인/가정/셀 등"],
  ["visitors", "방문자, 새가족 관련 보고", "방문자, 새가족 관련 특이사항 적어주세요."],
  ["direction", "교회 전체적인 사역 중점 사항 및 방향", "이번주 다녀오면서 전체적으로 케어했던 방향이나 중점 사안을 적어주세요"],
  ["facilities", "시설 관련 사항", "보수/폐기/구매/관리/이관 등이 필요한 부분 적어주세요"],
  ["served", "성도님들의 섬김 받은 사항", "차량 이동/픽업 등이나 식사 섬김 등 있었을 때 적어주세요"],
  ["others", "그 외 특기 사항", "그 외 특기할 만한 사항 있으면 적어주세요. 특별행사라던지, 개인면담, 세부적 사안 등"],
] as const;

const text = (max: number) => z.string().trim().max(max);
const longText = text(1000);

const requestSchema = z.object({ category: z.enum(REQUEST_CATEGORIES), content: text(500).min(1) });
const messagesSchema = z.object({ pastor: text(2000), pastor_wife: text(2000) });

const issueSchema = z.object({
  category: text(30).min(1),
  content: longText.min(1),
  status: z.enum(["open", "temporary", "resolved"]),
  action: longText,
});

export const educationPayload = z.object({
  details: z.object({
    sermon_passage: text(100),
    preacher: text(100),
    activity: longText,
    notes: longText,
    requests: z.array(requestSchema).max(20),
  }),
  attendance: z
    .array(
      z.object({
        member_id: z.uuid(),
        present: z.boolean(),
        absence_reason: text(100),
        contacted: z.boolean(),
        guardian_present: z.boolean(),
      }),
    )
    .max(300),
  newcomers: z
    .array(
      z
        .object({
          name: text(30).min(1),
          grade: text(20),
          guardian_name: text(30),
          guardian_relation: z.union([z.enum(GUARDIAN_RELATIONS), z.literal("")]),
          guardian_contact: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/),
          consent: z.boolean(),
        })
        .refine((n) => !n.guardian_contact || n.consent, { message: "consent" }),
    )
    .max(30),
  prayer: text(1000),
  messages: messagesSchema,
});

export const worshipPayload = z.object({
  details: z.object({
    sermon_passage: text(100).default(""),
    sermon_content: text(2000).default(""),
    service_staff: text(1000).default(""),
    result: z.union([z.enum(["normal", "minor", "incident"]), z.literal("")]),
    notes: longText,
    requests: z.array(requestSchema).max(20),
  }),
  issues: z.array(issueSchema).max(30),
  messages: messagesSchema,
});

export const otherPayload = z.object({
  details: z.object({
    // 이전에 작성한 기타 모임 보고도 그대로 열고 저장할 수 있도록 기본값을 둔다.
    song_list: text(2000).default(""),
    sharing_topic:text(1000).optional(),sharing_passage:text(200).optional(),sharing_place:text(200).optional(),
    sermon_passage: text(100).default(""),
    preacher: text(100).default(""),
    content: text(2000).default(""),
    notes: longText,
    requests: z.array(requestSchema).max(20),
  }),
  issues: z.array(issueSchema).max(30),
  messages: messagesSchema,
});

const countSchema = z.union([z.number().int().min(0).max(99), z.null()]);

export const campusPayload = z.object({
  details: z.object({
    companion: text(50),
    depart_pangyo: z.union([z.iso.date(), z.literal("")]),
    depart_busan: z.union([z.iso.date(), z.literal("")]),
    offerings: z.array(z.enum(CAMPUS_OFFERINGS)).max(CAMPUS_OFFERINGS.length),
    offerings_other: text(100),
    counts: z.object(Object.fromEntries(CAMPUS_COUNTS.map(([key]) => [key, countSchema])) as Record<
      (typeof CAMPUS_COUNTS)[number][0],
      typeof countSchema
    >),
    lodging: text(200),
    saturday: z.array(z.enum(CAMPUS_SATURDAY)).max(CAMPUS_SATURDAY.length),
    saturday_other: text(100),
    texts: z.object(Object.fromEntries(CAMPUS_TEXTS.map(([key]) => [key, longText])) as Record<
      (typeof CAMPUS_TEXTS)[number][0],
      typeof longText
    >),
  }),
  messages: messagesSchema,
});

export type EducationPayload = z.infer<typeof educationPayload>;
export type WorshipPayload = z.infer<typeof worshipPayload>;
export type OtherPayload = z.infer<typeof otherPayload>;
export type CampusPayload = z.infer<typeof campusPayload>;

// 제출할 때만 확인하는 필수 항목 (임시저장은 비어 있어도 된다). 빠진 항목 이름을 돌려준다.
export function missingOnSubmit(type: string, payload: unknown): string[] {
  const session=(payload as {details?:Record<string,unknown>})?.details;
  if(session?.session_type==="meeting" || session?.session_type==="curriculum") return [...(!session.topic ? ["모임 주제"]:[]),...(!session.content ? ["진행 내용"]:[])];
  if (type === "worship") {
    const p = payload as WorshipPayload;
    return p.details.result ? [] : ["진행 결과"];
  }
  if (type === "campus") {
    const d = (payload as CampusPayload).details;
    const missing: string[] = [];
    if (!d.companion) missing.push("동행 스텝 이름");
    if (!d.depart_pangyo) missing.push("판교 출발 날짜");
    if (!d.depart_busan) missing.push("부산 출발 날짜");
    if (!d.offerings.length && !d.offerings_other) missing.push("헌금 챙김");
    for (const [key, label] of CAMPUS_COUNTS) if (d.counts[key] === null) missing.push(label);
    if (!d.lodging) missing.push("숙소 지출 여부");
    if (!d.saturday.length && !d.saturday_other) missing.push("토요일 예배팀 모임");
    for (const [key, label] of CAMPUS_TEXTS) if (!d.texts[key]) missing.push(label);
    return missing;
  }
  return [];
}

export function emptyMessages() {
  return { pastor: "", pastor_wife: "" };
}
