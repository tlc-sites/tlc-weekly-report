import { Badge } from "./ui";
import type { ReportStatus } from "@/lib/report-forms";

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge tone={status === "draft" ? "muted" : "accent"}>
    {status === "draft" ? "작성 중" : status === "submitted" ? "제출 완료" : "확인 완료"}
  </Badge>;
}
