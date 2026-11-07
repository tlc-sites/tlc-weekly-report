import {splitNames} from "@/lib/pd-checklist";

// 인쇄용 명단. 사람 한 명은 한 덩어리(inline-block)로 두고, '/'·'·'는 다음 사람 앞에 붙인다.
// 줄을 한 칸 왼쪽으로 당기고 넘치는 부분을 숨겨, 줄 첫머리에 온 '/'는 보이지 않는다(pd-checklist.css .names).
export function NameList({text}:{text:string}){
 return <span className="names">{splitNames(text).map((line,i)=><span key={i} className="names-l">{line.map((it,j)=><span key={j} className="names-i" data-sep={it.sep}>{it.text}</span>)}</span>)}</span>;
}
