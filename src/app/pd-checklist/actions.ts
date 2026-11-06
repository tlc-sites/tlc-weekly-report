"use server";
import {randomBytes} from "node:crypto";
import {requireActive,canManage} from "@/lib/auth";
import {parseTemplate} from "@/lib/pd-template-schema";

export type SaveTemplateResult={ok:true;service:string;version:number}|{ok:false;errors:string[]};

const MESSAGES:Record<string,string>={
 "version conflict":"다른 관리자가 먼저 저장했습니다. 새로고침해서 최신 내용으로 다시 고쳐 주세요.",
 "admin required":"관리자만 저장할 수 있습니다.",
 "bad template":"체크리스트 형식이 맞지 않습니다.",
};

// 템플릿을 새 버전으로 저장한다. asNew면 지금 내용으로 새 예배(새 키, v1)를 만든다.
export async function savePdTemplate(input:{service:string;baseVersion:number;content:unknown;asNew?:boolean}):Promise<SaveTemplateResult>{
 const {supabase,profile}=await requireActive();
 if(!canManage(profile))return {ok:false,errors:[MESSAGES["admin required"]]};
 const parsed=parseTemplate(input.content);
 if(!parsed.ok)return parsed;
 const service=input.asNew?"s"+randomBytes(5).toString("hex"):input.service;
 if(!/^[a-z0-9_]{1,20}$/.test(service))return {ok:false,errors:["예배를 찾지 못했습니다."]};
 const {data,error}=await supabase.rpc("pd_template_save",{p_service:service,p_base_version:input.asNew?0:input.baseVersion,p_content:parsed.data});
 if(error)return {ok:false,errors:[MESSAGES[error.message]??"저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요."]};
 return {ok:true,service,version:data as number};
}
