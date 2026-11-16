"use server";
import {requireActive} from "@/lib/auth";
import {z} from "zod";
export type SiblingSermon={from_group:string;meeting_date:string;sermon_passage:string;preacher:string;sermon_summary:string;activity:string};
// 중등부 ↔ 고등부: 같은 날 상대 부서 보고의 설교·공과 네 칸만 받는다. 권한 확인은 DB 함수(sibling_sermon)가 한다.
export async function loadSiblingSermon(reportId:string):Promise<SiblingSermon|null|"error">{
 const {supabase}=await requireActive();
 if(!z.uuid().safeParse(reportId).success)return "error";
 const {data,error}=await supabase.rpc("sibling_sermon",{rid:reportId});
 if(error)return "error";
 return (data as SiblingSermon[]|null)?.[0]??null;
}
