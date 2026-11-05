import Link from "@/components/pending-link";
import { smallButtonClass } from "@/components/ui";
import { addDays, formatWeek, reportWeek, todayKST } from "@/lib/week";

/** 지난 주로 가서 보고를 쓸 수 있게 한다. 이번 주보다 뒤로는 가지 않는다. */
export function WeekNav({ week, href, label = "보고 주차 이동" }: { week: string; href: string; label?: string }) {
  const current = reportWeek(undefined, todayKST());
  const to = (w: string) => `${href}?week=${w}`;
  return <nav aria-label={label} className="week-nav mb-4 flex flex-wrap gap-2"><Link className={smallButtonClass} href={to(addDays(week, -7))}>← 지난 주</Link>{week < current ? <><Link className={smallButtonClass} href={to(addDays(week, 7))}>다음 주 →</Link><Link className={smallButtonClass} href={to(current)}>이번 주</Link></> : null}</nav>;
}

/** 지난 주 보고를 쓰는 중이라는 것을 이번 주와 헷갈리지 않게 알린다. */
export function PastWeekNotice({ week, href }: { week: string; href: string }) {
  return <p role="status" className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm"><b>지난 주({formatWeek(week)}) 보고를 쓰고 있습니다.</b> 이번 주 보고는 <Link href={href} className="font-semibold text-accent underline">이번 주로 이동</Link>해서 써 주세요.</p>;
}
