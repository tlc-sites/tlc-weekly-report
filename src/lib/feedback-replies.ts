import type {ReportClient} from "./groups";
export type ReplyKind="report"|"incident"|"prayer"|"notice";
export type FeedbackReply={id:string;comment_id:string;body:string;created_at:string;author:{real_name:string|null}|null};
export async function loadFeedbackReplies(client:ReportClient,kind:ReplyKind,ids:string[]):Promise<FeedbackReply[]>{
 if(!ids.length)return [];
 const {data,error}=await client.from(kind+"_comment_replies").select("id,comment_id,body,created_at,author:profiles(real_name)").in("comment_id",ids).order("created_at");
 if(error)throw error;return (data??[]) as unknown as FeedbackReply[];
}
