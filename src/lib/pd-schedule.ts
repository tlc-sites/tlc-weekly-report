// PD 체크리스트·큐시트 양식(pd_templates)이 어느 요일·주차에 열리는지.
// 양식에는 요일이 없으므로 예배 목록(service_types)의 요일·주차를 이름으로 찾아 쓴다.
// 화면·서버·테스트에서 함께 쓰므로 다른 모듈을 가져오지 않는다(node --test로 바로 검증).
// 요일·주차 규칙은 service-schedule.ts의 serviceOccursOn과 같다(테스트로 같은지 확인).

export type PdSchedule = { weekday: number; month_week: number | null };
export type ServiceTypeRow = { name: string; weekday: number | null; month_week: number | null; is_active?: boolean | null };

/** 주일 기본 네 예배(1부·2부·3부·라이프라인)는 늘 매주 주일 */
const SUNDAY_KEYS = new Set(["sun1", "sun2", "sun3", "life"]);
const SUNDAY: PdSchedule = { weekday: 0, month_week: null };
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const latinWords = (s: string) => (s.match(/[A-Za-z]{3,}/g) ?? []).map(w => w.toLowerCase());

/** 양식 이름으로 예배 목록의 요일·주차를 찾는다. 정확히 같은 이름 → 한쪽이 다른 쪽을 포함(긴 이름 우선) → 영어 낱말(AWAKE 등). 못 찾으면 주일. */
export function templateSchedule(key: string, name: string, types: ServiceTypeRow[]): PdSchedule {
  if (SUNDAY_KEYS.has(key)) return SUNDAY;
  const list = types.filter(t => t.weekday !== null && t.is_active !== false)
    .sort((a, b) => b.name.length - a.name.length);
  const n = norm(name);
  const pick = (t?: ServiceTypeRow) => (t ? { weekday: t.weekday as number, month_week: t.month_week ?? null } : null);
  const words = latinWords(name);
  return pick(list.find(t => norm(t.name) === n))
    ?? pick(list.find(t => n.length >= 2 && (norm(t.name).includes(n) || n.includes(norm(t.name)))))
    ?? pick(list.find(t => words.length > 0 && words.some(w => t.name.toLowerCase().includes(w))))
    ?? SUNDAY;
}

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** 그날 그 예배가 열리는가: 요일이 같고, 주차가 있으면 그 달의 n번째(−1은 마지막) 그 요일 */
export function occursOn(date: string, s: PdSchedule) {
  const day = new Date(date + "T00:00:00Z");
  if (Number.isNaN(day.getTime()) || day.getUTCDay() !== s.weekday) return false;
  if (s.month_week === null) return true;
  if (s.month_week === -1) return new Date(day.getTime() + 7 * 864e5).getUTCMonth() !== day.getUTCMonth();
  return Math.ceil(day.getUTCDate() / 7) === s.month_week;
}

/** from(포함) 이후 그 예배가 열리는 가장 가까운 날. 70일 안에 없으면 from 그대로. */
export function nextServiceDate(from: string, s: PdSchedule) {
  for (let i = 0; i <= 70; i++) {
    const d = addDays(from, i);
    if (occursOn(d, s)) return d;
  }
  return from;
}

const DAY = ["일", "월", "화", "수", "목", "금", "토"];
/** '매주 수요일', '매달 1주차 금요일', '매달 마지막 주 금요일', 주일은 '매주 주일' */
export function scheduleLabel(s: PdSchedule) {
  const day = s.weekday === 0 ? "주일" : DAY[s.weekday] + "요일";
  if (s.month_week === null) return `매주 ${day}`;
  return s.month_week === -1 ? `매달 마지막 주 ${day}` : `매달 ${s.month_week}주차 ${day}`;
}

/** '돌아오는 주일', '돌아오는 수요일' */
export const upcomingLabel = (weekday: number) => `돌아오는 ${weekday === 0 ? "주일" : DAY[weekday] + "요일"}`;

/** '11/25 (수)' */
export function shortDate(d: string) {
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day} (${DAY[new Date(d + "T00:00:00Z").getUTCDay()]})`;
}

/** 큐시트 머리의 요일 이름: 주일이면 기존 그대로 '주일예배', 수요일은 '수요예배' … */
export function cueDayName(weekday: number) {
  return weekday === 0 ? { ko: "주일예배", en: "Sunday Service" } : { ko: DAY[weekday] + "요예배", en: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday] + " Service" };
}

/** 주일 기본 예배의 큐시트 이름표(1st. 2nd. 3rd. LIFELINE)를 복제한 양식은 제목이 틀어지므로, 예배 이름의 영어 낱말이나 요일로 바꾼다. */
const BASE_LABELS = new Set(["1st.", "2nd.", "3rd.", "lifeline"]);
export function cueLabelFor(key: string, label: string, name: string, s: PdSchedule) {
  if (SUNDAY_KEYS.has(key) || !BASE_LABELS.has(label.trim().toLowerCase())) return label;
  const latin = name.match(/[A-Za-z][A-Za-z ]*[A-Za-z]/g)?.join(" ").trim();
  if (latin) return latin.toUpperCase();
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][s.weekday];
}
