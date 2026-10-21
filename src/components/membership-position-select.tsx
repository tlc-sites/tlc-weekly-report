import { isClergyPosition, positionsForGroup, type PositionGroup } from "@/lib/positions";

export function MembershipPositionSelect({ group, value = "", disabled = false, minister = false }: {
  group: PositionGroup & { id: string }; value?: string; disabled?: boolean; minister?: boolean;
}) {
  return <select name={`role:${group.id}`} defaultValue={value} disabled={disabled} className="h-10 rounded-lg border border-border bg-surface px-2">
    <option value="">배정 안 함</option>
    {value === "writer" || value === "reviewer" ? <option value={value}>{value === "writer" ? "기존 작성자 (직책 미지정)" : "기존 총괄·교역자 (직책 미지정)"}</option> : null}
    {positionsForGroup(group).map(title => <option key={title} value={`position:${title}`} disabled={isClergyPosition(title) && !minister}>{title}{isClergyPosition(title) && !minister ? " (교역자 지정 필요)" : ""}</option>)}
  </select>;
}
