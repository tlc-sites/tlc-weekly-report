// 앱 업데이트 공지. DB를 거치지 않고 알림 목록 맨 위에 고정해 보여 준다(푸시 발송 없음).
// 교역자·관리자는 바로 보고, 그 밖의 사용자는 publishAt부터 본다. 새 버전은 배열 맨 앞에 추가한다.
export type AppUpdate = { id: string; publishAt: string; title: string; body: string };

export const APP_UPDATES: AppUpdate[] = [
  {
    id: "20261025-1",
    publishAt: "2026-10-26T00:00:00+09:00",
    title: "[공지] 업데이트되었습니다 (20261025-1)",
    body: "교회 보고서와 셀 케어가 함께 업데이트되었습니다. 사용 안내가 새로 생겼고, 화면의 ⓘ를 누르면 그 자리에서 설명을 볼 수 있습니다. 눌러서 「업데이트 소식」을 확인해 주세요.",
  },
];

export function visibleUpdates(now: number, staff: boolean, updates: AppUpdate[] = APP_UPDATES) {
  return updates.filter((u) => staff || now >= Date.parse(u.publishAt));
}

export function guideHref(staff: boolean) {
  return (staff ? "/staff-guide.html" : "/guide.html") + "#updates";
}
