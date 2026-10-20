"use client";

import Link from "next/link";
import { useState } from "react";
import { GROUP_TYPE_LABEL, type OrderedGroup } from "@/lib/groups";
import { selectClass } from "./ui";

export function GroupPicker({ groups, base = "/groups", suffix = "", defaultCategory = "" }: { defaultCategory?: string; groups: OrderedGroup[]; base?: string; suffix?: string }) {
  const [category, setCategory] = useState(defaultCategory);
  return <div className="flex flex-col gap-3">
    <label className="flex flex-col gap-2 text-sm">분류
      <select className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">분류를 선택해 주세요</option>
        {Object.entries(GROUP_TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {category ? <ul className="divide-y divide-border">{groups.filter(g => g.type === category).map(g =>
      <li key={g.id}><Link className="flex min-h-12 items-center justify-between gap-2 py-2" href={`${base}/${g.id}${suffix}`}>
        <span className={g.is_active ? "" : "text-muted line-through"}>{g.name}</span><span aria-hidden>›</span>
      </Link></li>)}{!groups.some(g => g.type === category) ? <li className="py-3 text-sm text-muted">배정된 그룹이 없습니다.</li> : null}</ul> : null}
  </div>;
}
