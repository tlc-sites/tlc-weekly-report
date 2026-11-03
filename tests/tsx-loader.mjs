// 테스트에서 src의 .ts/.tsx를 그대로 import하기 위한 로더.
// "@/..." 별칭과 확장자 없는 경로를 풀고, TypeScript로 JSX까지 변환한다. "server-only"는 빈 모듈로 바꾼다.
// 사용: import {register} from 'node:module'; register('./tsx-loader.mjs', import.meta.url);
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
const SRC=fileURLToPath(new URL('../src/',import.meta.url));
function withExt(file){for(const f of [file,file+'.ts',file+'.tsx',path.join(file,'index.ts')])if(existsSync(f)&&!f.endsWith(path.sep))return f;return null;}
export async function resolve(specifier,context,next){
 if(specifier==='server-only')return {url:'data:text/javascript,',shortCircuit:true};
 let file=null;
 if(specifier.startsWith('@/'))file=withExt(path.join(SRC,specifier.slice(2)));
 else if((specifier.startsWith('./')||specifier.startsWith('../'))&&context.parentURL?.startsWith('file:')){const base=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);if(/\.tsx?$/.test(context.parentURL)||!existsSync(base))file=withExt(base);}
 if(file&&/\.tsx?$/.test(file))return {url:pathToFileURL(file).href,shortCircuit:true};
 return next(specifier,context);
}
export async function load(url,context,next){
 if(!/\.tsx?$/.test(url)||!url.startsWith('file:'))return next(url,context);
 const source=readFileSync(fileURLToPath(url),'utf8');
 const out=ts.transpileModule(source,{fileName:fileURLToPath(url),compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,verbatimModuleSyntax:false}});
 return {format:'module',source:out.outputText,shortCircuit:true};
}
