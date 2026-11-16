import {weekOf} from "./week";
// 모임 알림 링크: 그 파트·그 주에 예배·모임과 날짜를 미리 골라 둔 작성 화면으로 연다.
// 알림 설정(모임 시간)에 예배가 연결돼 있으면 그 예배, 아니면 이름이 같은 파트 모임을 고른다.
export type ScheduleLink={group_id:string;label:string;service_type_id:string|null};
export type MeetingTypeLink={id:string;group_id:string;name:string};
export function reminderPick(groupId:string,label:string,schedules:ScheduleLink[],meetingTypes:MeetingTypeLink[]){
 const s=schedules.find(x=>x.group_id===groupId&&x.label===label&&x.service_type_id);
 if(s)return "service:"+s.service_type_id;
 const m=meetingTypes.find(x=>x.group_id===groupId&&x.name===label);
 return m?"meeting:"+m.id:null;
}
export function meetingReminderUrl(groupId:string,meetingDate:string,pick:string|null){
 return "/groups/"+groupId+"?"+new URLSearchParams({week:weekOf(meetingDate),...(pick?{pick,date:meetingDate}:{})})+"#new-report";
}
