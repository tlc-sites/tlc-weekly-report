"use client";
import {groupDisplayName} from "@/lib/group-display";

import Link from "@/components/pending-link";
import { useState } from "react";
import { NAV_CATEGORY_LABEL, groupCategory, type OrderedGroup } from "@/lib/groups";
import { selectClass } from "./ui";

export function GroupPicker({ groups, base = "/groups", suffix = "", defaultCategory = "" }: { defaultCategory?: string; groups: OrderedGroup[]; base?: string; suffix?: string }) {
  const [category, setCategory] = useState(defaultCategory);
  const categories=Object.entries(NAV_CATEGORY_LABEL).filter(([key])=>groups.some(g=>groupCategory(g)===key));
  const selected=categories.some(([key])=>key===category)?category:(categories[0]?.[0]??"");
  if(!groups.length)return <p className="rounded-xl bg-background p-4 text-sm text-muted">아직 작성할 수 있는 파트가 없습니다. 관리자에게 담당 배정을 요청해 주세요.</p>;
  return <div className="flex flex-col gap-3">
    <label className="flex flex-col gap-2 text-sm">분류
      <select className={selectClass} value={selected} onChange={(e) => setCategory(e.target.value)}>
        <option value="">분류를 선택해 주세요</option>
        {categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {selected ? <ul className="divide-y divide-border">{groups.filter(g => groupCategory(g) === selected).map(g =>
      <li key={g.id}><Link className="flex min-h-12 items-center justify-between gap-2 py-2" href={`${base}/${g.id}${suffix}`}>
        <span className={g.is_active ? "" : "text-muted line-through"}>{groupDisplayName(g.name)}</span><span aria-hidden>›</span>
      </Link></li>)}{!groups.some(g => groupCategory(g) === selected) ? <li className="py-3 text-sm text-muted">배정된 그룹이 없습니다.</li> : null}</ul> : null}
  </div>;
}
