import {z} from "zod";
export const SESSION_LABEL={standard:"예배·사역 보고",meeting:"팀 회의 보고",curriculum:"공과 보고"} as const;
export const teamSessionPayload=z.object({details:z.object({session_type:z.enum(["meeting","curriculum"]),topic:z.string().trim().max(200),passage:z.string().trim().max(100),place:z.string().trim().max(200),content:z.string().trim().max(2000),members:z.array(z.object({name:z.string().trim().min(1).max(100),present:z.boolean(),note:z.string().trim().max(500),follow_up:z.string().trim().max(500)})).max(100)}),messages:z.object({pastor:z.string().trim().max(2000),pastor_wife:z.string().trim().max(2000)})});
export type TeamSessionPayload=z.infer<typeof teamSessionPayload>;
export const isTeamSession=(details:Record<string,unknown>)=>details.session_type==="meeting" || details.session_type==="curriculum";
