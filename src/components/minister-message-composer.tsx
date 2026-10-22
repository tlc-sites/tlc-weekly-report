import {startMessage} from "@/app/messages/actions";
import {isSenior,type Profile} from "@/lib/auth";
import type {ReportClient} from "@/lib/groups";
import {Card,Field,inputClass,selectClass,textareaClass} from "./ui";
import {SubmitButton} from "./submit-button";
export async function MinisterMessageComposer({supabase,profile}:{supabase:ReportClient;profile:Profile}){
 if(!isSenior(profile))return null;
 const {data,error}=await supabase.from("profiles").select("id,real_name").eq("status","active").eq("is_minister",true).neq("id",profile.id).order("real_name");
 if(error)throw error;
 return <Card className="mb-4"><h2 className="font-semibold">교역자에게 메시지 보내기</h2><p className="mt-2 text-xs text-muted">담임목사님·담임사모님과 지정 수신자만 확인하는 비공개 대화입니다.</p>{data?.length?<form action={startMessage} className="mt-4 flex flex-col gap-3"><Field label="받는 교역자"><select name="recipient" required className={selectClass}><option value="">선택해 주세요</option>{data.map(p=><option key={p.id} value={p.id}>{p.real_name??"교역자"}</option>)}</select></Field><Field label="제목"><input name="subject" required maxLength={150} className={inputClass}/></Field><Field label="내용"><textarea name="body" required maxLength={5000} rows={4} className={textareaClass}/></Field><SubmitButton pendingText="보내는 중…">메시지 보내기</SubmitButton></form>:<p className="mt-3 text-sm text-muted">지정된 교역자가 없습니다. 관리에서 교역자 역할을 먼저 지정해 주세요.</p>}</Card>;
}
