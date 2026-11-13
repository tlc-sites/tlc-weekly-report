import type { Group } from "./groups";
import type { ReportStatus } from "./report-forms";
import { reportDeadline } from "./week";

export type StatusTone = "todo" | "draft" | "wait" | "done";
export type CardReport = { id: string; group_id: string; author_id: string; status: ReportStatus };
export type CardPart = Pick<Group, "id" | "name" | "type" | "schedule">;

// 홈의 '내 파트' 카드: 이번 주 상태 하나와 지금 할 일 하나(쓰기 · 이어 쓰기 · 보기)
export function partCardState(g: CardPart, reports: CardReport[], noMeeting: string[], userId: string, week: string, now = new Date()) {
  const rs = reports.filter((r) => r.group_id === g.id);
  const myDraft = rs.find((r) => r.status === "draft" && r.author_id === userId);
  const sent = rs.filter((r) => r.status !== "draft");
  const groupHref = `/groups/${g.id}?week=${week}`;
  if (myDraft) return { tone: "draft" as StatusTone, label: "작성 중", action: "이어 쓰기", href: `/reports/${myDraft.id}`, primary: true };
  if (sent.length) {
    const waiting = sent.some((r) => r.status === "submitted");
    return { tone: (waiting ? "wait" : "done") as StatusTone, label: `${waiting ? "확인 대기" : "확인 완료"}${sent.length > 1 ? ` ${sent.length}건` : ""}`, action: "보기", href: groupHref, primary: false };
  }
  if (noMeeting.includes(g.id)) return { tone: "todo" as StatusTone, label: "모임 없음", action: "보기", href: groupHref, primary: false };
  if (rs.length) return { tone: "draft" as StatusTone, label: "작성 중", action: "보기", href: groupHref, primary: false };
  const late = g.type !== "worship" && g.schedule === "weekly" && now > reportDeadline(week);
  return { tone: "todo" as StatusTone, label: late ? "미제출" : "작성 전", late, action: "쓰기", href: `${groupHref}#new-report`, primary: true };
}

