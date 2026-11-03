import "server-only";
import {createAdminClient} from "./supabase/admin";
import {loadPrintPack,printRange} from "./print-pack";
import {printFileName,renderPrintPdf} from "./print-pdf";
import {driveConfigured,uploadPdfToDrive} from "./google-drive";
import {todayKST,weekdayOf} from "./week";

/** 만든 시각 표시. 예: 11/10(화) 13:02 */
export function printStamp(now=new Date()){
 const day=todayKST();const time=now.toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false});
 return `${Number(day.slice(5,7))}/${Number(day.slice(8,10))}(${"일월화수목금토"[weekdayOf(day)]}) ${time}`;
}

// 화요일 13시 크론: 금~월 보고를 PDF로 만들어 구글 드라이브에 올린다. 다시 실행하면 같은 파일을 새 내용으로 바꾼다.
export async function runPrintPack({dryRun=false}={}){
 if(process.env.PRINT_PACK_ENABLED!=="true")return {skipped:"disabled"};
 if(!driveConfigured())return {skipped:"google drive not configured"};
 const {from,to}=printRange(todayKST());
 const pack=await loadPrintPack(createAdminClient(),from,to);
 if(dryRun)return {from,to,reports:pack.reports.length,incidents:pack.incidents.length};
 const pdf=await renderPrintPdf(pack,printStamp());
 const file=await uploadPdfToDrive(printFileName(pack),pdf);
 return {from,to,reports:pack.reports.length,bytes:pdf.length,fileId:file.id,replaced:file.replaced};
}
