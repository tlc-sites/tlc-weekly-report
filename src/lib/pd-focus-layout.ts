// PD 체크리스트 새 양식(2026-11 작업지시서: 섬기는 명단 · 큐시트 확인 · PD 집중 구간)으로 템플릿을 바꾼다.
// 편집 화면의 「새 양식으로 바꾸기」가 지금 내용에 이 함수를 적용하고, 저장하면 새 버전이 된다(지난 버전은 그대로 남는다).
// 예배마다 내용이 달라(편집 화면에서 고친 운영 양식) 칸 이름·라벨로 찾아 바꾸고, 못 찾은 것은 그대로 둔다.
import type {Block,CheckItem,FlowStep,Item,PdTemplate,RosterItem} from "./pd-checklist";

const clone=<X,>(x:X):X=>JSON.parse(JSON.stringify(x));

/** 명단에 둘 칸: [줄 이름, [칸 이름, roster 키, 너비, 2열]...]. 말씀·위원 줄은 지금 섬기는 사람 표의 칸(예배 인도 제외)을 그대로 쓴다. */
const WORSHIP:[string,string,number,boolean][]=[["인도","r1",.7,false],["악기","r18",2,true],["싱어","r9",1.5,true]];
// 음향팀은 PA·녹음/모니터링·중계 믹스로 나눠 한 줄(2026-11-25 요청). 큐시트에 녹음·중계 칸이 없는 예배(금요 등)는 기술팀 줄에 '음향' 한 칸.
const SOUND:[string,string,number,boolean][]=[["PA","r10",1.4,false],["녹음·모니터링","r19",1,false],["중계 믹스","r20",1,false]];
const TECH:[string,string,number,boolean][]=[["영상","r11",1,false],["자막","r13",1,false],["조명","r14",1,false],["사진","r12",1,false],["부산 교역자","r15",1,false],["부산 음향","r21",1,false]];

const hasText=(it:Item,re:RegExp)=>it.type==="check"&&re.test(it.text);
const label=(s:FlowStep)=>s.label.replace(/\s/g,"");

export type LayoutResult={template:PdTemplate;notes:string[]};

export function toFocusLayout(src:PdTemplate):LayoutResult{
 const t=clone(src);const notes:string[]=[];
 const blocks=t.page1.rows.flat();
 const rosterIds=new Set(t.page2.roster.flatMap(g=>g.fields.map(f=>f.id)));
 const cueIds=new Set(t.cue?[...t.cue.rows.flatMap(r=>r.lines.map(l=>l.key)),...t.cue.staff.map(s=>s.key)]:[]);
 const known=(k:string)=>rosterIds.has(k)||cueIds.has(k);
 // 새 체크 ID는 템플릿 어디에도 없는 것으로(항목·FLOW·리포트 분류·담당자 칸 등 모든 id)
 const used=new Set([...JSON.stringify(t).matchAll(/"id":"([^"]+)"/g)].map(m=>m[1]));
 const newId=(p:string)=>{let n=1;while(used.has(p+n))n++;used.add(p+n);return p+n;};

 // ---------- 1쪽: 섬기는 사람 표 → 오늘 섬기는 명단 ----------
 const pb=blocks.find(b=>b.items.some(i=>i.type==="people"));
 if(pb&&!pb.items.some(i=>i.type==="roster")){
  const people=pb.items.flatMap(i=>i.type==="people"?i.people:[]);
  const words=people.filter(p=>p.field&&p.field!=="r1"&&![...TECH,...SOUND].some(x=>x[1]===p.field)).map(p=>({label:p.field==="r2"?"설교":p.label,field:p.field!}));
  const line=(rows:[string,string,number,boolean][])=>rows.filter(([,k])=>known(k)).map(([l,k,w,two])=>({label:l,field:k,...(w!==1?{w}:{}),...(two?{two}:{})}));
  const sound=line(SOUND);const split=sound.length>1;
  const roster:RosterItem={type:"roster",lines:[
   {label:"말씀·위원",cols:words},
   {label:"예배팀",cols:line(WORSHIP)},
   ...(split?[{label:"음향팀",cols:sound}]:[]),
   {label:"기술팀",cols:[...(split?[]:sound.map(c=>({...c,label:"음향"}))),...line(TECH)]},
  ].filter(l=>l.cols.length)};
  pb.items=[roster];pb.title="오늘 섬기는 명단";pb.aside=t.cue?"이름은 모두 주일예배 큐시트에서 자동으로 채워집니다":"큐시트에 없는 칸은 눌러서 적습니다";
  notes.push("1쪽 섬기는 사람 표를 세 줄 명단으로 바꾸고 확인·도착·STANDBY 체크를 뺐습니다.");
 }else if(!pb)notes.push("섬기는 사람 표가 없어 명단은 바꾸지 않았습니다.");

 // ---------- 1쪽: 큐시트 확인(T-45 콘텐츠, 없으면 전체 상황 블록 맨 위) ----------
 if(t.cue&&!blocks.some(b=>b.items.some(i=>i.type==="cueCheck"))){
  const target=blocks.find(b=>b.label==="T-45"||/콘텐츠/.test(b.title))??blocks.find(b=>b!==pb&&/전체\s*상황/.test(b.title))??blocks.find(b=>b!==pb);
  if(target){target.items.unshift({type:"cueCheck",id:newId("q"),text:"주일예배 큐시트 확인",sub:"순서·담당자·송리스트"});notes.push(`'${target.label} ${target.title}' 블록 맨 위에 큐시트 확인을 넣었습니다.`);}
 }

 // ---------- 2쪽: PD 집중 구간 ----------
 const f=t.page2.flow;
 if(!f.some(s=>s.focus)){
  const w=f.findIndex(s=>/^찬양/.test(label(s)));
  const startAt=w>=0?w+1:f.findIndex(s=>s.style==="start")+1;
  let end=f.findIndex((s,i)=>i>=startAt&&(/^설교/.test(label(s))||/기도/.test(label(s))||s.style==="liveEnd"||s.style==="end"));
  if(end<0)end=f.length;
  const zone=f.slice(startAt,end);
  if(startAt>0&&zone.length){
   const cueRow=(re:RegExp)=>t.cue?.rows.find(r=>re.test(r.ko.replace(/\s/g,"")))?.id;
   const during=[...t.page2.during.items];
   const take=(re:RegExp)=>{const out:CheckItem[]=[];for(let i=during.length-1;i>=0;i--){const it=during[i];if(hasText(it,re)){out.unshift(it as CheckItem);during.splice(i,1);}}return out;};
   // 머리 체크: '다음 순서 담당자 위치 파악'(있으면 그 체크를 옮겨 기록을 잇는다)
   const head=take(/위치\s*파악/)[0];
   t.page2.focus={check:head?{id:head.id,text:head.text}:{id:newId("fz"),text:"다음 순서 담당자 위치 파악"}};
   const last=zone[zone.length-1];
   zone.forEach((s,zi)=>{
    const l=label(s);
    // 뒤에 말씀 합독이 있으면(사이에 성찬이 끼어도) 헌금 칸에 '말씀 합독위원 대기'
    const nextL=zone.slice(zi+1).map(label).join(" ");
    const add=(text:string):CheckItem=>({type:"check",id:newId("fz"),text});
    if(/영상소식/.test(l)){
     s.cue??=cueRow(/^광고/);
     s.focus={badge:"영상소식 있을 때",owners:[{text:"기술팀 전체"}],checks:take(/영상소식/).map(c=>({...c,condition:c.condition??s.condition??null}))};
    }else if(/헌금메시지/.test(l)){
     s.cue??=cueRow(/^헌금인도/)??cueRow(/^광고/);
     s.focus={badge:"인도자 등단",owners:known("r3")?[{field:"r3"}]:[],checks:[...take(/헌금\s*메시지\s*준비/),add("헌금위원 위치 확인")]};
    }else if(/^헌금$/.test(l)){
     const song=t.page2.roster.some(g=>g.fields.some(x=>x.id==="song_off"))||!!t.cue;
     s.focus={badge:song?"헌금송 · {song_off}":undefined,owners:[...(known("r7")?[{field:"r7",label:"헌금위원"}]:[]),{text:"헌금송 예배팀"}],
      checks:[...take(/공조\s*OFF/i),...(/말씀합독/.test(nextL)?[add("말씀 합독위원 대기")]:[])]};
    }else if(/말씀합독/.test(l)){
     s.cue??=cueRow(/^말씀봉독/);
     s.focus={badge:"본문 자막",owners:known("r4")?[{field:"r4"}]:[],checks:take(/마이크/)};
    }else{
     s.focus={owners:[],checks:[]};
    }
    if(!s.focus.badge)delete s.focus.badge;
   });
   // 남은 마이크 항목(설교자·기도 인도자 마이크)은 구간 마지막 칸으로
   const mic=take(/마이크/);if(mic.length)last.focus!.checks=[...(last.focus!.checks??[]),...mic];
   const endStep=f[end];
   if(endStep){
    if(/^설교/.test(label(endStep))){endStep.cue??=cueRow(/^설교/);if(known("r2"))t.page2.focus.endField="r2";}
   }
   t.page2.during.items=during;
   notes.push(`2쪽 FLOW에 PD 집중 구간(${zone.map(s=>s.label).join(" · ")})을 만들었습니다.`);
   if(during.some(i=>i.type==="check"))notes.push(`'예배 진행 중'에 옮기지 못한 항목 ${during.filter(i=>i.type==="check").length}개가 남아 그 카드는 그대로 보입니다.`);
  }else notes.push("찬양 다음 순서를 찾지 못해 집중 구간은 만들지 않았습니다.");
 }
 return {template:t,notes};
}

/** 이미 새 양식인지(명단 또는 집중 구간이 있는지) */
export const hasFocusLayout=(t:PdTemplate)=>t.page2.flow.some(s=>s.focus)||t.page1.rows.flat().some((b:Block)=>b.items.some(i=>i.type==="roster"));
