"use client";
import {useSyncExternalStore} from "react";

// 화면 밝기: 기기 설정 따르기(기본) / 라이트 / 다크. 이 기기(브라우저)에만 저장된다.
// 첫 화면이 번쩍이지 않도록 layout의 THEME_SCRIPT가 그리기 전에 같은 값을 <html data-theme>에 넣는다.
export const THEME_KEY = "tlc-theme";
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;
type Theme = "system" | "light" | "dark";
const listeners = new Set<() => void>();
const read = (): Theme => { try { const t = localStorage.getItem(THEME_KEY); return t === "dark" || t === "light" ? t : "system"; } catch { return "system"; } };
function apply(t: Theme) {
  try { if (t === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch {}
  if (t === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  listeners.forEach(l => l());
}

export function ThemeSwitch({className = ""}: {className?: string}) {
  const theme = useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, read, () => "system" as Theme);
  return <div role="group" aria-label="화면 밝기" className={"theme-switch " + className}>
    {([["system", "기기 설정"], ["light", "라이트"], ["dark", "다크"]] as const).map(([v, label]) =>
      <button key={v} type="button" aria-pressed={theme === v} onClick={() => apply(v)}>{label}</button>)}
  </div>;
}
