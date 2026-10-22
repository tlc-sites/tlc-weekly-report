"use server";
import {z} from "zod";
import {requireActive,isSenior} from "@/lib/auth";
import {reportSummaryLines} from "@/lib/weekly-summary";
import {translateContent} from "@/lib/translation-provider";
export async function translateEntry(kind:"report"|"comment",id:string,target:"ko"|"en"){
 const {supabase,profile}=await requireActive();if(!z.uuid().safeParse(id).success||!["ko","en"].includes(target))return {error:"invalid"};let source="";
 if(kind==="report"){
  if(!isSenior(profile))return {error:"forbidden"};const {data,error}=await supabase.from("reports").select("details,status").eq("id",id).neq("status","draft").maybeSingle();if(error||!data)return {error:"forbidden"};
  const {data:issues,error:issuesError}=await supabase.from("report_issues").select("category,content,action").eq("report_id",id);if(issuesError)return {error:"unavailable"};
  source=reportSummaryLines({details:{...data.details,issue_summary:(issues??[]).map(i=>i.category+" · "+i.content+(i.action?" / 조치: "+i.action:"")).join("\n")}} as Parameters<typeof reportSummaryLines>[0]).join("\n");
 }else if(kind==="comment"){const {data,error}=await supabase.from("report_comments").select("body").eq("id",id).maybeSingle();if(error||!data)return {error:"forbidden"};source=data.body;}else return {error:"invalid"};
 if(!source.trim())return {text:""};if(source.length>24000)return {error:"too-long"};
 const key=process.env.ANTHROPIC_API_KEY?.trim(),model=process.env.TRANSLATE_MODEL?.trim();if(process.env.TRANSLATION_ENABLED!=="true"||!key||!model)return {error:"not-configured"};
 try{return {text:await translateContent(source,target,{key,model})};}catch{return {error:"unavailable"};}
}
