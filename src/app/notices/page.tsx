import {MinisterMessageComposer} from "@/components/minister-message-composer";
import { Suspense } from "react";
import Link from "next/link";
import { BackLink, Card, Field, Loading, PageTitle, inputClass, selectClass, textareaClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireActive, canManage, isClergy } from "@/lib/auth";
import { GROUP_TYPE_LABEL, listGroupsOrdered, type Group } from "@/lib/groups";
import { createNotice } from "./actions";

export default function NoticesPage(props: PageProps<"/notices">) {
  return <Suspense fallback={<Loading />}><Content {...props} /></Suspense>;
}

async function Content({ searchParams }: PageProps<"/notices">) {
  const { supabase, profile } = await requireActive();
  const query = await searchParams;
  const {error}=query;
  const restricted=query.tab==="restricted";
  let noticesQuery=supabase.from("notices").select("id,title,created_at,target_type,target_group_id,audience");
  noticesQuery=restricted?noticesQuery.or("target_group_id.not.is.null,audience.neq.all"):noticesQuery.is("target_group_id",null).eq("audience","all");
  const [groups, notices, threads] = await Promise.all([
    listGroupsOrdered(supabase),
    noticesQuery.order("created_at", { ascending: false }).limit(50),
    restricted&&isClergy(profile)?supabase.from("minister_threads").select("id,subject,created_at").order("created_at",{ascending:false}).limit(50):Promise.resolve({data:[],error:null}),
  ]);
  if(threads.error)throw threads.error;
  if (notices.error) throw notices.error;
  const canSend=canManage(profile) || isClergy(profile);
  const targets=canSend ? groups : [];
  return <>
    <BackLink href="/">홈</BackLink><PageTitle sub="공지와 대상이 지정된 메시지를 확인해 주세요.">공지·소통</PageTitle>
    <nav aria-label="공지 분류" className="mb-3 grid grid-cols-2 gap-2">
      {[["/notices","전체 공지",!restricted],["/notices?tab=restricted","일부 공개 메시지",restricted]].map(([href,label,active])=><Link key={String(href)} href={String(href)} aria-current={active?"page":undefined} className={"flex min-h-12 items-center justify-center rounded-xl border p-3 text-center font-semibold "+(active?"border-accent bg-accent text-white":"border-border bg-surface text-accent")}>{label}</Link>)}
    </nav>
    <p className="mb-4 text-sm text-muted">{restricted?"특정 부서·직급에 보낸 소식과 내게 공개된 비공개 메시지만 표시됩니다.":"대상 분류의 전체 구성원에게 보낸 공지입니다. 기존 부서별 열람 범위는 유지됩니다."}</p>
    {error ? <p role="alert" className="mb-4 text-sm text-danger">{error === "invalid" ? "제목·내용·대상을 확인해 주세요." : "저장하지 못했습니다. 공지 권한과 입력 내용을 확인해 주세요."}</p> : null}
    {targets.length || canSend ? <details className="mb-6 rounded-xl border border-border bg-white p-4">
      <summary className="cursor-pointer font-medium">{restricted?"+ 대상 지정 소식 보내기":"+ 공지 보내기"}</summary>
      <form action={createNotice} className="mt-4 flex flex-col gap-3">
        <Field label="받는 부서"><select name="target" required className={selectClass} defaultValue="">
          <option value="" disabled>대상을 선택해 주세요</option>
          {canSend ? <optgroup label="분류 전체">{Object.entries(GROUP_TYPE_LABEL).map(([type,label]) => <option key={type} value={`type:${type}`}>{label} 전체</option>)}</optgroup> : null}
          {restricted?<optgroup label="개별 부서·팀">{targets.map(g => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}</optgroup>:null}
        </select></Field>
        <Field label="받는 사람"><select name="audience" defaultValue={restricted?"minister":"all"} className={selectClass}><option value="all">전체 구성원</option><option value="senior">담임 목사님·담임 사모님</option><option value="minister">담당 교역자</option><option value="lead">파트총괄·기술팀 담당자</option><option value="member">팀원</option></select></Field>
        <Field label="제목"><input name="title" required maxLength={100} className={inputClass} /></Field>
        <Field label="내용"><textarea name="body" required maxLength={2000} rows={5} className={textareaClass} placeholder="예: 이번 주 전체 총괄 모임을 갖겠습니다." /></Field>
        <p className="text-xs text-muted">대상자에게 앱 공지가 등록됩니다. 알림을 켠 기기에는 푸시도 전달합니다.</p>
        <SubmitButton pendingText="공지 보내는 중…">공지 보내기</SubmitButton>
      </form>
    </details> : null}
    {restricted?<MinisterMessageComposer supabase={supabase} profile={profile}/>:null}
    {restricted&&isClergy(profile)?<Card className="mb-4"><h2 className="font-medium">비공개 대화</h2><p className="mt-2 text-xs text-muted">담임 목사님·담임 사모님과 지정 수신자만 볼 수 있습니다.</p><Link href="/messages" className="my-3 inline-block text-sm font-semibold text-accent underline">비공개 메시지 확인 · 보내기</Link><ul className="divide-y divide-border">{(threads.data??[]).map(thread=><li key={thread.id}><Link href={"/messages/"+thread.id} className="block py-3 text-sm">{thread.subject}</Link></li>)}</ul>{!threads.data?.length?<p className="text-sm text-muted">아직 받은 비공개 메시지가 없습니다.</p>:null}</Card>:null}
    <Card><h2 className="mb-2 font-medium">{restricted?"대상 지정 소식":"최근 공지"}</h2><ul className="divide-y divide-border">
      {(notices.data ?? []).map(n => <li key={n.id}><Link href={`/notices/${n.id}`} className="flex flex-col gap-1 py-3 transition active:bg-accent/10">
        <span className="font-medium">{n.title}</span>
        <span className="text-xs text-muted">{n.target_type ? GROUP_TYPE_LABEL[n.target_type as Group["type"]] : groups.find(g => g.id === n.target_group_id)?.name ?? "담당 부서"} · {(({all:"전체 구성원",senior:"담임 목사님·담임 사모님",minister:"담당 교역자",reviewer:"교역자 이상",lead:"파트총괄·기술팀 담당자",member:"팀원"} as Record<string,string>)[n.audience] ?? "전체 구성원")} · {new Date(n.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
      </Link></li>)}
    </ul>{!notices.data?.length ? <p className="py-3 text-sm text-muted">아직 받은 공지가 없습니다.</p> : null}</Card>
  </>;
}
