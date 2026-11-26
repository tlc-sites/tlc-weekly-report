import { groupDisplayName } from "@/lib/group-display";
import { SundayNoticePopup } from "@/components/sunday-notice-popup";
import { upcomingSunday } from "@/lib/sunday-notice";
import { HomePartCards, type CardReport } from "@/components/home-part-cards";
import { partCardState } from "@/lib/home-parts";
import { Suspense } from "react";
import Link from "@/components/pending-link";
import { buttonClass, Card, listRowClass, Loading, PageTitle, smallButtonClass, StatusChip } from "@/components/ui";
import { PushBanner } from "@/components/push-banner";
import { requireActive, canManage, isClergy, isSenior } from "@/lib/auth";
import { listGroupsOrdered } from "@/lib/groups";
import { notificationCategory } from "@/lib/notification-category";
import { addDays, formatDate, formatWeek, reportDeadline, reportWeek, todayKST } from "@/lib/week";
import { loadAdminSubmissions } from "@/lib/admin-submissions";

export default function HomePage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<Loading />}>
      <HomeContent {...props} />
    </Suspense>
  );
}

// 홈: 이번 주에 내가 할 일만. 예배 도구·내 소속·설정·관리 메뉴는 하단 「더보기」 탭(/more)과 PC 왼쪽 메뉴에 있다.
async function HomeContent({ searchParams }: PageProps<"/">) {
  const { supabase, profile } = await requireActive();
  const params = await searchParams;
  const currentWeek = reportWeek(undefined, todayKST());
  const week = reportWeek(params.week, todayKST());
  const staff = isClergy(profile) || canManage(profile);
  const [{ data: memberships }, groups, notices, weeklyReports, weekStatuses, adminStatus, unread, openIncidents] = await Promise.all([
    supabase.from("memberships").select("group_id, role, position").eq("user_id", profile.id),
    listGroupsOrdered(supabase),
    supabase.from("notices").select("id,title").order("created_at", { ascending: false }).limit(2),
    supabase.from("reports").select("id,group_id,author_id,author_name,status").eq("week", week).returns<(CardReport & { author_name: string })[]>(),
    supabase.from("week_status").select("group_id").eq("week", week).eq("no_meeting", true),
    canManage(profile) ? loadAdminSubmissions(supabase, week) : Promise.resolve(null),
    supabase.from("inbox_notifications").select("id,title,body,url").is("read_at", null).order("created_at", { ascending: false }).limit(30),
    staff ? supabase.from("worship_incidents").select("id", { count: "exact", head: true }).neq("status", "resolved").then((r) => r.count ?? 0) : Promise.resolve(0),
  ]);

  // 돌아오는 주일 공지(있으면 첫 화면 팝업)
  const { data: sundayNotice } = await supabase.from("sunday_notices").select("sunday,body,updated_at").eq("sunday", upcomingSunday(todayKST())).maybeSingle();
  const roleByGroup = new Map((memberships ?? []).map((m) => [m.group_id as string, m.role as string]));
  // 내 파트: 하위 그룹이 없는 그룹 중 직접 소속이거나 상위 그룹 소속인 곳 (관리 권한으로 볼 수 있는 전체 파트는 넣지 않는다)
  const myParts = groups.filter((g) => g.childCount === 0 && (roleByGroup.has(g.id) || (g.parent_id !== null && roleByGroup.has(g.parent_id))));
  const reports = weeklyReports.data ?? [];
  const noMeeting = (weekStatuses.data ?? []).map((s) => s.group_id as string);
  const failed = Boolean(weeklyReports.error || weekStatuses.error);
  const agenda = isSenior(profile) || (memberships ?? []).some((m) => m.role === "reviewer" || (profile.is_minister && ["교역자", "담당교역자"].includes(String(m.position))));
  const comments = (unread.data ?? []).filter((n) => notificationCategory(n) === "feedback").slice(0, 3);

  // 교역자·관리자 요약: 관리 권한이 있으면 전체 파트, 아니면 열람 가능한 보고와 내 파트 기준
  const scopeReports = adminStatus?.reports ?? reports;
  const scopeParts = adminStatus?.groups ?? myParts;
  const scopeNoMeeting = adminStatus?.no_meeting ?? noMeeting;
  const waiting = scopeReports.filter((r) => r.status === "submitted").length;
  const drafting = scopeReports.filter((r) => r.status === "draft").length;
  const reviewedCount = scopeReports.filter((r) => r.status === "reviewed").length;
  const emptyParts = scopeParts.filter((g) => g.type !== "worship" && g.schedule === "weekly" && !scopeNoMeeting.includes(g.id) && !scopeReports.some((r) => r.group_id === g.id && r.status !== "draft")).length;
  // 작성자 첫 카드(교역자·관리자는 확인 요약 카드가 첫 카드): 내 작성 중 보고 → 이어 쓰기, 쓸 파트 → 보고 쓰기
  const myDraft = reports.find((r) => r.author_id === profile.id && r.status === "draft");
  const myDraftGroup = myDraft ? groups.find((g) => g.id === myDraft.group_id) : undefined;
  const toWrite = myParts.filter((g) => partCardState(g, reports, noMeeting, profile.id, week).action === "쓰기").length;
  const deadlineText = `${formatDate(addDays(week, 5))} 오후 5시`;
  const listHref = (status: string) => (adminStatus ? `/admin/submissions?week=${week}&status=${status}` : `/reports?week=${week}&status=${status}`);

  // 보고서에서 '확인'을 누르고 돌아오면 알림을 띄운다
  const reviewed = typeof params.reviewed === "string" ? scopeReports.find((r) => r.id === params.reviewed) : undefined;
  const reviewedGroup = reviewed ? groups.find((g) => g.id === reviewed.group_id) : undefined;

  const news = (
    <section aria-labelledby="home-news" className="mb-6">
      <h2 id="home-news" className="home-sec-title">소식</h2>
      <Card>
        <ul className="divide-y divide-border">
          {(notices.data ?? []).map((n) => (
            <li key={n.id}><Link href={`/notices/${n.id}`} className={listRowClass}><span className="min-w-0"><span className="block text-[15px] text-muted">공지</span>{n.title}</span><span aria-hidden className="text-accent">›</span></Link></li>
          ))}
          <li><Link href="/notices" className={listRowClass}><span>공지·소통 전체</span><span aria-hidden className="text-accent">›</span></Link></li>
          {agenda ? <li><Link href="/agenda" className={listRowClass}><span>부서 안건</span><span aria-hidden className="text-accent">›</span></Link></li> : null}
          {staff ? <li><Link href={`/incidents?week=${week}`} className={listRowClass}><span>확인·조치 목록</span><span className="flex items-center gap-2">{openIncidents ? <StatusChip tone="draft">처리 중 {openIncidents}건</StatusChip> : null}<span aria-hidden className="text-accent">›</span></span></Link></li> : null}
          {!sundayNotice && (isClergy(profile) || profile.is_admin) ? <li><Link href="/sunday-notice" className={listRowClass}><span>이번 주 공지 쓰기 <span className="block text-[15px] text-muted">쓰면 모두의 첫 화면에 팝업으로 보입니다</span></span><span aria-hidden className="text-accent">›</span></Link></li> : null}
        </ul>
      </Card>
    </section>
  );

  return (
    <>
      <div className="home-band">
        <PageTitle sub={<>{week === currentWeek ? "이번 주" : "선택한 주"} {formatWeek(week)} · {deadlineText} 전달</>}>{profile.real_name}님, 안녕하세요</PageTitle>
        <nav aria-label="주차 이동" className="home-week flex flex-wrap gap-2">
          <Link href={`/?week=${addDays(week, -7)}`} className={smallButtonClass}>← 지난 주</Link>
          {week < currentWeek ? <><Link href={`/?week=${addDays(week, 7)}`} className={smallButtonClass}>다음 주 →</Link><Link href="/" className={smallButtonClass}>이번 주</Link></> : null}
        </nav>
      </div>
      {sundayNotice ? <SundayNoticePopup sunday={sundayNotice.sunday} label={formatDate(sundayNotice.sunday)} body={sundayNotice.body} version={sundayNotice.updated_at} canWrite={isClergy(profile) || profile.is_admin} /> : null}
      <div className="home-cols home-lift"><div className="home-col-main">
        {staff ? (
          <Card className="home-hero mb-4">
            {failed && !adminStatus ? <p role="alert" className="text-danger">현황을 불러오지 못했습니다. 새로고침해 주세요.</p> : <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="home-label">확인을 기다리는 보고</p>
                <p className="home-hero-num">{waiting}<span className="ml-1 text-[15px] font-normal text-muted">건</span></p>
              </div>
              <ul className="mt-1 divide-y divide-border">
                <li><Link href={listHref("draft")} className={listRowClass}><span>작성 중</span><span className="flex items-center gap-2"><span className="tabular-nums text-muted">{drafting}건</span><span aria-hidden className="text-muted">›</span></span></Link></li>
                <li><Link href={listHref("reviewed")} className={listRowClass}><span>확인 완료</span><span className="flex items-center gap-2"><span className="tabular-nums text-muted">{reviewedCount}건</span><span aria-hidden className="text-muted">›</span></span></Link></li>
                <li><Link href={adminStatus ? `/admin/submissions?week=${week}` : "#my-parts"} className={listRowClass}>
                  <span>아직 보고가 없는 파트{adminStatus ? <span className="block text-[15px] text-muted">전체 제출현황에서 파트별로 볼 수 있습니다</span> : null}</span>
                  <span className="flex items-center gap-2"><b className={"tabular-nums " + (emptyParts && new Date() > reportDeadline(week) ? "text-danger" : "font-normal text-muted")}>{emptyParts}곳</b><span aria-hidden className="text-muted">›</span></span>
                </Link></li>
              </ul>
              <Link href={listHref("submitted")} className={`${buttonClass} mt-3 w-full`}>확인하러 가기</Link>
            </>}
          </Card>
        ) : !isSenior(profile) && myParts.length ? (
          <Card className="home-hero mb-4">
            <div className="flex items-center justify-between gap-3">
              <p className="home-label">이번 주 보고</p>
              {myDraft ? <StatusChip tone="draft">작성 중</StatusChip> : toWrite ? <StatusChip tone="todo">작성 전</StatusChip> : <StatusChip tone="done">모두 냈어요</StatusChip>}
            </div>
            <h2 className="mt-2">{myDraft ? <>{myDraftGroup ? groupDisplayName(myDraftGroup.name) : "쓰던"} 보고를<br />이어서 써 주세요</> : toWrite ? <>이번 주 보고를<br />써 주세요</> : <>이번 주 보고를<br />모두 내셨어요</>}</h2>
            <p className="mt-2 text-[15px] text-muted">전달 {deadlineText}</p>
            {myDraft ? <Link href={`/reports/${myDraft.id}`} className={`${buttonClass} mt-4 w-full`}>이어서 쓰기</Link>
              : toWrite ? <Link href="/write" className={`${buttonClass} mt-4 w-full`}>보고 쓰기</Link> : null}
          </Card>
        ) : null}
        {reviewed ? <p role="status" aria-live="polite" className="mb-4 rounded-lg bg-accent/10 px-3 py-2 text-[15px] text-accent">{reviewed.author_name} · {reviewedGroup ? groupDisplayName(reviewedGroup.name) : "파트"} 보고를 확인 처리했습니다. {waiting ? `이 주에 확인 대기 중인 보고가 ${waiting}건 남았습니다.` : "이 주에 확인 대기 중인 보고가 없습니다."} <Link href={`/reports/${reviewed.id}`} className="underline underline-offset-2">방금 확인한 보고 보기</Link></p> : null}
        <PushBanner />
        {adminStatus?.setup_expires_at ? <Card className="mb-4"><p className="font-semibold">셋업용 일반 보고 열람 중</p><p className="mt-1 text-[15px] text-muted">{new Date(adminStatus.setup_expires_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}에 자동 종료됩니다. 기도제목·비공개 글·보호자 연락처는 포함하지 않습니다.</p></Card> : null}

        {/* 담임 목사님·사모님은 맡은 파트가 없으면 이 칸을 감춘다(보고를 쓰지 않고 읽는 분) */}
        {isSenior(profile) && !myParts.length ? null : <section id="my-parts" aria-labelledby="home-parts" className="mb-6 scroll-mt-24">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="home-parts" className="home-sec-title !mb-0">내 파트</h2>
            <Link href={`/reports?week=${week}&author=${profile.id}`} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-accent">내 보고 모두 보기 ›</Link>
          </div>
          {failed ? <Card><p role="alert" className="text-danger">이번 주 상태를 불러오지 못했습니다. 새로고침해 주세요.</p></Card>
            : myParts.length ? <HomePartCards parts={myParts} reports={reports} noMeeting={noMeeting} userId={profile.id} week={week} />
            : <Card><p className="font-semibold">아직 담당 파트가 배정되지 않았습니다.</p><p className="mt-1 text-[15px] text-muted">{canManage(profile) ? "「보고 쓰기」에서 파트를 골라 보고를 쓸 수 있습니다. 출결 명단이나 팀 이슈는 담당 파트 권한이 필요합니다." : "담당 관리자에게 배정을 요청해 주세요."}</p></Card>}
        </section>}

        {comments.length ? (
          <section aria-labelledby="home-comments" className="mb-6">
            <h2 id="home-comments" className="home-sec-title">새 코멘트·답글</h2>
            <Card>
              <ul className="divide-y divide-border">
                {comments.map((n) => <li key={n.id}><Link href={n.url} className={listRowClass}><span className="min-w-0"><span className="block font-medium">{n.title}</span><span className="line-clamp-2 text-[15px] text-muted">{n.body}</span></span><span aria-hidden className="text-accent">›</span></Link></li>)}
              </ul>
              <Link href="/notifications" className="mt-1 inline-flex min-h-11 items-center font-semibold text-accent">알림 모두 보기 ›</Link>
            </Card>
          </section>
        ) : null}
      </div><div className="home-col-side">
        {news}
      </div></div>
    </>
  );
}
