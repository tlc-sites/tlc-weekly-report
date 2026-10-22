"use client";
import {createContext,useContext,useSyncExternalStore,type ReactNode} from "react";
const KEY="tlc-report-language";
const Context=createContext<{language:"ko"|"en";change:(lang:"ko"|"en")=>void}>({language:"ko",change:()=>{}});
function subscribe(fn:()=>void){window.addEventListener("storage",fn);window.addEventListener("report-language",fn);return()=>{window.removeEventListener("storage",fn);window.removeEventListener("report-language",fn);};}
function snapshot():"ko"|"en"{try{return localStorage.getItem(KEY)==="en"?"en":"ko";}catch{return "ko";}}
export function TranslationLanguage({children}:{children:ReactNode}){const language=useSyncExternalStore<"ko"|"en">(subscribe,snapshot,()=>"ko");function change(lang:"ko"|"en"){try{localStorage.setItem(KEY,lang);}catch{}window.dispatchEvent(new Event("report-language"));}return <Context value={{language,change}}>{children}</Context>;}
export function LanguageSwitch(){const {language,change}=useContext(Context);return <button type="button" className="ml-2 shrink-0 rounded-xl border border-border px-2 py-2 text-xs font-semibold" onClick={()=>change(language==="ko"?"en":"ko")} aria-label="보고 내용 번역 언어 전환">{language==="ko"?"English":"한국어"}</button>;}
export function useTranslationLanguage(){return useContext(Context);}
