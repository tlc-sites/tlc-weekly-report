export type PositionGroup = { type: string; name: string; settings?: { report_category?: string } };
export const isClergyPosition = (title: string) => title === "교역자" || title === "담당교역자";
export const positionRole = (title: string): "writer" | "reviewer" =>
  ["교역자", "담당교역자", "총괄", "예배총괄", "팀장", "부팀장"].includes(title) ? "reviewer" : "writer";

export function positionsForGroup(group: PositionGroup): string[] {
  if (group.type === "education") return ["교역자", "총괄"];
  if (group.type === "other" && group.settings?.report_category !== "internship") return ["총괄", "담임", "파트"];
  if (group.name === "예배팀") return ["담당교역자", "예배인도자"];
  if (["음향팀", "조명팀", "자막팀"].includes(group.name)) return ["담당교역자", "오퍼레이터"];
  if (group.name === "영상팀") return ["담당교역자", "예배총괄", "팀장", "부팀장"];
  return ["담당교역자"];
}

// 기존 배정 값도 읽어 두어 수정하지 않은 소속이 사라지지 않게 한다.
export function parsePositionValue(value: string): { role: "writer" | "reviewer"; position: string | null } | null {
  if (value === "writer" || value === "reviewer") return { role: value, position: null };
  if (!value.startsWith("position:")) return null;
  const position = value.slice(9);
  if (!["교역자", "담당교역자", "총괄", "담임", "파트", "예배인도자", "오퍼레이터", "예배총괄", "팀장", "부팀장"].includes(position)) return null;
  return { role: positionRole(position), position };
}
