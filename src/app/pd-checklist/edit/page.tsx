import {Suspense} from "react";
import {redirect} from "next/navigation";
import {requireActive,canManage} from "@/lib/auth";
import type {PdTemplate} from "@/lib/pd-checklist";
import {todayKST} from "@/lib/week";
import {upcomingSunday} from "@/lib/sunday-notice";
import {Card,Loading,PageTitle} from "@/components/ui";
import {PdTemplateEditor} from "../editor";
import "../pd-checklist.css";

export default function Page(props:PageProps<"/pd-checklist/edit">){return <Suspense fallback={<Loading/>}><Content {...props}/></Suspense>;}

// 관리자 편집 모드: 예배별 최신 템플릿을 고쳐 새 버전으로 저장한다. 최근 버전을 불러와 되돌릴 수도 있다.
async function Content({searchParams}:PageProps<"/pd-checklist/edit">){
 const {supabase,profile}=await requireActive();
 if(!canManage(profile))redirect("/pd-checklist");
 const q=await searchParams;
 const {data:rows,error}=await supabase.from("pd_templates").select("service_key,version,content->name,content->start").order("version",{ascending:false});
 const latest=new Map<string,{name:string;start:string}>();
 for(const r of (rows??[]) as {service_key:string;name:string;start:string}[])if(!latest.has(r.service_key))latest.set(r.service_key,{name:r.name,start:r.start});
 if(error||!latest.size)return <><PageTitle>체크리스트 편집</PageTitle><Card><p>템플릿을 불러오지 못했습니다.</p></Card></>;
 const services=[...latest.entries()].map(([key,t])=>({key,...t})).sort((a,b)=>a.start.localeCompare(b.start));
 const service=typeof q.service==="string"&&latest.has(q.service)?q.service:services[0].key;
 const {data:versions}=await supabase.from("pd_templates").select("version,content,created_at").eq("service_key",service).order("version",{ascending:false}).limit(20);
 const list=(versions??[]) as {version:number;content:PdTemplate;created_at:string}[];
 return <><span className="page-wide" hidden/><PdTemplateEditor key={service+":"+list[0].version} services={services} service={service} version={list[0].version} template={list[0].content} history={list.map(v=>({version:v.version,created_at:v.created_at,content:v.content}))} sunday={upcomingSunday(todayKST())} saved={typeof q.saved==="string"&&Number(q.saved)===list[0].version?list[0].version:undefined}/></>;
}
