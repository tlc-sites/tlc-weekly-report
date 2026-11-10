import {Suspense} from "react";
import Link from "@/components/pending-link";
import {redirect} from "next/navigation";
import {requireActive,isSenior} from "@/lib/auth";
import {listGroupsOrdered} from "@/lib/groups";
import {groupDisplayName} from "@/lib/group-display";
import {SubmitButton} from "@/components/submit-button";
import {Badge,Card,Field,Loading,PageTitle,inputClass,selectClass,textareaClass,smallButtonClass} from "@/components/ui";
import {createAgenda} from "./actions";

// 부서 안건방 목록. 두 분은 위에서 새 안건을 올리고, 총괄·부장·팀장·담당 교역자는 자기 부서 안건만 본다(RLS).
export default function Page(props:PageProps<"/agenda">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}

const STATUS_TABS=[["open","진행 중"],["done","완료"],["all","전체"]] as const;
const MESSAGES:Record<string,string>={invalid:"부서·제목·내용을 확인해 주세요.",save:"안건을 저장하지 못했습니다. 다시 시도해 주세요."};

async function Content({searchParams}:PageProps<"/agenda">){
 const {supabase,profile}=await requireActive();
 const {data:visible,error:visibleError}=await supabase.rpc("agenda_visible");if(visibleError)throw visibleError;
 if(!visible)redirect("/");
 const query=await searchParams;
 const tab=STATUS_TABS.some(([k])=>k===query.status)?String(query.status):"open";
 let list=supabase.from("agenda_items").select("id,title,status,created_at,last_activity_at,group:groups(name),author:profiles!agenda_items_author_id_fkey(real_name),replies:agenda_replies(count)").order("last_activity_at",{ascending:false}).limit(100);
 if(tab!=="all")list=list.eq("status",tab);
 const senior=isSenior(profile);
 const [{data,error},groups]=await Promise.all([list,senior?listGroupsOrdered(supabase):Promise.resolve([])]);
 if(error)throw error;
 const error_=typeof query.error==="string"?MESSAGES[query.error]:undefined;
 return <div className="page-wide">
  <Link href="/" className="mb-4 text-sm text-accent">← 홈</Link>
  <PageTitle sub={senior?"부서를 골라 안건을 올리면 그 부서의 총괄·부장·팀장과 담당 교역자가 보고 답글을 답니다.":"담임 목사님·담임 사모님이 우리 부서에 올린 안건입니다. 답글로 의견을 나눠 주세요."}>부서 안건</PageTitle>
  {error_?<p role="alert" className="mb-4 text-red-600">{error_}</p>:null}
  {query.deleted?<p role="status" className="mb-4 text-accent">안건을 지웠습니다.</p>:null}
  {senior?<Card className="mb-5"><details open={Boolean(error_)||undefined}>
   <summary className="cursor-pointer font-semibold text-accent">+ 새 안건 올리기</summary>
   <form action={createAgenda} className="mt-4 flex flex-col gap-3">
    <Field label="부서"><select name="group" required className={selectClass} defaultValue=""><option value="" disabled>부서를 골라 주세요</option>{groups.map(g=><option key={g.id} value={g.id}>{g.depth?"　":""}{g.label}</option>)}</select></Field>
    <Field label="제목"><input name="title" required maxLength={150} className={inputClass} placeholder="예) 겨울 수련회 교사 배치"/></Field>
    <Field label="내용"><textarea name="body" required rows={6} className={textareaClass} placeholder="부서와 나누고 싶은 안건을 적어 주세요."/></Field>
    <p className="text-xs text-muted">상위 부서(예: 교육부 전체)를 고르면 그 아래 파트의 총괄·담당 교역자도 함께 봅니다. 팀원·교사에게는 보이지 않습니다.</p>
    <SubmitButton className={smallButtonClass} pendingText="올리는 중…">안건 올리기</SubmitButton>
   </form></details></Card>:null}
  <nav aria-label="안건 상태" className="mb-4 flex gap-2">{STATUS_TABS.map(([k,label])=><Link key={k} href={k==="open"?"/agenda":"/agenda?status="+k} aria-current={tab===k?"page":undefined} className={"rounded-full border px-4 py-1.5 text-sm font-semibold "+(tab===k?"border-accent bg-accent text-white":"border-border bg-surface text-accent")}>{label}</Link>)}</nav>
  {!data?.length?<p className="text-sm text-muted">{tab==="done"?"완료된 안건이 없습니다.":"아직 안건이 없습니다."}</p>:
  <ul className="divide-y divide-border rounded-xl border border-border bg-surface">{data.map(a=>{
   const group=(a.group as unknown as {name:string}|null)?.name;const author=(a.author as unknown as {real_name:string}|null)?.real_name;
   const replies=(a.replies as unknown as {count:number}[]|null)?.[0]?.count??0;
   return <li key={a.id}><Link href={"/agenda/"+a.id} className="flex flex-col gap-1 px-4 py-3 hover:bg-background">
    <span className="flex flex-wrap items-center gap-2 text-xs text-muted"><Badge tone="accent">{group?groupDisplayName(group):"부서"}</Badge>{a.status==="done"?<Badge>완료</Badge>:null}<span>{author??"작성자"} · {new Date(a.created_at).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})}</span></span>
    <strong className="text-base">{a.title}</strong>
    <span className="text-xs text-muted">답글 {replies}개 · 마지막 활동 {new Date(a.last_activity_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit"})}</span>
   </Link></li>;})}</ul>}
 </div>;
}
