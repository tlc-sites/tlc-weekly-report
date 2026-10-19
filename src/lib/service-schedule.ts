// 순수 날짜 계산: 한 달의 n번째 금요일을 기준으로 금요예배를 구분한다.
export function serviceOccursOn(date: string, service: { weekday: number | null; month_week?: number | null }) {
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date) return false;
  if (service.weekday !== null && day.getUTCDay() !== service.weekday) return false;
  if (service.month_week == null) return true;
  if (service.month_week === -1) {
    const next = new Date(day); next.setUTCDate(day.getUTCDate() + 7);
    return next.getUTCMonth() !== day.getUTCMonth();
  }
  return Math.ceil(day.getUTCDate() / 7) === service.month_week;
}

export const MONTH_WEEK_LABEL: Record<string, string> = { "": "매주", "1": "1주차", "2": "2주차", "3": "3주차", "4": "4주차", "5": "5주차", "-1": "마지막 주차" };
