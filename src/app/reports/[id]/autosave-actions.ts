"use server";
import {z} from "zod";
import {requireActive} from "@/lib/auth";




export async function autosaveReport(id:string,version:string,raw:unknown){
 const {supabase}=await requireActive();if(!z.uuid().safeParse(id).success)return {ok:false as const,reason:"invalid"};
 const parsed=z.record(z.string(),z.json()).safeParse(raw);if(!parsed.success||JSON.stringify(parsed.data).length>262144)return {ok:false as const,reason:"invalid"};
 const {data,error}=await supabase.rpc("autosave_report",{p_report:id,p_expected_updated_at:version,p_payload:parsed.data});
 if(error||typeof data!=="string")return {ok:false as const,reason:/autosave conflict|requires draft/.test(error?.message??"")?"conflict":"save"};
 return {ok:true as const,version:data};
}
