"use client";
import {useEffect,useState} from "react";
import {translateEntry} from "@/app/translation-actions";
import {useTranslationLanguage} from "./translation-language";
export function AutoTranslation({kind,id,source,senior=false}:{kind:"report"|"comment";id:string;source:string;senior?:boolean}){
 const {language}=useTranslationLanguage();const englishSource=!/[가-힣]/.test(source)&&/[a-zA-Z]/.test(source);const target=kind==="comment"&&englishSource&&language==="ko"?"ko":language==="en"&&senior?"en":null;
 const key=[kind,id,target,source].join(":");const [retry,setRetry]=useState(0);const [result,setResult]=useState<{key:string;text?:string;error?:string}|null>(null);
 useEffect(()=>{if(!target||!source.trim()||(target==="en"&&englishSource))return;let live=true;translateEntry(kind,id,target).then(r=>{if(live)setResult({...r,key});}).catch(()=>{if(live)setResult({key,error:"unavailable"});});return()=>{live=false;};},[id,kind,target,source,key,retry,englishSource]);
 if(!target||!source.trim()||(target==="en"&&englishSource))return null;const current=result?.key===key?result:null;
 return <div className="my-3 rounded-xl border border-accent/20 bg-accent/5 p-3 text-sm"><p className="mb-2 font-semibold text-accent">{target==="en"?"English translation":"한국어 자동 번역"}</p>{!current?<p role="status">번역 중…</p>:current.error?<p role="status">{current.error==="not-configured"?"자동 번역 설정이 아직 완료되지 않았습니다.":"지금 번역하지 못했습니다. 원문을 확인해 주세요."}{current.error!=="not-configured"?<button type="button" onClick={()=>setRetry(r=>r+1)} className="ml-2 underline">다시 번역</button>:null}</p>:<p lang={target} className="whitespace-pre-wrap break-words">{current.text}</p>}<p className="mt-2 text-xs text-muted">자동 번역입니다. 아래 원문과 함께 확인해 주세요.</p></div>;
}
