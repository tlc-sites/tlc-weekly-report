import {z} from "zod";
export const SESSION_LABEL={standard:"예배·사역 보고",meeting:"팀 회의 보고",curriculum:"공과 보고",assembly:"전체모임 보고"} as const;
// 전체모임 보고는 예배/기술팀에서만 고를 수 있다. 명단은 그 팀 명단에서 미리 채운다.
export const sessionKinds=(groupType:string)=>(Object.keys(SESSION_LABEL) as (keyof typeof SESSION_LABEL)[]).filter(k=>k!=="assembly"||groupType==="worship");
export const teamSessionPayload=z.object({details:z.object({session_type:z.enum(["meeting","curriculum","assembly"]),topic:z.string().trim().max(200),passage:z.string().trim().max(100),place:z.string().trim().max(200),content:z.string().trim(),members:z.array(z.object({name:z.string().trim().min(1).max(100),present:z.boolean(),note:z.string().trim(),follow_up:z.string().trim()})).max(150)}),messages:z.object({pastor:z.string().trim(),pastor_wife:z.string().trim()})});
export type TeamSessionPayload=z.infer<typeof teamSessionPayload>;
export const isTeamSession=(details:Record<string,unknown>)=>details.session_type==="meeting" || details.session_type==="curriculum" || details.session_type==="assembly";
type Mark={name?:unknown;present?:unknown;note?:unknown};
// 출결 요약: "출석 12명 · 결석 3명"과 결석자별 사유 한 줄씩.
export function attendanceLines(members:unknown):string[]{
  if(!Array.isArray(members)||!members.length)return [];
  const list=members as Mark[];const absent=list.filter(m=>m.present!==true);
  return [`출결: 출석 ${list.length-absent.length}명 · 결석 ${absent.length}명`,...(absent.length?["결석: "+absent.map(m=>String(m.name??"")+(typeof m.note==="string"&&m.note.trim()?`(${m.note.trim()})`:"")).join(", ")]:[])];
}
