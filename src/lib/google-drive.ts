import "server-only";

// 구글 드라이브 업로드 (drive.file 권한: 이 앱이 만든 폴더·파일만 볼 수 있다).
// 개인 구글 계정은 서비스 계정 저장이 막혀 있어, 한 번 받아 둔 OAuth refresh token으로 접근한다.
// 필요한 환경변수: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN
// 폴더 이름은 GOOGLE_DRIVE_FOLDER_NAME (없으면 "TLC 교회 보고서 인쇄본"). 없으면 앱이 만든다.
const API="https://www.googleapis.com/drive/v3";
const UPLOAD="https://www.googleapis.com/upload/drive/v3";
const FOLDER="application/vnd.google-apps.folder";

export function driveConfigured(){
 return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID&&process.env.GOOGLE_DRIVE_CLIENT_SECRET&&process.env.GOOGLE_DRIVE_REFRESH_TOKEN);
}

async function accessToken(){
 const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({client_id:process.env.GOOGLE_DRIVE_CLIENT_ID!,client_secret:process.env.GOOGLE_DRIVE_CLIENT_SECRET!,refresh_token:process.env.GOOGLE_DRIVE_REFRESH_TOKEN!,grant_type:"refresh_token"})});
 const body=await res.json().catch(()=>({}));
 // invalid_grant: 토큰이 취소됐거나(구글 계정에서 접근 해제) 테스트 모드라 7일이 지나 만료됨
 if(!res.ok||!body.access_token)throw new Error("google token failed: "+(body.error??res.status));
 return body.access_token as string;
}

async function call<T>(token:string,url:string,init:RequestInit={}):Promise<T>{
 const res=await fetch(url,{...init,headers:{Authorization:"Bearer "+token,...init.headers}});
 if(!res.ok)throw new Error(`google drive ${res.status}: ${(await res.text()).slice(0,200)}`);
 return res.json() as Promise<T>;
}

const quote=(v:string)=>"'"+v.replace(/\\/g,"\\\\").replace(/'/g,"\\'")+"'";
async function findOne(token:string,q:string){
 const {files}=await call<{files:{id:string;webViewLink?:string}[]}>(token,`${API}/files?${new URLSearchParams({q:q+" and trashed=false",fields:"files(id,webViewLink)",spaces:"drive",pageSize:"1"})}`);
 return files[0]??null;
}

/** 폴더에 같은 이름 파일이 있으면 내용을 바꾸고, 없으면 새로 올린다. */
export async function uploadPdfToDrive(name:string,pdf:Uint8Array){
 const token=await accessToken();
 const folderName=process.env.GOOGLE_DRIVE_FOLDER_NAME?.trim()||"TLC 교회 보고서 인쇄본";
 const folder=await findOne(token,`name=${quote(folderName)} and mimeType=${quote(FOLDER)}`)
  ??await call<{id:string}>(token,`${API}/files?fields=id`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:folderName,mimeType:FOLDER})});
 const existing=await findOne(token,`name=${quote(name)} and ${quote(folder.id)} in parents`);
 if(existing){
  const updated=await call<{id:string;webViewLink?:string}>(token,`${UPLOAD}/files/${existing.id}?uploadType=media&fields=id,webViewLink`,{method:"PATCH",headers:{"Content-Type":"application/pdf"},body:Buffer.from(pdf)});
  return {...updated,replaced:true,folderId:folder.id};
 }
 const boundary="tlc"+crypto.randomUUID();
 const body=Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[folder.id],mimeType:"application/pdf"})}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
  Buffer.from(pdf),Buffer.from(`\r\n--${boundary}--`)]);
 const created=await call<{id:string;webViewLink?:string}>(token,`${UPLOAD}/files?uploadType=multipart&fields=id,webViewLink`,{method:"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body});
 return {...created,replaced:false,folderId:folder.id};
}
