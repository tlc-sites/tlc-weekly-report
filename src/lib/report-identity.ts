// 현행 DB의 details 안에 작성 당시 이름을 보존한다. 열람 권한은 기존 RLS를 그대로 따른다.
export type ReportIdentity = {author_name:string;duty_part:string;last_editor_name:string;last_editor_id:string};
const text=(value:unknown,max:number)=>typeof value==="string" ? value.trim().slice(0,max) : "";
export function getReportIdentity(details:Record<string,unknown>,fallback?:string|null):ReportIdentity {
  const raw=details._report_meta;
  const meta=raw && typeof raw==="object" && !Array.isArray(raw) ? raw as Record<string,unknown> : {};
  return {author_name:text(meta.author_name,100)||text(fallback,100)||"이름 미입력",duty_part:text(meta.duty_part,100),last_editor_name:text(meta.last_editor_name,100),last_editor_id:text(meta.last_editor_id,100)};
}
export function preserveReportIdentity(details:Record<string,unknown>,fallback:string|null|undefined,editor:{id:string;name:string|null}):ReportIdentity {
  // 클라이언트가 보낸 이름 대신 저장된 최초 작성자 이름을 사용한다.
  return {...getReportIdentity(details,fallback),last_editor_id:editor.id,last_editor_name:editor.name?.trim()||"이름 미입력"};
}
