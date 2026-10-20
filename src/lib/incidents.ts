import { z } from "zod";

export const INCIDENT_STATUS = { open: "확인 필요", temporary: "조치 중", resolved: "해결" } as const;
export const incidentFields = z.object({
  title: z.string().trim().min(1).max(100),
  pastor: z.string().trim().max(100), participants: z.string().trim().max(500),
  circumstances: z.string().trim().min(1).max(3000),
  cause: z.string().trim().max(2000), response: z.string().trim().max(2000),
  prevention: z.string().trim().max(2000), follow_up_owner: z.string().trim().max(100),
  due_on: z.union([z.iso.date(),z.literal("")]),
  status: z.enum(["open","temporary","resolved"]),
}).refine(p=>p.status!=="resolved" || Boolean(p.response && p.prevention));

export type Incident = z.infer<typeof incidentFields> & {
  id: string; author_id: string; report_id: string | null; group_ids: string[];
  occurred_on: string; service_id: string | null; service_name: string;
  created_at: string; updated_at: string;
};
