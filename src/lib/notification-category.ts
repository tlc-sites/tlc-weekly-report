// 알림함 종류별 모아보기. 알림에는 종류 칸이 없어서 제목과 이동 주소로 나눈다.
// 새 알림 문구를 추가하면 여기에도 넣는다. 맞는 게 없으면 '기타'로 보인다.
export const NOTIFICATION_CATEGORIES = [
  ["report", "새 보고서"],
  ["feedback", "피드백·답글"],
  ["request", "다른 부서 요청"],
  ["message", "비공개 메시지"],
  ["notice", "공지"],
  ["reminder", "작성 안내"],
  ["other", "기타"],
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number][0];

export function notificationCategory({ title, url }: { title: string; url: string }): NotificationCategory {
  if (/다른 부서에서 함께 봐/.test(title)) return "request";
  if (/피드백|답글|코멘트|댓글/.test(title)) return "feedback";
  if (/보고서가 제출|보고서를 수정/.test(title)) return "report";
  if (/비공개 메시지/.test(title) || url.startsWith("/messages")) return "message";
  if (url.startsWith("/notices")) return "notice";
  if (/작성해 주세요|작성 부탁|미제출|보고를 전달|사역 보고가 준비/.test(title)) return "reminder";
  return "other";
}
