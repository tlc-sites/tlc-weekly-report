import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {Card} from "./ui";
export async function SharedWorshipStaff({serviceId,date}:{serviceId:string|null;date:string}){if(!serviceId)return null;const supabase=await createClient();const {data,error}=await supabase.from("worship_staff").select("staff").eq("service_id",serviceId).eq("held_on",date).maybeSingle();if(error)throw error;return <Card className="mb-4"><h2 className="font-semibold">공유 예배위원</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{data?.staff||"아직 등록된 예배위원이 없습니다."}</p><Link href={"/worship-staff?date="+date} className="mt-2 inline-block text-sm text-accent underline">공유 명단 보기 · 교역자 수정</Link></Card>;}
