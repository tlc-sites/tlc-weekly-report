"use client";

import Link from "next/link";
import type { Member } from "@/lib/members";
import { MemberPhoto } from "./member-photo";

export function MemberCards({ members, groupId }: { members: Member[]; groupId: string }) {
  return <section className="mb-6" aria-label="인물 카드">
    <h2 className="mb-2 text-sm font-semibold">인물 카드</h2>
    <p className="mb-3 text-xs text-muted">좌우로 밀어서 한 명씩 확인해 주세요.</p>
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3" tabIndex={0}>
      {members.filter(m => m.status !== "inactive").map(m => <Link key={m.id} href={`/groups/${groupId}/members/${m.id}`} className="flex w-64 shrink-0 snap-center flex-col items-center gap-3 rounded-2xl border border-border bg-white p-5">
        <MemberPhoto name={m.name} photo={m.photo_data} large />
        <span className="text-lg font-semibold">{m.name}</span>
        <span className="text-sm text-muted">{[m.class_name, m.grade].filter(Boolean).join(" · ") || (m.kind === "teacher" ? "교사" : "학생")}</span>
        <span className="text-sm">생년월일 {m.birth_date ?? (m.birth_year ? `${m.birth_year}년` : "미등록")}</span>
      </Link>)}
    </div>
  </section>;
}
