import { addDays, weekdayOf } from "./week";

/** 돌아오는 주일: 오늘이 주일이면 오늘, 아니면 다음 주일 */
export function upcomingSunday(today: string) {
  return addDays(today, (7 - weekdayOf(today)) % 7);
}
