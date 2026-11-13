import { StatusChip } from "./ui";
import { REPORT_STATUS_LABEL, type ReportStatus } from "@/lib/report-forms";

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <StatusChip tone={status === "draft" ? "draft" : status === "submitted" ? "wait" : "done"}>{REPORT_STATUS_LABEL[status]}</StatusChip>;
}
