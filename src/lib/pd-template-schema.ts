// PD 체크리스트 템플릿 검사. 편집 화면(저장 전 안내)과 저장 액션(서버)이 같이 쓴다.
// 테스트에서 바로 불러 쓰도록 상대 경로 모듈은 타입만 가져온다.
import {z} from "zod";
import type {Item,PdTemplate} from "./pd-checklist";

const ID=/^[A-Za-z0-9_]{1,40}$/;
const id=z.string().regex(ID);
const text=(max:number)=>z.string().trim().min(1).max(max);
const opt=(max:number)=>z.string().trim().max(max);
const offset=z.number().int().min(-600).max(600);
const cond=z.string().nullable().optional();

const item=z.discriminatedUnion("type",[
 z.object({type:z.literal("check"),id,text:text(120),emphasis:z.enum(["strong","highlight"]).optional(),teams:z.array(text(20)).max(10).optional(),condition:cond}),
 z.object({type:z.literal("heading"),text:text(60)}),
 z.object({type:z.literal("checkGroup"),layout:z.enum(["columns","auto"]),columns:z.number().int().min(1).max(4).nullable().optional(),items:z.array(z.object({id,text:text(40)})).min(1).max(20)}),
 z.object({type:z.literal("note"),parts:z.array(z.object({text:z.string().min(1).max(120),bold:z.boolean()})).min(1).max(10)}),
 z.object({type:z.literal("locationMatrix"),
  columns:z.array(z.object({key:z.string().regex(/^[a-z0-9]{1,8}$/),label:text(20)})).min(1).max(6),
  rows:z.array(z.object({id:z.string().regex(/^[A-Za-z0-9_]{1,30}$/),label:text(40)})).min(1).max(12)}),
]);
const items=z.array(item).max(30);

const block=z.object({
 id,offsetMin:offset,label:text(20),title:opt(40),style:z.enum(["default","accent","cue","go"]),
 arrivals:z.array(z.object({offsetMin:offset,text:text(80),place:opt(80).optional()})).max(6).optional(),
 items,
});

const flowStep=z.object({
 id,label:text(30),next:opt(60),style:z.enum(["countdown","liveStart","start","default","optional","liveEnd","end"]),
 sub:opt(30).optional(),subWhen:z.record(z.string(),text(30)).optional(),condition:cond,flag:opt(20).nullable().optional(),offsetMin:offset.optional(),
});

export const pdTemplateSchema=z.object({
 id:z.string().optional(),
 name:text(40),
 start:z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
 flowType:z.string().max(20),
 handoverTo:opt(40).optional(),
 conditions:z.array(z.object({id:z.string().regex(/^[a-z0-9_]{1,20}$/),label:text(30),tag:text(20),default:z.boolean(),autoRule:opt(100).optional()})).max(6),
 teams:z.array(text(20)).max(12),
 page1:z.object({title:text(40),rows:z.array(z.array(block).min(1).max(6)).min(1).max(3)}),
 page2:z.object({
  title:text(40),banner:opt(80),
  flow:z.array(flowStep).min(1).max(20),
  roster:z.array(z.object({group:text(20),sub:opt(30),fields:z.array(z.object({id,label:text(30),span:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(6)]),multiple:z.boolean()})).min(1).max(12)})).max(8),
  during:z.object({title:text(30),items}),
  after:z.object({title:text(30),items}),
  report:z.object({
   title:opt(30).optional(),
   categories:z.array(z.object({id,text:text(30)})).max(12),
   fields:z.array(z.object({id,label:text(20),type:z.enum(["text","choice"]),options:z.array(text(20)).max(6).optional(),placeholder:opt(60).optional()})).max(10),
  }),
 }),
});

/** 체크 칸 ID(회차의 checks에 저장되는 키) 모두. 항목·그룹·위치표·FLOW·리포트 분류가 한 이름 공간을 쓴다. */
export function allCheckIds(t:PdTemplate){
 const of=(list:Item[])=>list.flatMap(i=>i.type==="check"?[i.id]:i.type==="checkGroup"?i.items.map(x=>x.id):i.type==="locationMatrix"?i.rows.flatMap(r=>i.columns.map(c=>r.id+c.key)):[]);
 return [...t.page1.rows.flat().flatMap(b=>of(b.items)),...t.page2.flow.map(s=>s.id),...of(t.page2.during.items),...of(t.page2.after.items),...t.page2.report.categories.map(c=>c.id)];
}

const NAMES:Record<string,string>={page1:"1페이지",page2:"2페이지",rows:"줄",items:"항목",arrivals:"도착 시각",flow:"FLOW",roster:"담당자",fields:"칸",during:"예배 진행 중",after:"예배 종료 후",report:"PD REPORT",categories:"문제 분류",conditions:"조건",teams:"팀",parts:"문구",columns:"열",
 name:"예배 이름",start:"시작 시각",title:"제목",text:"문구",label:"이름",tag:"표시",next:"이때 준비",sub:"보조 문구",offsetMin:"분",place:"장소",group:"구분",banner:"안내 문구",placeholder:"안내 글",options:"선택지",flag:"표시",handoverTo:"인수인계 대상",span:"너비"};
/** 문제 위치를 '1페이지 › 1줄 2번째 블록 › 항목 3번째 › 문구'처럼 읽기 쉽게 */
function where(path:PropertyKey[]){
 const out:string[]=[];
 for(let i=0;i<path.length;i++){
  const p=path[i],a=path[i+1],b=path[i+2];
  if(p==="rows"&&typeof a==="number"){out.push(`${a+1}줄`+(typeof b==="number"?` ${b+1}번째 블록`:""));i+=typeof b==="number"?2:1;continue;}
  const name=NAMES[String(p)]??String(p);
  if(typeof a==="number"){out.push(`${name} ${a+1}번째`);i++;}else out.push(typeof p==="number"?`${p+1}번째`:name);
 }
 return out.join(" › ");
}

export type ParseResult={ok:true;data:PdTemplate}|{ok:false;errors:string[]};

/** 템플릿을 검사해 저장할 모양으로 돌려준다. 실패하면 사람이 읽을 안내 문구 목록. */
export function parseTemplate(raw:unknown):ParseResult{
 const r=pdTemplateSchema.safeParse(raw);
 if(!r.success)return {ok:false,errors:r.error.issues.slice(0,8).map(i=>{
  const what=i.code==="too_small"?(i.origin==="string"?"비어 있습니다":"하나 이상 있어야 합니다"):i.code==="too_big"?"너무 길거나 많습니다":i.code==="invalid_format"?"형식이 맞지 않습니다":"값이 올바르지 않습니다";
  return `${where(i.path)}: ${what}`;})};
 const t=r.data as PdTemplate;const errors:string[]=[];
 const ids=allCheckIds(t);const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
 if(dup.length)errors.push(`체크 칸 ID가 겹칩니다: ${[...new Set(dup)].join(", ")}`);
 if(ids.some(x=>!ID.test(x)))errors.push("위치표의 칸 ID가 너무 깁니다");
 const uniq=(label:string,list:string[])=>{if(new Set(list).size!==list.length)errors.push(`${label} ID가 겹칩니다`);};
 uniq("담당자 칸",t.page2.roster.flatMap(g=>g.fields.map(f=>f.id)));
 uniq("보고 항목",t.page2.report.fields.map(f=>f.id));
 uniq("조건",t.conditions.map(c=>c.id));
 const conds=new Set(t.conditions.map(c=>c.id));
 const bad=(c:string|null|undefined)=>!!c&&!conds.has(c);
 const all=[...t.page1.rows.flat().flatMap(b=>b.items),...t.page2.during.items,...t.page2.after.items];
 if(all.some(i=>i.type==="check"&&bad(i.condition))||t.page2.flow.some(s=>bad(s.condition)||Object.keys(s.subWhen??{}).some(bad)))errors.push("없는 조건을 쓰는 항목이 있습니다");
 if(t.page2.report.fields.some(f=>f.type==="choice"&&(f.options?.length??0)<2))errors.push("PD REPORT의 선택 항목에는 선택지가 두 개 이상 있어야 합니다");
 return errors.length?{ok:false,errors}:{ok:true,data:t};
}
