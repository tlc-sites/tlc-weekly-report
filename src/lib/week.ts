// 한국 날짜 'YYYY-MM-DD'. 주차는 일~토이며 시작 일요일을 저장한다.

export function todayKST() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function toUTC(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, days: number) {
  const date = toUTC(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0=일 … 6=토 */
export function weekdayOf(iso: string) {
  return toUTC(iso).getUTCDay();
}

/** 그 날짜가 속한 주(일~토)의 시작 일요일 */
export function weekOf(iso: string) {
  return addDays(iso, -weekdayOf(iso));
}

/** 시작 일요일에서 해당 요일의 날짜를 계산한다. */
export function dateInWeek(sunday: string, weekday: number) {
  return addDays(sunday, weekday);
}

/** 오늘이거나 그 이전 중 가장 가까운 해당 요일 (월요일에 주일 보고를 쓰면 어제 날짜) */
export function latestWeekday(today: string, weekday: number) {
  return addDays(today, -((weekdayOf(today) - weekday + 7) % 7));
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUTC(value).getTime());
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDate(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}(${WEEKDAY[weekdayOf(iso)]})`;
}

export function formatWeek(sunday: string) {
  return `${formatDate(sunday)} ~ ${formatDate(addDays(sunday, 6))}`;
}

/** 그 주에서 실제로 지난 마지막 날짜. 미래 사역을 실적으로 입력하지 않는다. */
export function reportDateMax(sunday: string, today: string) {
  const end=addDays(sunday,6);
  return end<today ? end : today;
}

/** 금요일 17시 전달 직전까지 작성한다 (한국 시간). */
export function reportDeadline(sunday:string) {
  return new Date(`${addDays(sunday,5)}T16:59:59+09:00`);
}

/** 이번 일요일에 시작한 주를 기본으로, 다음 주 이후 URL은 이번 주로 제한한다. */
export function reportWeek(value: unknown, today: string) {
  const latest = latestWeekday(today, 0);
  return isIsoDate(value) ? (weekOf(value) > latest ? latest : weekOf(value)) : latest;
}
