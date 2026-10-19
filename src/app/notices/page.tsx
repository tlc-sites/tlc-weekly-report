import { Suspense } from "react";
import Link from "next/link";
import { BackLink, Card, Field, Loading, PageTitle, inputClass, selectClass, textareaClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireActive } from "@/lib/auth";
import { GROUP_TYPE_LABEL, listGroupsOrdered, type Group } from "@/lib/groups";
import { createNotice } from "./actions";

export default function NoticesPage(props: PageProps<"/notices">) {
  return <Suspense fallback={<Loading />}><Content {...props} /></Suspense>;
}

async function Content({ searchParams }: PageProps<"/notices">) {
  const { supabase, profile } = await requireActive();
  const [{ error }, groups, notices, memberships] = await Promise.all([
    searchParams, listGroupsOrdered(supabase),
    supabase.from("notices").select("id,title,created_at,target_type,target_group_id,audience").order("created_at", { ascending: false }).limit(50),
    supabase.from("memberships").select("group_id,role").eq("user_id",profile.id),
  ]);
  if (notices.error) throw notices.error;
  const reviewerGroups = new Set((memberships.data ?? []).filter(m => m.role === "reviewer").map(m => m.group_id));
  const targets = groups.filter(g => profile.is_admin || reviewerGroups.has(g.id) || reviewerGroups.has(g.parent_id));
  return <>
    <BackLink href="/">홈</BackLink><PageTitle sub="담당 부서의 공지와 댓글을 확인해 주세요.">공지·소통</PageTitle>
    {error ? <p role="alert" className="mb-4 text-sm text-danger">{error === "invalid" ? "제목·내용·대상을 확인해 주세요." : "저장하지 못했습니다. 공지 권한과 입력 내용을 확인해 주세요."}</p> : null}
    {targets.length || profile.is_admin ? <details className="mb-6 rounded-xl border border-border bg-white p-4">
      <summary className="cursor-pointer font-medium">+ 공지 보내기</summary>
      <form action={createNotice} className="mt-4 flex flex-col gap-3">
        <Field label="받는 부서"><select name="target" required className={selectClass} defaultValue="">
          <option value="" disabled>대상을 선택해 주세요</option>
          {profile.is_admin ? <optgroup label="분류 전체">{Object.entries(GROUP_TYPE_LABEL).map(([type,label]) => <option key={type} value={`type:${type}`}>{label} 전체</option>)}</optgroup> : null}
          <optgroup label="개별 부서·팀">{targets.map(g => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}</optgroup>
        </select></Field>
        <Field label="받는 사람"><select name="audience" defaultValue="all" className={selectClass}><option value="all">작성자·검토자 전체</option><option value="reviewer">담당 검토자만</option></select></Field>
        <Field label="제목"><input name="title" required maxLength={100} className={inputClass} /></Field>
        <Field label="내용"><textarea name="body" required maxLength={2000} rows={5} className={textareaClass} placeholder="예: 이번 주 전체 총괄 모임을 갖겠습니다." /></Field>
        <p className="text-xs text-muted">대상자에게 앱 공지가 등록됩니다. 알림을 켠 기기에는 푸시도 전달합니다.</p>
        <SubmitButton pendingText="공지 보내는 중…">공지 보내기</SubmitButton>
      </form>
    </details> : null}
    <Card><h2 className="mb-2 font-medium">최근 공지</h2><ul className="divide-y divide-border">
      {(notices.data ?? []).map(n => <li key={n.id}><Link href={`/notices/${n.id}`} className="flex flex-col gap-1 py-3 transition active:bg-accent/10">
        <span className="font-medium">{n.title}</span>
        <span className="text-xs text-muted">{n.target_type ? GROUP_TYPE_LABEL[n.target_type as Group["type"]] : groups.find(g => g.id === n.target_group_id)?.name ?? "담당 부서"} · {n.audience === "reviewer" ? "검토자" : "전체 구성원"} · {new Date(n.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
      </Link></li>)}
    </ul>{!notices.data?.length ? <p className="py-3 text-sm text-muted">아직 받은 공지가 없습니다.</p> : null}</Card>
  </>;
}
