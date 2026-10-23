"use client";

import Link from "@/components/pending-link";
import {MEMBER_STATUS_LABEL} from "@/lib/members";
import type { Member } from "@/lib/members";
import { MemberPhoto } from "./member-photo";

export function MemberCards({ members, groupId, guardians=[], team=false }: { members: Member[]; groupId: string; team?:boolean;guardians?:{member_id:string;name:string|null;relation:string|null;contact:string|null}[] }) {
  return <section className="mb-6" aria-label="인물 카드">
    <h2 className="mb-2 text-sm font-semibold">인물 카드</h2>
    <p className="mb-3 text-xs text-muted">좌우로 밀어서 한 명씩 확인해 주세요.</p>
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3" tabIndex={0}>
      {members.filter(m => m.status !== "inactive").map(m => <article key={m.id} className="flex w-64 shrink-0 snap-center flex-col items-center gap-3 rounded-2xl border border-border bg-white p-5">
        {!team?<MemberPhoto name={m.name} photo={m.photo_data} large />:null}
        <span className="text-lg font-semibold">{m.name}</span>
        {team?<><span className="text-sm">{m.team_position||"팀원"} · {MEMBER_STATUS_LABEL[m.status]}</span><p className="w-full whitespace-pre-wrap break-words text-sm text-muted">{m.follow_up_note||"후속 메모 없음"}</p></>:<><span className="text-sm text-muted">{[m.class_name,m.grade].filter(Boolean).join(" · ")||(m.kind==="teacher"?"교사":"학생")}</span><span className="text-sm">생년월일 {m.birth_date??(m.birth_year?m.birth_year+"년":"미등록")}</span></>}
        {!team&&guardians.filter(g=>g.member_id===m.id).map((g,i)=><div key={i} className="w-full border-t border-border pt-2 text-center text-sm"><p>{g.relation || "보호자"} · {g.name || "이름 미등록"}</p>{g.contact?<a className="mt-1 inline-flex min-h-11 items-center font-semibold text-accent underline" href={`tel:${g.contact.replace(/[^0-9+]/g,"")}`}>{g.contact}</a>:<p className="text-xs text-muted">연락처 미등록</p>}</div>)}
        <Link href={`/groups/${groupId}/members/${m.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-accent/40 px-4 py-2 text-sm font-semibold text-accent">상세 정보 보기</Link>
      </article>)}
    </div>
  </section>;
}
