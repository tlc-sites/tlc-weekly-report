import { getReportIdentity } from "@/lib/report-identity";
import Link from "@/components/pending-link";
import { Badge, Card } from "./ui";
import { reportTitle, type MeetingReport } from "@/lib/meeting";
import { RESULT_LABEL } from "@/lib/report-forms";

const FIELDS:Record<string,string>={song_list:"예배 송리스트",sermon_passage:"설교본문",preacher:"설교자",sermon_content:"말씀·예배 내용",worship_leader:"예배인도자",service_staff:"예배위원",activity:"공과·활동",content:"사역 내용",sharing_topic:"나눔 주제",sharing_passage:"나눔 범위",sharing_place:"나눔 장소",topic:"모임 주제",passage:"공과·성경 범위",place:"진행 장소",notes:"특이사항"};
export function MeetingSummary({reports,groupName}:{reports:MeetingReport[];groupName:Map<string,string>}) {
  const sent=reports.filter(r=>r.status!=="draft");
  const events=new Map<string,MeetingReport[]>();
  for(const r of sent) {
    const key=`${r.group_id}:${r.meeting_date}:${reportTitle(r)}`;
    events.set(key,[...(events.get(key)??[]),r]);
  }
  return <section className="mb-5"><h2 className="mb-2 font-semibold">이번 주 사역 종합 요약</h2><Card>
    <p className="mb-4 text-sm text-muted">열람 가능한 {new Set(sent.map(r=>r.group_id)).size}개 파트 · {events.size}개 예배·모임 · 제출 보고 {sent.length}건. 담당자별 보고를 같은 예배 아래 모았습니다.</p>
    <div className="flex flex-col gap-5">{[...events].map(([key,items])=><article key={key} className="break-inside-avoid border-t border-border pt-3">
      <h3 className="font-semibold">{groupName.get(items[0].group_id)} · {reportTitle(items[0])} · {items[0].meeting_date}</h3>
      {items.map(r=><div key={r.id} className="mt-3 rounded-xl border border-border p-3 text-sm">
        <Link href={`/reports/${r.id}`} className="font-semibold text-accent">{getReportIdentity(r.details,r.author?.real_name).author_name}{getReportIdentity(r.details).duty_part ? ` · ${getReportIdentity(r.details).duty_part}` : ""} · 원본 보기 ›</Link>
        {typeof r.details.result==="string" && r.details.result in RESULT_LABEL ? <div className="mt-2"><Badge tone={r.details.result==="normal"?"muted":"danger"}>{RESULT_LABEL[r.details.result as keyof typeof RESULT_LABEL]}</Badge></div>:null}
        {Object.entries(FIELDS).map(([field,label])=>typeof r.details[field]==="string" && r.details[field] ? <p key={field} className="mt-2 whitespace-pre-wrap"><strong>{label}:</strong> {String(r.details[field])}</p>:null)}
        {Array.isArray(r.details.members) ? <ul className="mt-2">{r.details.members.map((m,i)=><li key={i} className="whitespace-pre-wrap">{String(m.name??"")} · {m.present ? "참석":"불참"} · {String(m.note??"")} · {String(m.follow_up??"")}</li>)}</ul>:null}
        {Array.isArray(r.details.requests) ? r.details.requests.map((q,i)=><p key={i} className="mt-2 whitespace-pre-wrap"><strong>요청사항:</strong> {String(q.category ?? "")} · {String(q.content ?? "")}</p>):null}
      </div>)}
    </article>)}{!sent.length ? <p className="text-sm text-muted">이번 주에 제출된 보고가 없습니다.</p>:null}</div>
  </Card></section>;
}
