import {Suspense} from "react";
import Link from "@/components/pending-link";
import {redirect} from "next/navigation";
import {requireActive,isClergy,isSenior} from "@/lib/auth";
import {listGroupsOrdered,NAV_CATEGORY_LABEL,groupCategory} from "@/lib/groups";
import {BackLink,Card,Loading,PageTitle} from "@/components/ui";
export default function Page(){return <Suspense fallback={<Loading/>}><Content/></Suspense>;}
async function Content(){
 const {supabase,profile}=await requireActive();if(!isClergy(profile))redirect("/");
 const groups=await listGroupsOrdered(supabase);
 const checks=await Promise.all(groups.map(async group=>{if(isSenior(profile))return {group,allowed:true};const {data,error}=await supabase.rpc("assigned_clergy",{gid:group.id});if(error)throw error;return {group,allowed:Boolean(data)};}));
 const managed=checks.filter(c=>c.allowed).map(c=>c.group);
 return <><BackLink href="/">홈</BackLink><PageTitle sub="담당하는 팀의 구성원과 역할을 관리해 주세요.">담당 팀 관리</PageTitle><p className="mb-4 text-sm text-muted">명단에 추가해도 로그인 계정이나 보고서 작성 권한은 생기지 않습니다. 제외한 명단은 다시 추가할 수 있습니다.</p>{!managed.length?<Card>아직 담당교역자로 배정된 팀이 없습니다. 관리자에게 담당 파트 배정을 요청해 주세요.</Card>:Object.entries(NAV_CATEGORY_LABEL).map(([category,label])=>{const parts=managed.filter(g=>groupCategory(g)===category);return parts.length?<section key={category} className="mb-6"><h2 className="mb-3 font-semibold">{label}</h2><div className="flex flex-col gap-2">{parts.map(g=><Link key={g.id} href={"/groups/"+g.id+"/team"} className="flex min-h-16 items-center justify-between rounded-xl border border-border bg-surface p-4 font-semibold text-accent"><span>{g.name}</span><span className="text-sm">명단 관리 ›</span></Link>)}</div></section>:null;})}</>;
}
