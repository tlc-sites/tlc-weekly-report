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

/** 주일예배 큐시트 양식. lines·staff의 key는 회차 roster의 키(PD 담당자 칸과 같은 키면 같은 값). 'pd'는 회차의 PD 이름. */
export type CueRow = { id: string; ko: string; en: string; from: number; to: number | null; condition?: string | null; lines: { key: string; hint?: string }[] };
export type Cue = { label: string; rows: CueRow[]; staff: { key: string; ko: string; en: string }[]; songs: number };

export type PdTemplate = {
  id: string; name: string; start: string; flowType: string; handoverTo?: string; cue?: Cue; color?: string;
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

/** 인쇄용 명단(담당 칸)을 줄·사람 단위로 나눈다. 사람 한 명('김OO (일렉 기타)', '건반 김OO')은 중간에 줄을 바꾸지 않는다.
 *  나누는 곳: 적어 둔 줄바꿈, 쉼표·세미콜론(앞 사람 끝에 붙임), / · (다음 사람 앞에 sep로, 줄 첫머리에선 숨김), 닫는 괄호 뒤 띄어쓰기.
 *  저장된 값은 바꾸지 않고 보여 줄 때만 쓴다(NameList). */
export type NameItem = { sep: string; text: string };
export function splitNames(text: string): NameItem[][] {
  return text.split(/\r?\n/).map(line => {
    const items: NameItem[] = [];
    let sep = "";
    line.split(/(\s*[,;/·]\s*|(?<=\))[ \t]+)/).forEach((part, i) => {
      if (i % 2) {
        const c = part.trim();
        if (c === "," || c === ";") { if (items.length) items[items.length - 1].text += c; sep = ""; } else sep = c;
        return;
      }
      const t = part.trim();
      if (t) items.push({ sep, text: t.replace(/[ \t]+/g, "\u00a0") });
      sep = "";
    });
    return items;
  });
}

/** 영어 큐시트의 예배 이름: '1st.' → '1st Service', 'LIFELINE' → 'Lifeline' */
export function serviceNameEn(label: string) {
  const m = label.match(/^(\d+(?:st|nd|rd|th))\.?$/i);
  if (m) return `${m[1].toLowerCase()} Service`;
  return label.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

/** 인쇄용 문장(순서·송리스트 칸): 띄어쓰기에서 줄을 바꾸되, 괄호 묶음('(마태복음 9:1-8)')은 앞 낱말과 함께 한 덩어리로,
 *  숫자 사이 붙임표(9:1-8)는 줄바꿈 없는 붙임표로 둔다. */
export const keepPhrase = (text: string) =>
  text.replace(/[ \t]+\(/g, "\u00a0(").replace(/\([^)\n]*\)/g, p => p.replace(/[ \t]/g, "\u00a0")).replace(/(\d)-(?=\d)/g, "$1\u2011");

/** 큐시트 시간 칸: '08:20 - 08:40', 끝이 없으면 '19:05 -' */
export const cueTime = (start: string, r: CueRow) => `${clockAt(start, r.from)} -${r.to === null ? "" : " " + clockAt(start, r.to)}`;

/** 큐시트 제목: '2026.11.8 1st. (08:20)' */
export function cueTitle(date: string, label: string, start: string) {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}.${m}.${d} ${label} (${start})`;
}

/** 성찬 곡 칸(헌금 다음). 성찬주간(conditions.communion)이 켜졌을 때만 큐시트·PD 체크리스트 송리스트에 보인다. */
export const COMM_SONG = { id: "song_comm", ko: "성찬", en: "Communion" };

/** 큐시트 송리스트 키: song1…songN, 헌금 song_off, 성찬주간이면 성찬 song_comm */
export const cueSongKeys = (cue: Cue, conds: Conditions = {}) =>
  [...Array.from({ length: cue.songs }, (_, i) => "song" + (i + 1)), "song_off", ...(conds.communion ? [COMM_SONG.id] : [])];

/** 예배별 색(체크리스트·큐시트의 강조색). 템플릿에 color가 없으면 예배 키로 정한다. */
export const SERVICE_COLORS = [
  { hex: "#2b62c4", label: "파랑" }, { hex: "#0e7c86", label: "청록" }, { hex: "#6a4bc2", label: "보라" },
  { hex: "#c03a6b", label: "장미" }, { hex: "#b5651d", label: "주황" }, { hex: "#2f7d32", label: "초록" },
];
const DEFAULT_COLOR: Record<string, string> = { sun1: "#2b62c4", sun2: "#0e7c86", sun3: "#6a4bc2", life: "#c03a6b" };
export const serviceColor = (t: Pick<PdTemplate, "id" | "color">) =>
  t.color && /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : DEFAULT_COLOR[t.id] ?? "#2b62c4";
