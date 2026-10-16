// 날짜는 모두 한국 날짜 기준 'YYYY-MM-DD' 문자열로 다룬다. 주차는 월~일, 그 주 일요일 날짜로 표시한다.

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

/** 그 날짜가 속한 주(월~일)의 일요일 */
export function weekOf(iso: string) {
  return addDays(iso, (7 - weekdayOf(iso)) % 7);
}

/** 주차(일요일) 안에서 해당 요일의 날짜. 일요일(0)은 그 주의 마지막 날이다. */
export function dateInWeek(sunday: string, weekday: number) {
  return weekday === 0 ? sunday : addDays(sunday, weekday - 7);
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
  return `${formatDate(addDays(sunday, -6))} ~ ${formatDate(sunday)}`;
}
