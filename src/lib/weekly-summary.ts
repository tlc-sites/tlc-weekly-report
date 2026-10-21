export type SummaryReport={id:string;group_id:string;author_name?:string;duty_part?:string;meeting_date:string;meeting_label:string|null;status:string;details:Record<string,unknown>;service:{name:string;sort_order?:number}|null;service_type_id?:string|null;group_meeting_type_id?:string|null};
export type SummaryGroup={id:string;name:string;type:string;sort_order?:number;parent_id?:string|null;settings?:Record<string,unknown>};
export type SummaryIncident={id:string;title:string;occurred_on:string;service_id:string|null;service_name:string;circumstances:string;response:string;status:string;group_ids:string[]};
export type SummaryBlock={key:string;kind:string;title:string;order:number;reports:SummaryReport[];incidents:SummaryIncident[]};
const serviceLabel=(name:string)=>({"1부 예배":"주일 1부","2부 예배":"주일 2부","3부 예배":"주일 3부","라이프라인":"주일 라이프라인"}[name]??name);
export function weeklyBlocks(reports:SummaryReport[],groups:SummaryGroup[],incidents:SummaryIncident[]=[]){
 const map=new Map(groups.map(g=>[g.id,g]));const blocks=new Map<string,SummaryBlock>();
 for(const r of reports.filter(r=>r.status!=="draft")){
  const g=map.get(r.group_id);if(!g)continue;
  const worship=g.type==="worship",service=r.service?.name??r.meeting_label??"예배·모임";
  const key=worship?"service:"+(r.service_type_id??service)+":"+r.meeting_date:"group:"+g.id;
  if(!blocks.has(key))blocks.set(key,{key,kind:worship?"worship":g.type==="education"?"education":"other",title:worship?serviceLabel(service)+" · "+r.meeting_date:g.name,order:worship?(r.service?.sort_order??20):g.type==="education"?100+(g.sort_order??0):200+(g.sort_order??0),reports:[],incidents:[]});
  blocks.get(key)!.reports.push(r);
 }
 for(const i of incidents){
  const key="service:"+(i.service_id??i.service_name)+":"+i.occurred_on;
  if(!blocks.has(key))blocks.set(key,{key,kind:"worship",title:serviceLabel(i.service_name)+" · "+i.occurred_on,order:20,reports:[],incidents:[]});
  blocks.get(key)!.incidents.push(i);
 }
 for(const block of blocks.values())block.reports.sort((a,b)=>(map.get(a.group_id)?.sort_order??0)-(map.get(b.group_id)?.sort_order??0)||a.meeting_date.localeCompare(b.meeting_date)||(a.author_name??"").localeCompare(b.author_name??""));
 return [...blocks.values()].sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title));
}
const fieldLabels:Record<string,string>={sermon_passage:"말씀 본문",sermon_content:"말씀·예배 내용",service_staff:"예배위원",song_list:"송리스트",preacher:"설교자",content:"진행 내용",activity:"공과·활동",notes:"사역 내용·특이사항",issue_summary:"이슈·조치",topic:"모임 주제",sharing_topic:"나눔 주제",sharing_passage:"나눔 범위",sharing_place:"나눔 장소"};
export function reportSummaryLines(r:SummaryReport){
 const lines=Object.entries(fieldLabels).flatMap(([key,label])=>typeof r.details[key]==="string"&&r.details[key]?[label+": "+r.details[key]]:[]);
 const result=r.details.result;if(result==="minor")lines.unshift("경미한 이슈");if(result==="incident")lines.unshift("예배 사고");
 for(const key of ["sections","texts"])if(r.details[key]&&typeof r.details[key]==="object")for(const [name,body]of Object.entries(r.details[key] as Record<string,unknown>))if(typeof body==="string"&&body)lines.push((({worship:"예배",adults:"장년부",young_adults:"청년부",school:"교회학교",obed_edom:"오벧에돔",newcomers:"새가족 현황",welcome:"웰컴팀",training:"새가족 훈련"} as Record<string,string>)[name]??name)+": "+body);
 if(Array.isArray(r.details.requests))for(const item of r.details.requests)if(item&&typeof item.content==="string")lines.push("요청사항: "+item.content);
 return lines;
}
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function weeklyEmailHtml(week:string,reports:SummaryReport[],groups:SummaryGroup[],incidents:SummaryIncident[]=[]){
 const blocks=weeklyBlocks(reports,groups,incidents);const names=new Map(groups.map(g=>[g.id,g.name]));
 const sent=reports.filter(r=>r.status!=="draft");const warnings=sent.filter(r=>r.details.result==="minor"||r.details.result==="incident").length;
 let html='<div style="background:#f8f4f0;padding:24px 12px;font-family:Arial,Malgun Gothic,sans-serif;color:#352b2b;line-height:1.65"><div style="max-width:680px;margin:auto"><p style="color:#692d2d">TLC 교회 보고서</p><h1 style="font-size:24px">주간 사역 요약</h1><p>'+esc(week)+' 주간 · 금요일 오후 5시 기준</p><div style="background:#fffdf9;border:1px solid #e2d4ce;border-radius:12px;padding:18px"><h2>한눈에</h2><p>제출 보고 '+sent.length+'건 · 예배 사고/경미한 이슈 보고 '+warnings+'건 · 예배 이슈 '+incidents.length+'건</p></div>';
 for(const b of blocks){html+='<section style="background:#fffdf9;border:1px solid #e2d4ce;border-radius:12px;padding:18px;margin:16px 0"><h2 style="font-size:20px;color:#692d2d">'+esc(b.title)+'</h2>';
 for(const r of b.reports)html+='<div style="border-top:1px solid #e2d4ce;padding:12px 0"><h3 style="font-size:16px">'+esc(names.get(r.group_id))+' · '+esc(r.author_name||"작성자")+(r.duty_part?' · '+esc(r.duty_part):'')+'</h3>'+reportSummaryLines(r).map(line=>'<p style="white-space:pre-wrap">'+esc(line)+'</p>').join('')+'<a href="https://tlc-weekly-report.vercel.app/reports/'+encodeURIComponent(r.id)+'">보고 원문 보기</a></div>';
 for(const i of b.incidents)html+='<div style="border-top:1px solid #e2d4ce;padding-top:12px"><h3>'+esc(i.title)+'</h3><p style="white-space:pre-wrap">'+esc(i.circumstances)+'</p><p style="white-space:pre-wrap">조치: '+esc(i.response)+'</p><a href="https://tlc-weekly-report.vercel.app/incidents/'+encodeURIComponent(i.id)+'">이슈 원문 보기</a></div>';
 html+='</section>';}
 return html+'<p>개인 기도제목·비공개 메시지와 상세 출결은 로그인 후 권한에 따라 확인하실 수 있습니다.</p><a href="https://tlc-weekly-report.vercel.app/weekly-summary?week='+encodeURIComponent(week)+'">앱에서 주간 요약 전체 보기</a></div></div>';
}
