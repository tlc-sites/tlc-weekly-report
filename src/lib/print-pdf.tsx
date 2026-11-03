import "server-only";
import path from "node:path";
import {Document,Font,Page,StyleSheet,Text,View,renderToBuffer} from "@react-pdf/renderer";
import {groupDisplayName} from "./group-display";
import {ISSUE_STATUS_LABEL,REPORT_STATUS_LABEL} from "./report-forms";
import {INCIDENT_STATUS} from "./incidents";
import {reportSummaryLines,weeklyBlocks} from "./weekly-summary";
import {weekdayOf} from "./week";
import type {PrintPack,PrintReport} from "./print-pack";

// 화요일 교역자 회의 인쇄본 PDF: 앞쪽은 회의 자료 요약, 뒤쪽은 파트별 보고 원문.
const FONT_DIR=path.join(process.cwd(),"assets","fonts");
Font.register({family:"NotoSansKR",fonts:[{src:path.join(FONT_DIR,"NotoSansKR-Regular.ttf")},{src:path.join(FONT_DIR,"NotoSansKR-Bold.ttf"),fontWeight:700}]});
// 한글은 띄어쓰기 없이 길게 이어질 수 있어 글자 단위로도 줄을 바꾼다(하이픈 없이).
Font.registerHyphenationCallback(word=>/[ᄀ-ᇿ㄰-㆏가-힯]/.test(word)?Array.from(word).flatMap(c=>[c,""]).slice(0,-1):[word]);

const ACCENT="#692d2d",MUTED="#6b5f5f",LINE="#e2d4ce";
const s=StyleSheet.create({
 page:{fontFamily:"NotoSansKR",fontSize:9.5,lineHeight:1.55,color:"#2b2222",paddingTop:36,paddingBottom:44,paddingHorizontal:40},
 brand:{fontSize:9,color:ACCENT},h1:{fontSize:18,lineHeight:1.4,fontWeight:700,marginTop:2},sub:{color:MUTED,marginBottom:12},
 h2:{fontSize:13,lineHeight:1.4,fontWeight:700,color:ACCENT,marginTop:14,marginBottom:6,paddingBottom:3,borderBottomWidth:1,borderBottomColor:ACCENT},
 h3:{fontSize:10.5,lineHeight:1.5,fontWeight:700},meta:{fontSize:8.5,color:MUTED,marginBottom:3},
 stats:{flexDirection:"row",gap:8,marginBottom:4},stat:{flexGrow:1,borderWidth:1,borderColor:LINE,borderRadius:4,padding:6},
 statNum:{fontSize:14,lineHeight:1.4,fontWeight:700},row:{flexDirection:"row",borderBottomWidth:0.5,borderBottomColor:LINE,paddingVertical:2.5},
 c1:{width:"16%"},c2:{width:"40%"},c3:{width:"28%"},c4:{width:"16%"},th:{fontWeight:700,color:MUTED},
 report:{borderTopWidth:0.5,borderTopColor:LINE,paddingTop:7,marginTop:7},line:{marginBottom:2},
 bullet:{marginBottom:3,paddingLeft:8},empty:{color:MUTED},
 footer:{position:"absolute",top:810,left:40,right:40,fontSize:8,lineHeight:1.2,color:MUTED,textAlign:"center"},
});

const DAY="일월화수목금토";
const md=(iso:string)=>`${Number(iso.slice(5,7))}/${Number(iso.slice(8,10))}(${DAY[weekdayOf(iso)]})`;
const status=(v:string)=>REPORT_STATUS_LABEL[v as keyof typeof REPORT_STATUS_LABEL]??v;

function attendance(r:PrintReport){
 return r.attend_snapshot!=null?`출석 ${r.attend_snapshot}${r.enrolled_snapshot!=null?` / 재적 ${r.enrolled_snapshot}`:""}명`:"";
}

function PrintDocument({pack,generatedAt}:{pack:PrintPack;generatedAt:string}){
 const names=new Map(pack.groups.map(g=>[g.id,groupDisplayName(g.name)]));
 const blocks=weeklyBlocks(pack.reports,pack.groups,pack.incidents);
 const reports=pack.reports;
 const reviewed=reports.filter(r=>r.status==="reviewed").length;
 const warnings=reports.filter(r=>r.details.result==="minor"||r.details.result==="incident");
 const issues=reports.flatMap(r=>r.issues.map(i=>({r,i})));
 const requests=reports.flatMap(r=>Array.isArray(r.details.requests)?(r.details.requests as {content?:unknown}[]).filter(q=>typeof q?.content==="string"&&q.content).map(q=>({r,text:String(q.content)})):[]);
 const who=(r:PrintReport)=>`${names.get(r.group_id)??""} · ${r.author_name||"작성자"}`;
 const range=`${md(pack.from)} ~ ${md(pack.to)}`;
 const footer=<Text style={s.footer} fixed render={({pageNumber,totalPages})=>`TLC 교회 보고서 · ${range} · ${pageNumber} / ${totalPages}쪽`}/>;
 return <Document title={`TLC 교회 보고서 ${pack.from}~${pack.to}`} author="TLC 교회 보고서" language="ko">
  <Page size="A4" style={s.page}>
   <Text style={s.brand}>TLC 교회 보고서</Text>
   <Text style={s.h1}>교역자 회의 자료</Text>
   <Text style={s.sub}>{range} 모임 보고 · {generatedAt} 기준 · 제출된 보고만 담았습니다(임시저장 제외).</Text>
   <View style={s.stats}>
    <View style={s.stat}><Text style={s.meta}>제출된 보고</Text><Text style={s.statNum}>{reports.length}건</Text></View>
    <View style={s.stat}><Text style={s.meta}>확인 완료 / 확인 대기</Text><Text style={s.statNum}>{reviewed} / {reports.length-reviewed}</Text></View>
    <View style={s.stat}><Text style={s.meta}>예배 사고·경미 이슈</Text><Text style={s.statNum}>{warnings.length}건</Text></View>
    <View style={s.stat}><Text style={s.meta}>이슈 기록</Text><Text style={s.statNum}>{pack.incidents.length}건</Text></View>
   </View>

   <Text style={s.h2}>이슈·요청사항</Text>
   {!issues.length&&!requests.length&&!warnings.length&&!pack.incidents.length?<Text style={s.empty}>기록된 이슈와 요청사항이 없습니다.</Text>:null}
   {warnings.map(r=><Text key={"w"+r.id} style={s.bullet}>• [{r.details.result==="incident"?"예배 사고":"경미한 이슈"}] {who(r)} ({md(r.meeting_date)})</Text>)}
   {issues.map(({r,i},n)=><Text key={"i"+n} style={s.bullet}>• [{i.category} · {ISSUE_STATUS_LABEL[i.status as keyof typeof ISSUE_STATUS_LABEL]??i.status}] {i.content}{i.action?` / 조치: ${i.action}`:""} — {who(r)}</Text>)}
   {requests.map(({r,text},n)=><Text key={"q"+n} style={s.bullet}>• [요청] {text} — {who(r)}</Text>)}
   {pack.incidents.map(i=><Text key={"x"+i.id} style={s.bullet}>• [이슈 · {INCIDENT_STATUS[i.status as keyof typeof INCIDENT_STATUS]??i.status}] {i.title} ({md(i.occurred_on)} {i.service_name}) — {i.author?.real_name??"작성자"}</Text>)}
   <Text style={s.h2}>보고 목록</Text>
   <View style={[s.row,s.th]}><Text style={s.c1}>날짜</Text><Text style={s.c2}>파트 · 예배·모임</Text><Text style={s.c3}>작성자</Text><Text style={s.c4}>상태</Text></View>
   {reports.length?blocks.flatMap(b=>b.reports as PrintReport[]).map(r=><View key={r.id} style={s.row} wrap={false}><Text style={s.c1}>{md(r.meeting_date)}</Text><Text style={s.c2}>{names.get(r.group_id)} · {r.service?.name??r.meeting_label??"모임"}</Text><Text style={s.c3}>{r.author_name||"작성자"}{r.duty_part?` · ${r.duty_part}`:""}</Text><Text style={s.c4}>{status(r.status)}</Text></View>):<Text style={s.empty}>이 기간에 제출된 보고가 없습니다.</Text>}

   {footer}
  </Page>

  <Page size="A4" style={s.page}>
   <Text style={s.h1}>보고 원문</Text>
   <Text style={s.sub}>{range} · 파트·예배별 순서</Text>
   {blocks.length?null:<Text style={s.empty}>이 기간에 제출된 보고가 없습니다.</Text>}
   {blocks.map(b=><View key={b.key}>
    <Text style={s.h2} minPresenceAhead={60}>{b.title}</Text>
    {(b.reports as PrintReport[]).map(r=><View key={r.id} style={s.report}>
     <Text style={s.h3} minPresenceAhead={30}>{names.get(r.group_id)} · {r.author_name||"작성자"}{r.duty_part?` · ${r.duty_part}`:""}</Text>
     <Text style={s.meta}>{md(r.meeting_date)} · {r.service?.name??r.meeting_label??"모임"} · {status(r.status)}{attendance(r)?` · ${attendance(r)}`:""}</Text>
     {reportSummaryLines(r).map((l,n)=><Text key={n} style={s.line}>{l}</Text>)}
     {r.issues.map((i,n)=><Text key={"i"+n} style={s.line}>이슈({i.category}): {i.content}{i.action?` / 조치: ${i.action}`:""}</Text>)}
    </View>)}
    {b.incidents.map(i=><View key={i.id} style={s.report}>
     <Text style={s.h3}>[이슈] {i.title}</Text>
     <Text style={s.meta}>{md(i.occurred_on)} · {i.author?.real_name??"작성자"} · {INCIDENT_STATUS[i.status as keyof typeof INCIDENT_STATUS]??i.status}</Text>
     <Text style={s.line}>상황: {i.circumstances}</Text>{i.response?<Text style={s.line}>조치: {i.response}</Text>:null}
    </View>)}
   </View>)}
   {footer}
  </Page>
 </Document>;
}

export function printFileName(pack:Pick<PrintPack,"from"|"to">){return `TLC 교회 보고서 ${pack.from}~${pack.to}.pdf`;}

export function renderPrintPdf(pack:PrintPack,generatedAt:string){
 return renderToBuffer(<PrintDocument pack={pack} generatedAt={generatedAt}/>);
}
