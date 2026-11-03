import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('./tsx-loader.mjs',import.meta.url);
const {printRange}=await import('../src/lib/print-pack.ts');
const {renderPrintPdf,printFileName}=await import('../src/lib/print-pdf.tsx');
const {uploadPdfToDrive}=await import('../src/lib/google-drive.ts');

test('인쇄본 기간: 화요일 기준 4일 전 금요일 ~ 전날 월요일',()=>{
 assert.deepEqual(printRange('2026-11-10'),{tuesday:'2026-11-10',from:'2026-11-06',to:'2026-11-09'});
 // 다른 요일에 만들면 가장 최근 화요일 기준
 assert.deepEqual(printRange('2026-11-12'),{tuesday:'2026-11-10',from:'2026-11-06',to:'2026-11-09'});
 assert.deepEqual(printRange('2026-11-09'),{tuesday:'2026-11-03',from:'2026-10-30',to:'2026-11-02'});
});

test('인쇄본 PDF: 한글 글꼴로 요약과 보고 원문을 만든다',async()=>{
 const groups=[{id:'g1',name:'유치부',type:'education',sort_order:1},{id:'w',name:'예배팀',type:'worship',sort_order:0}];
 const base={author_name:'김교사',duty_part:'담당',meeting_label:null,service:null,attend_snapshot:10,enrolled_snapshot:12};
 const reports=[{...base,id:'r1',group_id:'g1',meeting_date:'2026-11-08',status:'reviewed',details:{notes:'띄어쓰기없이아주길게이어지는한글문장'.repeat(20),requests:[{content:'프로젝터 교체'}]},issues:[{category:'시설',content:'난방',action:null,status:'open'}]},
  {...base,id:'r2',group_id:'w',meeting_date:'2026-11-08',status:'submitted',details:{result:'incident',sermon_passage:'요 3:16'},service:{name:'2부 예배',sort_order:2},service_type_id:'s2',issues:[]}];
 const pdf=Buffer.from(await renderPrintPdf({from:'2026-11-06',to:'2026-11-09',groups,reports,incidents:[]},'11/10(화) 13:00'));
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 assert.ok(pdf.includes('NotoSansKR'),'한글 글꼴이 들어 있어야 한다');
 assert.ok(pdf.length<500000,'글꼴은 쓴 글자만 담겨 작아야 한다');
 const empty=Buffer.from(await renderPrintPdf({from:'2026-11-06',to:'2026-11-09',groups,reports:[],incidents:[]},'11/10(화) 13:00'));
 assert.equal(empty.subarray(0,5).toString(),'%PDF-');
 assert.equal(printFileName({from:'2026-11-06',to:'2026-11-09'}),'TLC 교회 보고서 2026-11-06~2026-11-09.pdf');
});

test('드라이브 업로드: 폴더가 없으면 만들고, 같은 이름 파일이 있으면 내용만 바꾼다',async()=>{
 Object.assign(process.env,{GOOGLE_DRIVE_CLIENT_ID:'cid',GOOGLE_DRIVE_CLIENT_SECRET:'secret',GOOGLE_DRIVE_REFRESH_TOKEN:'refresh',GOOGLE_DRIVE_FOLDER_NAME:"교회's 인쇄본"});
 const calls=[];const real=globalThis.fetch;let existing=null;
 globalThis.fetch=async(url,init={})=>{url=String(url);calls.push({url,init});const json=v=>new Response(JSON.stringify(v),{status:200});
  if(url.startsWith('https://oauth2.googleapis.com/token')){assert.equal(new URLSearchParams(init.body).get('refresh_token'),'refresh');return json({access_token:'at'});}
  assert.equal(init.headers.Authorization,'Bearer at');
  if(url.includes('/drive/v3/files?q=')){const q=new URL(url).searchParams.get('q');return json({files:q.includes('google-apps.folder')?[]:existing?[existing]:[]});}
  if(url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id'))return json({id:'folder1'});
  if(init.method==='POST')return json({id:'file1',webViewLink:'https://drive/file1'});
  if(init.method==='PATCH')return json({id:existing.id});
  throw new Error('unexpected '+url);};
 try{
  const first=await uploadPdfToDrive('a.pdf',new Uint8Array([37,80,68,70]));
  assert.deepEqual({id:first.id,replaced:first.replaced,folderId:first.folderId},{id:'file1',replaced:false,folderId:'folder1'});
  const folderQuery=new URL(calls[1].url).searchParams.get('q');
  assert.match(folderQuery,/name='교회\\'s 인쇄본'/,'작은따옴표를 이스케이프해야 한다');
  const upload=calls.find(c=>c.url.includes('uploadType=multipart'));
  const body=upload.init.body.toString('latin1');
  assert.match(upload.init.headers['Content-Type'],/^multipart\/related; boundary=/);
  assert.ok(body.includes('"parents":["folder1"]')&&body.includes('%PDF'));
  existing={id:'old1'};calls.length=0;
  const second=await uploadPdfToDrive('a.pdf',new Uint8Array([1]));
  assert.equal(second.replaced,true);
  assert.ok(calls.some(c=>c.init.method==='PATCH'&&c.url.includes('/files/old1?uploadType=media')));
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'invalid_grant'}),{status:400});
  await assert.rejects(uploadPdfToDrive('a.pdf',new Uint8Array([1])),/invalid_grant/);
 }finally{globalThis.fetch=real;}
});
