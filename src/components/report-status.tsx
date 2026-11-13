import { Badge } from "./ui";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/report-forms";

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge tone={status === "draft" ? "muted" : "accent"}>
    {REPORT_STATUS_LABEL[status]}
  </Badge>;
}
