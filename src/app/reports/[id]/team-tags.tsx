import {requireActive,isClergy} from "@/lib/auth";
import {groupDisplayName} from "@/lib/group-display";
import {Card} from "@/components/ui";
import {TeamTagForm,UntagButton} from "./team-tag-form";

type Tag={group_id:string;memo:string;created_at:string;group:{name:string}|null;tagger:{real_name:string|null}|null};

// 보고서 '팀에 공유' 칸: 누가 어느 팀에 어떤 메모로 공유했는지 보여 주고, 목사님·사모님·교역자는 여기서 공유한다.
export async function ReportTeamTags({reportId,groups}:{reportId:string;groups:{id:string;label:string}[]}){
 const {supabase,profile}=await requireActive();
 const {data}=await supabase.from("report_team_tags").select("group_id,memo,created_at,group:groups(name),tagger:profiles(real_name)").eq("report_id",reportId).order("created_at").returns<Tag[]>();
 const tags=data??[];
 const clergy=isClergy(profile);
 if(!tags.length&&!clergy)return null;
 return <Card className="mb-4">
  <h2 className="font-semibold">팀에 공유</h2>
  {tags.length?<ul className="mt-2 flex flex-col gap-2">{tags.map(t=><li key={t.group_id} className="rounded-lg bg-accent/5 px-3 py-2 text-sm">
   <div className="flex flex-wrap items-center gap-x-2"><b># {groupDisplayName(t.group?.name??"팀")}</b><span className="text-xs text-muted">{t.tagger?.real_name??"교역자"}님이 공유 · {new Date(t.created_at).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric"})}</span>{clergy?<span className="ml-auto"><UntagButton reportId={reportId} groupId={t.group_id}/></span>:null}</div>
   {t.memo?<p className="mt-1 whitespace-pre-wrap">“{t.memo}”</p>:null}
  </li>)}</ul>:<p className="mt-1 text-xs text-muted">이 보고서를 다른 팀이 함께 봐야 하면 팀을 골라 짧은 메모와 함께 알려 주세요.</p>}
  {clergy?<TeamTagForm reportId={reportId} groups={groups} tagged={tags.map(t=>t.group_id)}/>:null}
 </Card>;
}
