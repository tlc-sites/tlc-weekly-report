"use client";
// 드롭다운 대신 고를 수 있는 항목을 모두 펼쳐 보여 준다(보고 작성 시 무엇을 고르는지 한눈에 보이게).
export function ChoiceChips<T extends string>({legend,name,value,options,onChange}:{legend:string;name?:string;value:T;options:{value:T;label:string;sub?:string}[];onChange:(v:T)=>void}){
 return <fieldset className="flex flex-col gap-2">
  <legend className="mb-2 text-sm">{legend}</legend>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{options.map(o=>{const on=o.value===value;return <label key={o.value} className={`flex min-h-12 cursor-pointer flex-col justify-center rounded-xl border px-3 py-2 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${on?"border-accent bg-accent/10 font-semibold text-accent":"border-border bg-surface"}`}>
   <input type="radio" className="sr-only" name={name} value={o.value} checked={on} onChange={()=>onChange(o.value)}/>
   <span>{on?"✓ ":""}{o.label}</span>{o.sub?<span className={`text-xs font-normal ${on?"text-accent":"text-muted"}`}>{o.sub}</span>:null}
  </label>;})}</div>
 </fieldset>;
}
