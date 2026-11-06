// 예배 PD 체크리스트 템플릿 구조와 계산(시각·조건·진행률). 테스트에서 바로 불러 쓰도록 다른 모듈을 import하지 않는다.

export type Conditions = Record<string, boolean>;
export type Condition = { id: string; label: string; tag: string; default: boolean; autoRule?: string };

export type CheckItem = { type: "check"; id: string; text: string; emphasis?: "strong" | "highlight"; teams?: string[]; condition?: string | null };
export type Item =
  | CheckItem
  | { type: "heading"; text: string }
  | { type: "checkGroup"; layout: "columns" | "auto"; columns?: number | null; items: { id: string; text: string }[] }
  | { type: "note"; parts: { text: string; bold: boolean }[] }
  | { type: "locationMatrix"; columns: { key: string; label: string }[]; rows: { id: string; label: string }[] };

export type Block = {
  id: string; offsetMin: number; label: string; title: string;
  style: "default" | "accent" | "cue" | "go";
  arrivals?: { offsetMin: number; text: string; place?: string }[];
  items: Item[];
};

export type FlowStep = {
  id: string; label: string; next: string;
  style: "countdown" | "liveStart" | "start" | "default" | "optional" | "liveEnd" | "end";
  sub?: string; subWhen?: Record<string, string>; condition?: string | null; flag?: string | null; offsetMin?: number;
};

export type RosterGroup = { group: string; sub: string; fields: { id: string; label: string; span: number; multiple: boolean }[] };
export type ReportField = { id: string; label: string; type: "text" | "choice"; options?: string[]; placeholder?: string };

export type PdTemplate = {
  id: string; name: string; start: string; flowType: string; handoverTo?: string;
  conditions: Condition[]; teams: string[];
  page1: { title: string; rows: Block[][] };
  page2: {
    title: string; banner: string; flow: FlowStep[]; roster: RosterGroup[];
    during: { title: string; items: Item[] }; after: { title: string; items: Item[] };
    report: { title?: string; categories: { id: string; text: string }[]; fields: ReportField[] };
  };
};

export type PdRun = {
  service_key: string; run_date: string; template_version: number; pd_name: string;
  conditions: Conditions; checks: Record<string, boolean>; roster: Record<string, string>; report: Record<string, string>;
  updated_at: string;
};

/** 시작 시각 + 분 → 'HH:MM' (자정을 넘어가도 24시간 안으로) */
export function clockAt(start: string, offsetMin: number) {
  const [h, m] = start.split(":").map(Number);
  const t = (((h * 60 + m + offsetMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** 회차가 아직 없을 때의 조건. DB의 report.pd_default_conditions와 같은 규칙(성찬주간 = 1~7일). */
export function defaultConditions(tpl: PdTemplate, date: string): Conditions {
  const day = Number(date.slice(8, 10));
  return Object.fromEntries(tpl.conditions.map(c => [c.id, c.id === "communion" ? day <= 7 : !!c.default]));
}

export const isOn = (condition: string | null | undefined, conds: Conditions) => !condition || !!conds[condition];

/** 항목 하나에 들어 있는 체크 ID들 */
export function itemCheckIds(item: Item): string[] {
  if (item.type === "check") return [item.id];
  if (item.type === "checkGroup") return item.items.map(i => i.id);
  if (item.type === "locationMatrix") return item.rows.flatMap(r => item.columns.map(c => r.id + c.key));
  return [];
}

export const visibleFlow = (tpl: PdTemplate, conds: Conditions) => tpl.page2.flow.filter(s => isOn(s.condition, conds));

/** 진행률에 넣을 체크 ID: 꺼진 조건의 항목·FLOW 칸은 빼고, PD REPORT는 늘 뺀다. */
export function applicableCheckIds(tpl: PdTemplate, conds: Conditions) {
  const fromItems = (items: Item[]) => items.filter(i => i.type !== "check" || isOn(i.condition, conds)).flatMap(itemCheckIds);
  return [
    ...tpl.page1.rows.flat().flatMap(b => fromItems(b.items)),
    ...visibleFlow(tpl, conds).map(s => s.id),
    ...fromItems(tpl.page2.during.items),
    ...fromItems(tpl.page2.after.items),
  ];
}

export function progress(tpl: PdTemplate, conds: Conditions, checks: Record<string, boolean>) {
  const ids = applicableCheckIds(tpl, conds);
  return { done: ids.filter(id => checks[id]).length, total: ids.length };
}

/** FLOW 칸의 보조 문구: 시각이 있으면 실제 시각, 조건별 문구(찬양 15분 등)가 켜져 있으면 그것 */
export function flowSub(step: FlowStep, conds: Conditions, start: string) {
  if (typeof step.offsetMin === "number") return clockAt(start, step.offsetMin);
  const hit = Object.entries(step.subWhen ?? {}).find(([c]) => conds[c]);
  return hit ? hit[1] : step.sub ?? "";
}
