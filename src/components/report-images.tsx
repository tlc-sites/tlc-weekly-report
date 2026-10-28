"use client";

import {useState} from "react";
import {attachReportImage,removeReportImage} from "@/app/reports/[id]/image-actions";
import {createClient} from "@/lib/supabase/client";
import {Card,inputClass,smallButtonClass} from "./ui";

export const MAX_REPORT_IMAGES=5;
const MAX_BYTES=1024*1024;

// 긴 변을 1600px로 줄인 JPEG로 바꾼다. 원본과 위치 정보는 올리지 않는다.
async function shrink(file:File){
 const bitmap=await createImageBitmap(file);
 const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
 const ctx=canvas.getContext("2d");if(!ctx)throw new Error("canvas");
 ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 for(const quality of [0.82,0.7,0.55]){
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
  if(blob&&blob.size<=MAX_BYTES)return blob;
 }
 throw new Error("too large");
}

export function ReportImages({reportId,images,canEdit}:{reportId:string;images:{id:string;url:string|null;caption:string}[];canEdit:boolean}){
 const [caption,setCaption]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 if(!images.length&&!canEdit)return null;
 async function upload(file:File){
  if(!["image/jpeg","image/png","image/webp","image/heic","image/heif"].includes(file.type)&&!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)){setMessage("사진 파일을 선택해 주세요.");return;}
  setBusy(true);setMessage("");
  try{
   const blob=await shrink(file);
   const path=`${reportId}/${crypto.randomUUID()}.jpg`;
   const {error}=await createClient().storage.from("report-images").upload(path,blob,{contentType:"image/jpeg"});
   if(error){setMessage("사진을 올리지 못했습니다. 인터넷 연결과 권한을 확인해 주세요.");return;}
   const result=await attachReportImage(reportId,path,caption);
   if(result.ok)setCaption("");else setMessage(result.message);
  }catch{setMessage("사진을 읽지 못했습니다. 다른 사진을 선택해 주세요.");}
  finally{setBusy(false);}
 }
 async function remove(id:string){setBusy(true);setMessage("");const result=await removeReportImage(id);if(!result.ok)setMessage(result.message);setBusy(false);}
 return <Card className="mb-4"><h2 className="font-semibold">사진 {images.length?`${images.length}장`:""}</h2>
  {canEdit?<p className="mt-1 text-xs text-muted">현장 상황을 사진으로 함께 보여 주세요. 보고서를 볼 수 있는 분만 볼 수 있으며, {MAX_REPORT_IMAGES}장까지 올릴 수 있습니다.</p>:null}
  {images.length?<ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map(image=><li key={image.id} className="flex flex-col gap-1">
   {image.url?<a href={image.url} target="_blank" rel="noreferrer">
    {/* eslint-disable-next-line @next/next/no-img-element -- 1시간짜리 서명 주소라 이미지 최적화 캐시를 거치지 않는다 */}
    <img src={image.url} alt={image.caption||"보고서 사진"} className="aspect-square w-full rounded-lg border border-border object-cover"/></a>:<div className="flex aspect-square items-center justify-center rounded-lg border border-border text-xs text-muted">불러오지 못함</div>}
   {image.caption?<p className="break-words text-xs">{image.caption}</p>:null}
   {canEdit?<button type="button" disabled={busy} onClick={()=>remove(image.id)} className="self-start text-xs text-danger underline">삭제</button>:null}
  </li>)}</ul>:null}
  {canEdit&&images.length<MAX_REPORT_IMAGES?<div className="mt-3 flex flex-col gap-2">
   <input value={caption} onChange={e=>setCaption(e.target.value)} maxLength={200} placeholder="사진 설명 (선택) 예: 2부 예배 강단 조명 밝기" className={inputClass}/>
   <label className={`${smallButtonClass} cursor-pointer text-center ${busy?"opacity-60":""}`}>{busy?"사진 올리는 중…":"사진 추가"}<input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void upload(file);}}/></label>
  </div>:null}
  {message?<p role="alert" className="mt-2 text-sm text-danger">{message}</p>:null}
 </Card>;
}
