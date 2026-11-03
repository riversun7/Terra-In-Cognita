// 아이템 편집기 대량 도구(WP-7, 설계안 3.8) — 여러 개 고치기(patch: 켜기·끄기, 티어, 중분류, 태그 더하기·빼기, 시작 시세 ‰), JSON·CSV
// 내보내기·가져오기. 서버(items.save의 patch 명령, items.export)와 화면(가져오기 읽기·차이)이 같이 쓰는 순수 함수다.
// - 시작 시세 ‰: BigInt로 max(1, (값 × (1000 + ‰) + 500) ÷ 1000)(0.5는 올림), 상한은 안전한 정수.
// - 옛 칸 이름(팩 core@27까지 baseValue = 기준 가치, 295에서 시작 시세 startPrice로 바꿈): JSON 항목의 baseValue와 CSV 열 baseValue를
//   startPrice로 읽는다(옛 내보내기·변환본을 그대로 가져온다). 내보내기는 새 이름만 쓴다.
// - 가져오기: 글 900 KiB까지, 300줄(항목)까지, 항목 하나 4 KiB까지. 틀린 머리·값은 줄 번호로 알린다(CSV 1줄 = 머리). 가져온 것은 담은
//   변경(초안)에만 들어가고, 묶음 검사는 서버가 한 번 한다(팩 검사기 하나).
// - CSV는 평평한 공통 칸만(장비·효과는 JSON). 있는 아이템은 그 칸만 지금 항목 위에 얹는다.
import { utf8ByteLength } from "./utf8.ts";
import type { ItemCategoryId, ItemJson } from "./itemEditor.ts";

/** 대량 도구 상한(서버도 다시 본다) */
export const ITEM_BULK_LIMITS = {
  /** 가져오기 글(UTF-8 바이트). tRPC 본문 상한 1 MiB 안 */
  importBytesMax: 900 * 1024,
  /** 가져오기 항목(CSV 줄) 수 = 한 묶음 바꿈 상한 */
  rowsMax: 300,
  /** 항목 하나의 JSON 바이트 */
  entryBytesMax: 4096,
  /** 시작 시세 ‰ 범위(−90% ~ +1000%) */
  startPricePm: { min: -900, max: 10_000 },
  /** 한 번에 고치는 아이템 수 */
  patchIdsMax: 300,
} as const;

/** 여러 개 고치기 한 번(서버가 지금 실효 항목에 그 칸만 얹는다 — 낡은 초안이 다른 칸을 덮지 않게) */
export interface ItemPatch {
  readonly enabled?: boolean | undefined;
  readonly tier?: number | undefined;
  /** 중분류(null = 뺀다) */
  readonly subcategory?: string | null | undefined;
  /** 소분류(null = 뺀다) */
  readonly microcategory?: string | null | undefined;
  readonly tagsAdd?: readonly string[] | undefined;
  readonly tagsRemove?: readonly string[] | undefined;
  /** 시작 시세 바꿈(‰, −900 ~ +10000) */
  readonly startPricePm?: number | undefined;
}

/** 시작 시세 × (1000 + ‰) ÷ 1000, 0.5는 올림, 1 이상·안전한 정수 이하(BigInt 셈) */
export function scaleStartPrice(value: number, pm: number): number {
  const scaled = (BigInt(value) * BigInt(1000 + pm) + 500n) / 1000n;
  if (scaled < 1n) return 1;
  return scaled > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(scaled);
}

/** 항목 하나에 고치기를 얹는다(바뀐 것이 없으면 같은 객체) */
export function applyItemPatch(entry: ItemJson, patch: ItemPatch): ItemJson {
  let next: ItemJson = entry;
  if (patch.enabled !== undefined && patch.enabled !== next.enabled)
    next = { ...next, enabled: patch.enabled };
  if (patch.tier !== undefined && patch.tier !== next.tier) next = { ...next, tier: patch.tier };
  if (patch.subcategory !== undefined && patch.subcategory !== (next.subcategory ?? null)) {
    const { subcategory: _drop, microcategory: _dropMicro, ...rest } = next;
    next = patch.subcategory === null ? rest : { ...rest, subcategory: patch.subcategory };
  }
  if (patch.microcategory !== undefined && patch.microcategory !== (next.microcategory ?? null)) {
    const { microcategory: _drop, ...rest } = next;
    next =
      patch.microcategory === null || !next.subcategory
        ? rest
        : { ...next, microcategory: patch.microcategory };
  }
  if ((patch.tagsAdd?.length ?? 0) + (patch.tagsRemove?.length ?? 0) > 0) {
    const remove = new Set(patch.tagsRemove ?? []);
    const tags = [...new Set([...(next.tags ?? []), ...(patch.tagsAdd ?? [])])].filter(
      (tag) => !remove.has(tag),
    );
    const same = JSON.stringify(tags) === JSON.stringify(next.tags ?? []);
    if (!same) {
      const { tags: _drop, ...rest } = next;
      next = tags.length === 0 ? rest : { ...rest, tags };
    }
  }
  if (patch.startPricePm !== undefined && patch.startPricePm !== 0) {
    const startPrice = scaleStartPrice(next.startPrice, patch.startPricePm);
    if (startPrice !== next.startPrice) next = { ...next, startPrice };
  }
  return next;
}

/** CSV 열(평평한 공통 칸, 설계안 3.8). 태그는 "|"로 잇는다 */
export const ITEM_CSV_COLUMNS = [
  "id",
  "category",
  "subcategory",
  "microcategory",
  "tier",
  "startPrice",
  "weight",
  // 거래 묶음 크기(302·D-506, 팩 core@29). 이 열이 없는 옛 CSV는 칸을 그대로 둔다
  "lotSize",
  "stackMax",
  "tradable",
  "bound",
  "enabled",
  "name.ko",
  "name.en",
  "description.ko",
  "description.en",
  "tags",
] as const;
export type ItemCsvColumn = (typeof ITEM_CSV_COLUMNS)[number];

/** 옛 CSV 열 이름 → 지금 열(팩 core@27까지의 내보내기를 그대로 읽는다) */
export const ITEM_CSV_ALIASES: ReadonlyMap<string, ItemCsvColumn> = new Map([["baseValue", "startPrice"]]);

/** 옛 JSON 칸 baseValue(기준 가치) → startPrice, 옛 대분류 precious → gem(바뀌지 않으면 같은 객체) */
function withStartPrice(raw: Record<string, unknown>): Record<string, unknown> {
  let next = raw;
  if ("baseValue" in next) {
    const { baseValue, ...rest } = next;
    next = "startPrice" in rest ? rest : { ...rest, startPrice: baseValue };
  }
  if (next.category === "precious") next = { ...next, category: "gem" };
  return next;
}

/** 가져오기 문제 하나: row = 줄 번호(CSV는 머리 = 1, JSON은 항목 차례 1부터, 0 = 글 전체) */
export interface ItemImportProblem {
  readonly row: number;
  readonly column: string | null;
  readonly code:
    | "too_large"
    | "too_many_rows"
    | "empty"
    | "bad_json"
    | "not_entries"
    | "bad_entry"
    | "entry_too_large"
    | "unknown_column"
    | "missing_column"
    | "duplicate_column"
    | "bad_quote"
    | "column_count"
    | "duplicate_id"
    | "bad_id"
    | "not_int"
    | "bad_bool"
    | "bad_category"
    | "missing_value";
  /** 글자 값(모르는 열 이름 등) */
  readonly value: string | null;
}

export interface ItemImportResult {
  readonly entries: readonly ItemJson[];
  /** 항목 ID → 줄 번호(서버 검사 문제를 줄로 보인다) */
  readonly rows: Readonly<Record<string, number>>;
  readonly problems: readonly ItemImportProblem[];
}

const ID = /^[a-z][a-z0-9_]{1,47}$/;
const CATEGORIES: readonly ItemCategoryId[] = [
  "raw",
  "processed",
  "part",
  "equipment",
  "consumable",
  "gem",
  "construction",
  "document",
];

const problem = (
  row: number,
  code: ItemImportProblem["code"],
  column: string | null = null,
  value: string | null = null,
): ItemImportProblem => ({ row, column, code, value });

/** 글 크기 검사(가져오기 앞) */
function sizeProblem(text: string): ItemImportProblem | null {
  if (utf8ByteLength(text) > ITEM_BULK_LIMITS.importBytesMax) return problem(0, "too_large");
  return text.trim() === "" ? problem(0, "empty") : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** JSON 가져오기: 팩 파일 모양 {"entries": […]} 또는 항목 배열. 칸마다의 규칙은 서버가 팩 스키마로 본다(여기서는 모양·크기만) */
export function parseItemsJson(text: string): ItemImportResult {
  const size = sizeProblem(text);
  if (size) return { entries: [], rows: {}, problems: [size] };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { entries: [], rows: {}, problems: [problem(0, "bad_json")] };
  }
  const list: unknown = Array.isArray(value) ? value : isRecord(value) ? value.entries : undefined;
  if (!Array.isArray(list)) return { entries: [], rows: {}, problems: [problem(0, "not_entries")] };
  if (list.length > ITEM_BULK_LIMITS.rowsMax)
    return { entries: [], rows: {}, problems: [problem(0, "too_many_rows")] };
  const entries: ItemJson[] = [];
  const rows: Record<string, number> = {};
  const problems: ItemImportProblem[] = [];
  list.forEach((given: unknown, index) => {
    const row = index + 1;
    if (!isRecord(given) || typeof given.id !== "string") {
      problems.push(problem(row, "bad_entry"));
      return;
    }
    const raw = withStartPrice(given);
    const id = given.id;
    if (!ID.test(id)) problems.push(problem(row, "bad_id", "id", id));
    else if (rows[id] !== undefined) problems.push(problem(row, "duplicate_id", "id", id));
    if (utf8ByteLength(JSON.stringify(raw)) > ITEM_BULK_LIMITS.entryBytesMax)
      problems.push(problem(row, "entry_too_large", null, id));
    if (!isItemShape(raw)) {
      problems.push(problem(row, "bad_entry", null, id));
      return;
    }
    if (rows[id] === undefined) rows[id] = row;
    entries.push(raw);
  });
  return { entries, rows, problems };
}

/** 아이템 모양(공통 필수 칸)인가 */
function isItemShape(value: Record<string, unknown>): value is Record<string, unknown> & ItemJson {
  const name = value.name;
  return (
    typeof value.id === "string" &&
    isRecord(name) &&
    typeof name.ko === "string" &&
    typeof name.en === "string" &&
    CATEGORIES.some((category) => category === value.category) &&
    typeof value.tier === "number" &&
    typeof value.startPrice === "number" &&
    typeof value.enabled === "boolean"
  );
}

/** CSV 한 줄 → 칸(따옴표 "" 이스케이프). 닫히지 않은 따옴표면 null */
export function splitCsvLine(line: string): string[] | null {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(current);
      current = "";
    } else current += char;
  }
  if (quoted) return null;
  cells.push(current);
  return cells;
}

/** 칸 글자 → CSV 칸(쉼표·따옴표·줄바꿈이 있으면 따옴표로 싼다) */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** 아이템 → CSV 한 줄(열 차례 ITEM_CSV_COLUMNS) */
function csvRowOf(entry: ItemJson): string {
  const cell: Record<ItemCsvColumn, string> = {
    id: entry.id,
    category: entry.category,
    subcategory: entry.subcategory ?? "",
    microcategory: entry.microcategory ?? "",
    tier: String(entry.tier),
    startPrice: String(entry.startPrice),
    weight: entry.weight === undefined ? "" : String(entry.weight),
    lotSize: entry.lotSize === undefined ? "" : String(entry.lotSize),
    stackMax: entry.stackMax === undefined ? "" : String(entry.stackMax),
    tradable: entry.tradable === undefined ? "" : String(entry.tradable),
    bound: entry.bound === undefined ? "" : String(entry.bound),
    enabled: String(entry.enabled),
    "name.ko": entry.name.ko,
    "name.en": entry.name.en,
    "description.ko": entry.description?.ko ?? "",
    "description.en": entry.description?.en ?? "",
    tags: (entry.tags ?? []).join("|"),
  };
  return ITEM_CSV_COLUMNS.map((column) => csvCell(cell[column])).join(",");
}

/** CSV 내보내기(머리 + 항목마다 한 줄, 줄 끝 \n) */
export function itemsToCsv(entries: readonly ItemJson[]): string {
  return `${[ITEM_CSV_COLUMNS.join(","), ...entries.map(csvRowOf)].join("\n")}\n`;
}

/** JSON 내보내기(팩 파일 모양) */
export function itemsToJson(entries: readonly ItemJson[]): string {
  return `${JSON.stringify({ entries }, null, 2)}\n`;
}

const REQUIRED_COLUMNS: readonly ItemCsvColumn[] = ["id"];
/** 새 항목에 꼭 있어야 하는 열 */
const NEW_ITEM_COLUMNS: readonly ItemCsvColumn[] = ["category", "tier", "startPrice", "name.ko", "name.en"];

/**
 * CSV 가져오기. current = 지금 실효 항목(ID → 항목): 있는 아이템은 적은 칸만 그 위에 얹고(빈 칸 = 그대로, 선택 칸은 "-" = 뺀다),
 * 새 아이템은 필수 열이 있어야 하며 꺼진 채로 만든다(enabled 열이 있으면 그 값)
 */
export function parseItemsCsv(text: string, current: ReadonlyMap<string, ItemJson>): ItemImportResult {
  const size = sizeProblem(text);
  if (size) return { entries: [], rows: {}, problems: [size] };
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  const header = splitCsvLine(lines[0] ?? "");
  if (!header) return { entries: [], rows: {}, problems: [problem(1, "bad_quote")] };
  const problems: ItemImportProblem[] = [];
  const columns = header.map((name) => ITEM_CSV_ALIASES.get(name.trim()) ?? name.trim());
  const known = new Set<string>(ITEM_CSV_COLUMNS);
  const seen = new Set<string>();
  columns.forEach((name) => {
    if (!known.has(name)) problems.push(problem(1, "unknown_column", name, name));
    else if (seen.has(name)) problems.push(problem(1, "duplicate_column", name, name));
    seen.add(name);
  });
  for (const name of REQUIRED_COLUMNS)
    if (!seen.has(name)) problems.push(problem(1, "missing_column", name, name));
  if (problems.length > 0) return { entries: [], rows: {}, problems };
  if (lines.length - 1 > ITEM_BULK_LIMITS.rowsMax)
    return { entries: [], rows: {}, problems: [problem(0, "too_many_rows")] };
  const entries: ItemJson[] = [];
  const rows: Record<string, number> = {};
  lines.slice(1).forEach((line, index) => {
    const row = index + 2;
    if (line.trim() === "") return;
    const cells = splitCsvLine(line);
    if (!cells) {
      problems.push(problem(row, "bad_quote"));
      return;
    }
    if (cells.length !== columns.length) {
      problems.push(problem(row, "column_count", null, String(cells.length)));
      return;
    }
    const value = (column: ItemCsvColumn): string | undefined => {
      const at = columns.indexOf(column);
      return at < 0 ? undefined : cells[at];
    };
    const parsed = rowEntry(row, value, current, problems);
    if (!parsed) return;
    if (rows[parsed.id] !== undefined) {
      problems.push(problem(row, "duplicate_id", "id", parsed.id));
      return;
    }
    rows[parsed.id] = row;
    entries.push(parsed);
  });
  return { entries, rows, problems };
}

/** CSV 한 줄 → 항목(틀리면 problems에 넣고 null) */
function rowEntry(
  row: number,
  value: (column: ItemCsvColumn) => string | undefined,
  current: ReadonlyMap<string, ItemJson>,
  problems: ItemImportProblem[],
): ItemJson | null {
  const id = (value("id") ?? "").trim();
  if (!ID.test(id)) {
    problems.push(problem(row, "bad_id", "id", id));
    return null;
  }
  const base = current.get(id);
  const before = problems.length;
  const text = (column: ItemCsvColumn): string | undefined => {
    const raw = value(column);
    return raw === undefined || raw.trim() === "" ? undefined : raw.trim();
  };
  if (!base)
    for (const column of NEW_ITEM_COLUMNS)
      if (text(column) === undefined) problems.push(problem(row, "missing_value", column));
  const int = (column: ItemCsvColumn): number | undefined | null => {
    const raw = text(column);
    if (raw === undefined || raw === "-") return raw === "-" ? null : undefined;
    if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
      problems.push(problem(row, "not_int", column, raw));
      return undefined;
    }
    return Number(raw);
  };
  const bool = (column: ItemCsvColumn): boolean | undefined | null => {
    const raw = text(column)?.toLowerCase();
    if (raw === undefined || raw === "-") return raw === "-" ? null : undefined;
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    problems.push(problem(row, "bad_bool", column, raw));
    return undefined;
  };
  const rawCategory = text("category");
  const category = rawCategory === "precious" ? "gem" : rawCategory;
  const validCategory = CATEGORIES.find((item) => item === category);
  if (category !== undefined && !validCategory)
    problems.push(problem(row, "bad_category", "category", rawCategory));
  const tier = int("tier");
  const startPrice = int("startPrice");
  const weight = int("weight");
  const lotSize = int("lotSize");
  const stackMax = int("stackMax");
  const tradable = bool("tradable");
  const bound = bool("bound");
  const enabled = bool("enabled");
  if (problems.length > before) return null;
  const nameKo = text("name.ko") ?? base?.name.ko ?? "";
  const nameEn = text("name.en") ?? base?.name.en ?? "";
  let next: ItemJson = base ?? {
    id,
    name: { ko: nameKo, en: nameEn },
    category: validCategory ?? "raw",
    tier: 0,
    startPrice: 1,
    enabled: false,
  };
  next = { ...next, name: { ko: nameKo, en: nameEn } };
  if (validCategory) next = { ...next, category: validCategory };
  if (typeof tier === "number") next = { ...next, tier };
  if (typeof startPrice === "number") next = { ...next, startPrice };
  if (typeof enabled === "boolean") next = { ...next, enabled };
  next = withNumbers(next, weight, stackMax, lotSize);
  next = withFlags(next, tradable, bound);
  const sub = text("subcategory");
  if (sub !== undefined) {
    const { subcategory: _drop, microcategory: _dropMicro, ...rest } = next;
    next =
      sub === "-"
        ? rest
        : sub === next.subcategory && next.microcategory
          ? { ...rest, subcategory: sub, microcategory: next.microcategory }
          : { ...rest, subcategory: sub };
  }
  const micro = text("microcategory");
  if (micro !== undefined) {
    const { microcategory: _drop, ...rest } = next;
    next = micro === "-" || !next.subcategory ? rest : { ...rest, microcategory: micro };
  }
  const descKo = text("description.ko");
  const descEn = text("description.en");
  if (descKo === "-" || descEn === "-") {
    const { description: _drop, ...rest } = next;
    next = rest;
  } else if (descKo !== undefined || descEn !== undefined)
    next = {
      ...next,
      description: { ko: descKo ?? next.description?.ko ?? "", en: descEn ?? next.description?.en ?? "" },
    };
  const tags = text("tags");
  if (tags !== undefined) {
    const list =
      tags === "-"
        ? []
        : tags
            .split("|")
            .map((tag) => tag.trim())
            .filter((tag) => tag !== "");
    const { tags: _drop, ...rest } = next;
    next = list.length === 0 ? rest : { ...rest, tags: list };
  }
  return next;
}

/** 선택 숫자 칸(무게·스택 상한·거래 묶음): undefined = 그대로, null = 뺀다, 값 = 넣는다 */
function withNumbers(
  entry: ItemJson,
  weight: number | null | undefined,
  stackMax: number | null | undefined,
  lotSize: number | null | undefined,
): ItemJson {
  let next = entry;
  if (lotSize !== undefined) {
    const { lotSize: _drop, ...rest } = next;
    next = lotSize === null ? rest : { ...rest, lotSize };
  }
  if (weight !== undefined) {
    const { weight: _drop, ...rest } = next;
    next = weight === null ? rest : { ...rest, weight };
  }
  if (stackMax !== undefined) {
    const { stackMax: _drop, ...rest } = next;
    next = stackMax === null ? rest : { ...rest, stackMax };
  }
  return next;
}

/** 선택 참거짓 칸(거래 가능·계정 귀속): undefined = 그대로, null = 뺀다, 값 = 넣는다 */
function withFlags(
  entry: ItemJson,
  tradable: boolean | null | undefined,
  bound: boolean | null | undefined,
): ItemJson {
  let next = entry;
  if (tradable !== undefined) {
    const { tradable: _drop, ...rest } = next;
    next = tradable === null ? rest : { ...rest, tradable };
  }
  if (bound !== undefined) {
    const { bound: _drop, ...rest } = next;
    next = bound === null ? rest : { ...rest, bound };
  }
  return next;
}

/** 가져온 항목과 지금 항목의 차이(새로 / 고침 / 같음) */
export function importDiff(
  entries: readonly ItemJson[],
  current: ReadonlyMap<string, ItemJson>,
): { readonly added: string[]; readonly changed: string[]; readonly same: string[] } {
  const added: string[] = [];
  const changed: string[] = [];
  const same: string[] = [];
  for (const entry of entries) {
    const base = current.get(entry.id);
    if (!base) added.push(entry.id);
    else if (stable(base) === stable(entry)) same.push(entry.id);
    else changed.push(entry.id);
  }
  return { added, changed, same };
}

/** 키 차례와 상관없는 JSON 글(같은 내용이면 같다) */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item) ? Object.fromEntries(Object.entries(item).toSorted(([a], [b]) => (a < b ? -1 : 1))) : item,
  );
}
