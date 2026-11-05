// 예배위원 '한 달 표': 예배별 날짜 계산, 명단 글 ↔ 칸 변환, 스프레드시트 붙여넣기 해석.
// 화면(클라이언트)과 테스트에서 함께 쓰므로 다른 모듈을 가져오지 않는다.

export type StaffCells = { guide: string; offering: string; reading: string; other: string };
export const STAFF_COLUMNS: { key: keyof StaffCells; label: string }[] = [
  { key: "guide", label: "안내위원" },
  { key: "offering", label: "헌금위원" },
  { key: "reading", label: "말씀봉독" },
  { key: "other", label: "그 외" },
];
const ROLE_KEYS = ["guide", "offering", "reading"] as const;
const ROLE_LABEL = { guide: "안내위원", offering: "헌금위원", reading: "말씀봉독" } as const;

export const emptyCells = (): StaffCells => ({ guide: "", offering: "", reading: "", other: "" });

// 저장된 명단 글('안내위원: 김, 이' 줄 + 나머지 줄)을 칸으로 나눈다. 예배위원 화면의 입력칸과 같은 형식이다.
export function parseStaff(text: string): StaffCells {
  const lines = text.split("\n");
  const cells = emptyCells();
  for (const key of ROLE_KEYS) cells[key] = lines.filter(l => l.startsWith(ROLE_LABEL[key] + ": ")).map(l => l.slice(ROLE_LABEL[key].length + 2)).join(", ");
  cells.other = lines.filter(l => !ROLE_KEYS.some(k => l.startsWith(ROLE_LABEL[k] + ": "))).join("\n").trim();
  return cells;
}

export function composeStaff(cells: StaffCells): string {
  return [...ROLE_KEYS.filter(k => cells[k].trim()).map(k => ROLE_LABEL[k] + ": " + cells[k].trim()), cells.other.trim()].filter(Boolean).join("\n");
}

export type MonthService = { id: string; name: string; weekday: number | null; month_week: number | null };
export type Occurrence = { date: string; serviceId: string; serviceName: string };

const pad = (n: number) => String(n).padStart(2, "0");
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${pad(last)}`, days: last };
}

// 요일이 정해진 예배만 그 달 날짜를 만든다. month_week가 있으면 그 달의 n번째(-1은 마지막) 해당 요일만.
// services는 표에 나올 순서(sort_order)대로 넘긴다.
export function monthOccurrences(month: string, services: MonthService[]): Occurrence[] {
  const { days } = monthRange(month);
  const out: Occurrence[] = [];
  for (let day = 1; day <= days; day++) {
    const date = `${month}-${pad(day)}`;
    const wd = new Date(date + "T00:00:00Z").getUTCDay();
    const nth = Math.ceil(day / 7), isLast = day + 7 > days;
    for (const s of services) {
      if (s.weekday !== wd) continue;
      if (s.month_week != null && !(s.month_week === -1 ? isLast : s.month_week === nth)) continue;
      out.push({ date, serviceId: s.id, serviceName: s.name });
    }
  }
  return out;
}

// 탭으로 나뉜 표(구글 시트·엑셀 복사). 한 칸 안 줄바꿈은 큰따옴표로 감싸져 온다.
export function parseTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, i = 0;
  const src = text.replace(/\r\n?/g, "\n");
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { quoted = true; i++; continue; }
    if (ch === "\t") { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += ch; i++;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

// 한 칸에 여러 이름(줄바꿈·슬래시 등)을 '김, 이'로 맞춘다.
export function cleanNames(v: string) {
  return v.split(/\n|\/|、|·|;|,/).map(s => s.trim()).filter(Boolean).join(", ");
}

// '11/2', '11.2', '11월 2일', '2026-11-02', '2026. 11. 2.', '2일', '2' 같은 날짜를 그 달 기준으로 읽는다.
export function parseDateCell(cell: string, month: string): string | null {
  const v = cell.replace(/\([^)]*\)/g, " ").replace(/[일월화수목금토]요일/g, " ").trim();
  if (!v) return null;
  const [y, m] = month.split("-").map(Number);
  const { days } = monthRange(month);
  const ok = (yy: number, mm: number, dd: number) => (yy === y && mm === m && dd >= 1 && dd <= days ? `${month}-${pad(dd)}` : null);
  let r = v.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?$/);
  if (r) return ok(+r[1], +r[2], +r[3]);
  r = v.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?$/);
  if (r) return ok(y, +r[1], +r[2]);
  r = v.match(/^(\d{1,2})\s*일?$/);
  if (r) return ok(y, m, +r[1]);
  return null;
}

const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
// 예배 이름 칸('1부', '1부 예배', 'PD')을 그 날짜의 예배 중에서 찾는다.
export function matchService(cell: string, candidates: Occurrence[]): Occurrence | null {
  const c = norm(cell);
  if (!c) return null;
  return candidates.find(o => norm(o.serviceName) === c)
    ?? candidates.find(o => norm(o.serviceName).startsWith(c) || c.startsWith(norm(o.serviceName)))
    ?? candidates.find(o => norm(o.serviceName).includes(c) || c.includes(norm(o.serviceName)))
    ?? null;
}

type Kind = "date" | "service" | keyof StaffCells;
function headerKind(h: string): Kind | null {
  const v = norm(h);
  if (!v) return null;
  if (v.includes("안내")) return "guide";
  if (v.includes("헌금")) return "offering";
  if (v.includes("봉독") || v.includes("말씀")) return "reading";
  if (/날짜|일자|date|^날$|^일$/.test(v)) return "date";
  if (v.includes("위원")) return "other";
  if (/예배|구분|service|^부$/.test(v)) return "service";
  return null;
}
const isRoleLabel = (s: string) => { const k = headerKind(s); return k === "guide" || k === "offering" || k === "reading"; };

export type PasteResult = { updates: { index: number; cells: Partial<StaffCells> }[]; unmatched: string[] };

// 붙여넣은 표를 한 달 표에 맞춘다.
// - 머리글(날짜·예배·안내·헌금·봉독…)이 있으면 그 이름으로 칸을 찾고, 날짜(+예배)로 줄을 찾는다.
// - 날짜가 열 방향(첫 열에 역할 이름)이면 뒤집어서 읽는다.
// - 머리글이 없으면 '날짜, (예배), 안내, 헌금, 봉독, 그 외' 순서로 보고, 날짜도 없으면 startIndex부터 차례로 채운다.
// - 병합된 날짜 칸(아래 줄이 비어 있음)은 위 날짜를 이어 쓴다. 같은 날 예배가 여럿인데 예배 칸이 없으면 순서대로 넣는다.
// 메신저·메모장 등을 거치면 탭이 띄어쓰기 4칸으로 바뀌어 온다. 탭이 하나도 없을 때만 4칸을 한 칸 구분으로 본다.
export const tabsFromSpaces = (text: string) => (text.includes("\t") ? text : text.replace(/ {4}/g, "\t"));

export function applyPaste(text: string, month: string, rows: Occurrence[], startIndex = 0): PasteResult {
  let table = parseTable(tabsFromSpaces(text));
  const unmatched: string[] = [];
  const updates: PasteResult["updates"] = [];
  if (!table.length) return { updates, unmatched };
  const roster = parseRosterSheet(table, month, rows);
  if (roster) return roster;
  const width = Math.max(...table.map(r => r.length));
  table = table.map(r => [...r, ...Array(width - r.length).fill("")]);
  const firstColRoles = table.slice(1).filter(r => isRoleLabel(r[0])).length;
  if (firstColRoles >= 2 && !table[0].some(isRoleLabel)) table = table[0].map((_, c) => table.map(r => r[c]));

  const headerKinds = table[0].map(headerKind);
  const hasHeader = headerKinds.some(k => k === "guide" || k === "offering" || k === "reading" || k === "date");
  let kinds: (Kind | null)[];
  let labels: string[];
  let body: string[][];
  if (hasHeader) {
    // 머리글이 빈 칸이라도 아래가 날짜로 채워져 있으면 날짜 칸으로 본다(뒤집은 표의 첫 열 등).
    const datesIn = (c: number) => table.slice(1).filter(r => parseDateCell(r[c], month)).length;
    kinds = headerKinds.map((k, c) => k ?? (!headerKinds.includes("date") && datesIn(c) > 0 && datesIn(c) >= (table.length - 1) / 2 ? "date" : "other"));
    labels = table[0].map(h => h.trim());
    body = table.slice(1);
  } else {
    body = table;
    const first = body[0];
    const dated = parseDateCell(first[0], month) !== null;
    const withService = dated && body.some(r => r[1] && matchService(r[1], rows.filter(o => o.date === parseDateCell(r[0], month))));
    const lead: Kind[] = dated ? (withService ? ["date", "service"] : ["date"]) : [];
    kinds = Array.from({ length: first.length }, (_, i) => i < lead.length ? lead[i] : (["guide", "offering", "reading", "other"] as Kind[])[i - lead.length] ?? "other");
    labels = Array(first.length).fill("");
  }
  const col = (k: Kind) => kinds.indexOf(k);
  const dateCol = col("date"), serviceCol = col("service");
  const used = new Set<number>();
  let lastDate: string | null = null, seq = startIndex;
  for (const r of body) {
    const cells: Partial<StaffCells> = {};
    const others: string[] = [];
    kinds.forEach((k, i) => {
      if (k === "guide" || k === "offering" || k === "reading") cells[k] = cleanNames(r[i] ?? "");
      else if (k === "other" && r[i]?.trim()) others.push(labels[i] ? `${labels[i]}: ${cleanNames(r[i])}` : r[i].trim());
    });
    if (kinds.includes("other")) cells.other = others.join("\n");
    if (!Object.values(cells).some(v => v)) continue;
    let index = -1;
    if (dateCol >= 0) {
      const raw = r[dateCol]?.trim() ?? "";
      const date: string | null = raw ? parseDateCell(raw, month) : lastDate;
      if (raw && !date) { unmatched.push(`이 달 날짜로 읽지 못함: ${raw}`); continue; }
      lastDate = date;
      const sameDay = rows.map((o, i) => ({ o, i })).filter(x => x.o.date === date);
      if (!sameDay.length) { unmatched.push(`${raw || date} 에는 예배가 없습니다`); continue; }
      const svc = serviceCol >= 0 ? r[serviceCol]?.trim() ?? "" : "";
      if (svc) {
        const hit = matchService(svc, sameDay.map(x => x.o));
        index = hit ? sameDay.find(x => x.o === hit)!.i : -1;
        if (index < 0) { unmatched.push(`${raw || date} ${svc}: 예배를 찾지 못함`); continue; }
      } else {
        index = sameDay.find(x => !used.has(x.i))?.i ?? -1;
        if (index < 0) { unmatched.push(`${raw || date}: 그날 예배보다 줄이 많습니다`); continue; }
      }
    } else {
      index = seq++;
      if (index >= rows.length) { unmatched.push(`표보다 줄이 많습니다: ${r.filter(Boolean).join(" ").slice(0, 40)}`); continue; }
    }
    used.add(index);
    updates.push({ index, cells });
  }
  return { updates, unmatched };
}

// 교회 '월별 예배 위원표' 모양: 한 시트에 주일·수요·금요 블록이 나란히 있고, 각 블록은
//   (위 줄) 블록 제목  예) 주일 예배 위원 / 수요 예배 위원
//   날짜 | 구분 | 1부 | 2부 | 3부 | 라이프라인 예배      또는   날짜 | 구분 | 명단
//   11월 1일 | 안내위원(1층) | 이름 … / (빈 날짜) | 헌금위원 | 이름 이름 …
// 구분이 비어 있으면 위 구분을 이어 쓰고(금요 안내위원 여러 줄), 빈 줄이 나오면 블록이 끝난다(아래 메모·명단은 읽지 않음).
// 안내위원은 층을 괄호로 남긴다: '홍길동(1층), 김철수(2층 입구)'. 한 칸 안 이름은 띄어쓰기로 나뉜다.
const splitNames = (v: string) => v.split(/[\s,/·;、]+/).map(x => x.trim()).filter(Boolean)
  .reduce<string[]>((out, x) => (x.startsWith("(") && out.length ? (out[out.length - 1] += x, out) : (out.push(x), out)), []);
function rosterRole(label: string): { key: keyof StaffCells; place: string } | null {
  const v = label.replace(/\s+/g, " ").trim();
  if (!v) return null;
  const place = v.match(/\(([^)]*)\)/)?.[1]?.trim() ?? "";
  if (v.includes("안내")) return { key: "guide", place };
  if (v.includes("헌금")) return { key: "offering", place };
  if (v.includes("봉독") || v.includes("말씀")) return { key: "reading", place };
  return { key: "other", place: v };
}
function parseRosterSheet(table: string[][], month: string, rows: Occurrence[]): PasteResult | null {
  const width = Math.max(...table.map(r => r.length));
  const cell = (r: number, c: number) => (table[r]?.[c] ?? "").trim();
  type Block = { headerRow: number; dateCol: number; cols: { col: number; name: string }[]; title: string };
  const blocks: Block[] = [];
  table.forEach((row, r) => row.forEach((v, c) => {
    if (norm(v) !== "날짜" || norm(cell(r, c + 1)) !== "구분") return;
    const cols: Block["cols"] = [];
    for (let k = c + 2; k < width && cell(r, k) && norm(cell(r, k)) !== "날짜"; k++) cols.push({ col: k, name: cell(r, k) });
    let title = "";
    for (let k = c; k >= 0 && !title; k--) title = cell(r - 1, k);
    if (cols.length) blocks.push({ headerRow: r, dateCol: c, cols, title });
  }));
  if (!blocks.length) return null;

  const acc = new Map<number, { guide: string[]; offering: string[]; reading: string[]; other: string[] }>();
  const unmatched = new Set<string>();
  let otherMonth = 0;
  for (const b of blocks) {
    // 날짜 칸이 있는 줄들을 찾고, 한 날짜가 차지하는 줄 수(다음 날짜까지 간격)만큼만 읽는다.
    // 블록 안 빈 줄(수요·금요는 칸이 적다)은 건너뛰고, 마지막 날짜 아래 메모·명단은 읽지 않는다.
    const looksDate = (v: string) => /\d\s*[-./월]\s*\d/.test(v);
    const dateRows: number[] = [];
    for (let r = b.headerRow + 1; r < table.length; r++) {
      const d = cell(r, b.dateCol);
      if (!d) continue;
      if (!looksDate(d)) break;
      dateRows.push(r);
    }
    const gaps = dateRows.slice(1).map((r, i) => r - dateRows[i]);
    const height = gaps.length ? Math.min(...gaps) : (() => { let h = 1; while (dateRows[0] + h < table.length && table[dateRows[0] + h].some(v => v.trim())) h++; return h; })();
    for (const [k, start] of dateRows.entries()) {
     const end = Math.min(dateRows[k + 1] ?? Infinity, start + height, table.length);
     const rawDate = cell(start, b.dateCol), date = parseDateCell(rawDate, month);
     if (!date) { otherMonth++; continue; }
     let role: ReturnType<typeof rosterRole> = null;
     for (let r = start; r < end; r++) {
      const g = cell(r, b.dateCol + 1);
      const names = b.cols.map(x => cell(r, x.col));
      if (g) role = rosterRole(g);
      if (!role) continue;
      const sameDay = rows.map((o, i) => ({ o, i })).filter(x => x.o.date === date);
      b.cols.forEach((x, k) => {
        const list = splitNames(names[k]);
        if (!list.length) return;
        // '명단' 한 칸짜리 블록은 블록 제목(수요·금요)으로, 여러 칸이면 칸 머리글(1부·2부…)로 예배를 찾는다.
        const single = b.cols.length === 1;
        const hit = matchService(single ? b.title.replace(/위원|예배/g, "") : x.name, sameDay.map(y => y.o)) ?? (single && sameDay.length === 1 ? sameDay[0].o : null);
        if (!hit) { unmatched.add(`${rawDate} ${single ? b.title.replace(/\s*위원\s*$/, "") : x.name}: 이 날짜에 맞는 예배가 목록에 없습니다`); return; }
        const index = sameDay.find(y => y.o === hit)!.i;
        const a = acc.get(index) ?? { guide: [], offering: [], reading: [], other: [] };
        if (role!.key === "guide") a.guide.push(...list.map(n => role!.place ? `${n}(${role!.place})` : n));
        else if (role!.key === "other") a.other.push(`${role!.place}: ${list.join(", ")}`);
        else a[role!.key].push(...list);
        acc.set(index, a);
      });
     }
    }
  }
  const updates = [...acc].sort((x, y) => x[0] - y[0]).map(([index, a]) => {
    const cells: Partial<StaffCells> = { guide: a.guide.join(", "), offering: a.offering.join(", "), reading: a.reading.join(", ") };
    if (a.other.length) cells.other = a.other.join("\n");
    return { index, cells };
  });
  const list = [...unmatched];
  if (otherMonth) list.push(`다른 달 날짜 ${otherMonth}개는 건너뛰었습니다`);
  return { updates, unmatched: list };
}

// 칸 하나에 여러 칸짜리 표를 붙여넣으면 그 칸부터 오른쪽·아래로 채운다(스프레드시트처럼).
export function pasteBlock(text: string, rowIndex: number, colIndex: number, rowCount: number): PasteResult["updates"] {
  const keys = STAFF_COLUMNS.map(c => c.key);
  return parseTable(text).flatMap((r, dr) => {
    const index = rowIndex + dr;
    if (index >= rowCount) return [];
    const cells: Partial<StaffCells> = {};
    r.forEach((v, dc) => { const k = keys[colIndex + dc]; if (k) cells[k] = k === "other" ? v.trim() : cleanNames(v); });
    return [{ index, cells }];
  });
}
