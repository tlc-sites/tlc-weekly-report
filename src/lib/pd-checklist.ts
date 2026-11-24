// 예배 PD 체크리스트 템플릿 구조와 계산(시각·조건·진행률). 테스트에서 바로 불러 쓰도록 다른 모듈을 import하지 않는다.

export type Conditions = Record<string, boolean>;
export type Condition = { id: string; label: string; tag: string; default: boolean; autoRule?: string };

export type CheckItem = { type: "check"; id: string; text: string; emphasis?: "strong" | "highlight"; teams?: string[]; condition?: string | null };
export type Item =
  | CheckItem
  | { type: "heading"; text: string }
  | { type: "checkGroup"; layout: "columns" | "auto"; columns?: number | null; items: { id: string; text: string }[] }
  | { type: "note"; parts: { text: string; bold: boolean }[] }
  | { type: "locationMatrix"; columns: { key: string; label: string }[]; rows: { id: string; label: string }[] }
  | PeopleTable
  | RosterItem
  | CueCheckItem;

/** 오늘 섬기는 명단(체크 없음): 줄(말씀·위원·예배팀·기술팀)마다 역할 칸. 이름은 회차 roster(큐시트와 같은 값)에서 읽는다.
 *  큐시트에 없는 칸(사진·부산 담당 등)만 여기서 눌러 적는다(cueKeys). w는 칸 너비 비율, two는 이름을 2열로. */
export type RosterItem = {
  type: "roster";
  lines: { label: string; cols: { label: string; field: string; w?: number; two?: boolean }[] }[];
};
/** 주일예배 큐시트 확인 체크: 그 회차 큐시트의 빈 칸을 같이 보이고 큐시트로 가는 링크를 둔다. */
export type CueCheckItem = { type: "cueCheck"; id: string; text: string; sub?: string };

/** 섬기는 사람 표: 사람(열)마다 단계(행: 확인·도착·STANDBY…) 체크. field가 있으면 그 담당자 칸(회차 roster) 이름을 표에서 바로 적고,
 *  그 칸은 2쪽 담당자 칸에서 빠진다. field가 없으면 sub(예: '악기·싱어')만 보인다. 체크 ID는 peopleCheckId. */
export type PeopleTable = {
  type: "people";
  steps: { key: string; label: string }[];
  people: { key: string; label: string; field?: string; sub?: string }[];
  /** 표 왼쪽 위 칸에 보일 묶음 이름(예: '기술팀'). 없으면 비워 둔다. */
  caption?: string;
  /** 단계를 줄로 나누지 않고 한 줄에 칸마다 나란히(높이를 줄일 때). */
  inline?: boolean;
};
/** 지울 수 없는 기본 예배(마이그레이션이 만든 것). 나머지는 관리자가 목록에서 지우고 되살릴 수 있다(DB 62). */
export const BASE_SERVICES=["sun1","sun2","sun3","life"];

export const peopleCheckId = (person: string, step: string) => `pp_${person}_${step}`;

/** 섬기는 사람 표·명단이 이름을 받는 담당자 칸 ID들(2쪽 담당자 칸에서 뺀다) */
export const peopleFields = (tpl: PdTemplate) =>
  new Set(tpl.page1.rows.flat().flatMap(b => b.items).flatMap(i =>
    i.type === "people" ? i.people.flatMap(p => p.field ? [p.field] : [])
    : i.type === "roster" ? i.lines.flatMap(l => l.cols.map(c => c.field)) : []));

/** 큐시트에서 적는 칸(순서 줄·담당). 명단에서 이 칸은 읽기만 하고, 나머지(사진·부산 담당 등)는 체크리스트에서 적는다. */
export const cueKeys = (tpl: PdTemplate) =>
  new Set(tpl.cue ? [...tpl.cue.rows.flatMap(r => r.lines.map(l => l.key)), ...tpl.cue.staff.map(s => s.key)] : []);

/** 명단 칸의 이름을 한 사람씩: '/'·쉼표·줄바꿈에서 나누고 괄호는 그대로 둔다. */
export const splitPeople = (text: string | undefined) =>
  (text ?? "").split(/\s*(?:\/|,|\r?\n)\s*/).map(x => x.trim()).filter(Boolean);

export type Block = {
  id: string; offsetMin: number; label: string; title: string;
  style: "default" | "accent" | "cue" | "go";
  /** 넓게: 줄에서 두 칸을 차지하고 안쪽을 두 단으로 나눈다(합친 블록처럼 내용이 많을 때). */
  wide?: boolean;
  /** 머리 오른쪽의 작은 안내 글 */
  aside?: string;
  arrivals?: { offsetMin: number; text: string; place?: string }[];
  items: Item[];
};

export type FlowStep = {
  id: string; label: string; next: string;
  style: "countdown" | "liveStart" | "start" | "default" | "optional" | "liveEnd" | "end";
  sub?: string; subWhen?: Record<string, string>; condition?: string | null; flag?: string | null; offsetMin?: number;
  /** 큐시트 순서 줄 ID: 있으면 그 줄 시작 시각을 보인다(집중 구간·끝 줄). */
  cue?: string;
  /** PD 집중 구간 칸(이어진 칸들이 한 상자). FLOW 체크 칸 대신 이 칸의 체크 항목을 쓴다.
   *  badge의 {키}는 회차 roster 값으로 바꾼다(예: '헌금송 · {song_off}'). owners는 담당(field면 roster 이름, text면 그 글). */
  focus?: { badge?: string; owners?: { field?: string; text?: string }[]; checks?: CheckItem[] };
};
/** 집중 구간 상자 머리의 체크와, 구간 끝(바로 다음 FLOW 칸) 줄에 보일 담당 칸 */
export type FocusZone = { check?: { id: string; text: string }; endField?: string };

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
    title: string; banner: string; flow: FlowStep[]; roster: RosterGroup[]; focus?: FocusZone;
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
  if (item.type === "people") return item.steps.flatMap(s => item.people.map(p => peopleCheckId(p.key, s.key)));
  if (item.type === "cueCheck") return [item.id];
  return [];
}

/** 화면·진행률에 쓰는 조건: 큐시트 광고 칸에 '영상광고: 없음'이 있으면 영상소식(news)은 꺼진 것으로 본다. */
export function effectiveConditions(tpl: PdTemplate, conds: Conditions, roster: Record<string, string> = {}): Conditions {
  if (!tpl.conditions.some(c => c.id === "news")) return conds;
  const ann = Object.entries(roster).filter(([k]) => k === "c_ann" || k.startsWith("c_ann")).map(([, v]) => v).join("\n");
  return /영상\s*(?:광고|소식)\s*[:：]?\s*없음/.test(ann) ? { ...conds, news: false } : conds;
}

/** 2쪽 FLOW를 집중 구간 앞(before)·구간(zone)·구간 끝 칸(end)·뒤(after)로 나눈다. 집중 칸이 없으면 zone은 비어 있다. */
export function flowParts(tpl: PdTemplate) {
  const f = tpl.page2.flow;
  const a = f.findIndex(s => s.focus);
  if (a < 0) return { before: f, zone: [] as FlowStep[], end: null as FlowStep | null, after: [] as FlowStep[] };
  let b = a;
  while (b < f.length && f[b].focus) b++;
  return { before: f.slice(0, a), zone: f.slice(a, b), end: f[b] ?? null, after: f.slice(b) };
}

/** 큐시트 빈 칸 이름(순서 줄·담당·송리스트). 조건이 꺼진 순서 줄은 뺀다. 큐시트가 없으면 null. */
export function cueBlanks(tpl: PdTemplate, roster: Record<string, string>, pd: string, conds: Conditions): string[] | null {
  const cue = tpl.cue;
  if (!cue) return null;
  const empty = (k: string) => !(k === "pd" ? pd : roster[k] ?? "").trim();
  const out: string[] = [];
  for (const r of cue.rows) {
    if (!isOn(r.condition, conds)) continue;
    for (const l of r.lines) if (empty(l.key)) out.push(l.hint && r.lines.length > 1 ? l.hint : r.ko);
  }
  for (const s of cue.staff) if (empty(s.key)) out.push(s.ko);
  const songs = cueSongKeys(cue, conds).filter(empty).length;
  if (songs) out.push(`송리스트 ${songs}곡`);
  return [...new Set(out)];
}

export const visibleFlow = (tpl: PdTemplate, conds: Conditions) => tpl.page2.flow.filter(s => isOn(s.condition, conds));

/** 진행률에 넣을 체크 ID: 꺼진 조건의 항목·FLOW 칸은 빼고, PD REPORT는 늘 뺀다. */
export function applicableCheckIds(tpl: PdTemplate, conds: Conditions) {
  const fromItems = (items: Item[]) => items.filter(i => i.type !== "check" || isOn(i.condition, conds)).flatMap(itemCheckIds);
  return [
    ...tpl.page1.rows.flat().flatMap(b => fromItems(b.items)),
    // 집중 구간 칸은 FLOW 체크 칸 대신 칸 안의 체크 항목(칸이 꺼지면 모두 뺀다)
    ...visibleFlow(tpl, conds).flatMap(s => s.focus ? fromItems(s.focus.checks ?? []) : [s.id]),
    ...(tpl.page2.focus?.check && tpl.page2.flow.some(s => s.focus) ? [tpl.page2.focus.check.id] : []),
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
