import {getSessionProfile,canManage,isClergy,isSenior} from "@/lib/auth";
import {listGroupsOrdered,groupCategory,NAV_CATEGORY_LABEL} from "@/lib/groups";
import {groupDisplayName} from "@/lib/group-display";
import {reportWeek,todayKST,formatWeek} from "@/lib/week";
import Link from "@/components/pending-link";
import {NotificationBell} from "./notification-bell";
import {DesktopReportColumn} from "./desktop-report-column";
import {DesktopSidebarNav,type SidebarSection,type WeekState} from "./desktop-sidebar-nav";

// PC(넓은 화면) 전용 왼쪽 사이드바. 휴대폰은 기존 상단 머리글·하단 메뉴를 그대로 쓴다(globals.css에서 너비로 전환).
export async function DesktopSidebar(){
 const {supabase,profile}=await getSessionProfile();
 if(profile?.status!=="active")return null;
 const week=reportWeek(undefined,todayKST());
 const [{data:memberships},groups,{data:reports},{data:noMeeting}]=await Promise.all([
  supabase.from("memberships").select("group_id,position").eq("user_id",profile.id),
  listGroupsOrdered(supabase),
  supabase.from("reports").select("group_id,status").eq("week",week),
  supabase.from("week_status").select("group_id").eq("week",week).eq("no_meeting",true),
 ]);
 const mine=new Set((memberships??[]).map(m=>m.group_id as string));
 // 홈의 '보고 작성' 목록과 같은 기준: 직접 소속이거나 상위 그룹 소속인 리프 그룹 (최상단은 전체)
 const parts=groups.filter(g=>g.childCount===0&&(isSenior(profile)||mine.has(g.id)||(g.parent_id!==null&&mine.has(g.parent_id))));
 const state=new Map<string,WeekState>();
 for(const g of noMeeting??[])state.set(g.group_id as string,"none");
 for(const r of reports??[]){const id=r.group_id as string,cur=state.get(id);if(r.status!=="draft")state.set(id,"done");else if(cur!=="done")state.set(id,"draft");}
 const sections:SidebarSection[]=Object.entries(NAV_CATEGORY_LABEL).map(([key,label])=>({key,label,groups:parts.filter(g=>groupCategory(g)===key).map(g=>({id:g.id,label:groupDisplayName(g.name),state:state.get(g.id)??"todo",direct:mine.has(g.id)}))})).filter(s=>s.groups.length);
 const positions=[...new Set((memberships??[]).map(m=>m.position as string|null).filter((p):p is string=>Boolean(p)))];
 const role=profile.recipient_role==="pastor"?"담임목사":profile.recipient_role==="pastor_wife"?"담임사모":[profile.is_minister?"교역자":"",profile.is_admin?"관리자":""].filter(Boolean).join(" · ")||positions[0]||"팀원";
 return <><aside data-print-hide className="app-sidebar" aria-label="사이드 메뉴">
  <div className="app-sidebar-brand">
   <Link href="/" className="min-w-0 flex-1"><b>TLC 교회 보고서</b><small>이번 주 {formatWeek(week)}</small></Link>
   <NotificationBell panel userId={profile.id} staff={canManage(profile)||isClergy(profile)}/>
  </div>
  <DesktopSidebarNav clergy={isClergy(profile)} manage={canManage(profile)} sections={sections} name={profile.real_name??"이름 없음"} role={role}/>
 </aside><DesktopReportColumn/></>;
}
