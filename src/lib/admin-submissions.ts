import type { OverviewReport } from "@/components/home-overview";
import type { ReportClient } from "./groups";

export type SubmissionStatus = {
  groups: { id: string; name: string; type: string; schedule: string }[];
  reports: (OverviewReport & { submitted_at: string | null; can_open: boolean })[];
  no_meeting: string[];
  setup_expires_at: string | null;
};

export async function loadAdminSubmissions(supabase: ReportClient, week: string) {
  const { data, error } = await supabase.rpc("admin_submission_status", { p_week: week });
  if (error) throw error;
  return data as SubmissionStatus;
}
