// 지형 오브젝트 편집기 자료(순수) — 기획 D-536("각각의 지형에는 최소 5가지 이상의 2차맵 오브젝트"), D-398(콘텐츠 양은 개발자 페이지에서).
// 팩 원본 항목(map_props·gather_objects, 행성 편집기 정의 조회의 JSON 그대로)에서 지형(바이옴)마다 오브젝트 줄을 만들고, 양을 고치거나
// 지형에 더하고 빼고, 바뀐 항목만 `terra-tuning-diff` 차이(entries)로 내보낸다(`pnpm tuning:apply`가 팩에 넣는다).
// - 양: map_props = 바이옴 비중(배치 칸 천분율, weight 1 ~ 1000), gather_objects site = 묶음 천분율(chancePm 1 ~ 1000),
//   school = 2차맵 하나의 어군 수(count 1 ~ 32).
// - 느림 배율(map_props slowPm, 기획 D-540 질문 1223 나): 지나갈 수 있는 마른 칸 흩기 소품(엄폐 0·1)에 둔다. 1001 ~ 5000‰, 비우면 없음.
//   있으면 줄 종류가 "느려짐"이다. 모든 지형에 같이 든다(바이옴마다가 아니라 항목 칸).
// - 공통 채집 오브젝트(prop·rock·plot·outcrop)는 바이옴 표가 없어(소품 그림·지표·광석 몫을 따른다) 이 화면에서 고치지 않는다.
// - from = 팩 항목 정규 JSON(키 차례 정렬)의 SHA-256(@terra/content/node hashEntry와 같은 셈) — 적용 스크립트가 팩이 그 사이 바뀌었는지 본다.

export type TerrainCategory = "map_props" | "gather_objects";
/** 줄 종류: 장식(엄폐 0)·느려짐 소품(느림 배율이 있는 것)·판정 소품(엄폐 1·2·숲)·물 위 소품·지형별 채집 자리·움직이는 어군 */
export type TerrainRowKind = "decor" | "slow" | "cover" | "water" | "site" | "school";

/** 느림 배율 범위(천분율, 팩 스키마 packages/content mapProps slowPm과 같다) */
export const SLOW_RANGE = { min: 1001, max: 5000 } as const;

export type JsonEntry = Readonly<Record<string, unknown>>;

export interface TerrainEntries {
  readonly mapProps: readonly JsonEntry[];
  readonly gatherObjects: readonly JsonEntry[];
}

export interface TerrainRow {
  readonly category: TerrainCategory;
  readonly id: string;
  readonly kind: TerrainRowKind;
  readonly name: { readonly ko: string; readonly en: string };
  readonly art: string;
  /** 이 지형의 양(비중·천분율·어군 수) */
  readonly amount: number;
  /** 느림 배율(천분율). 없으면 null */
  readonly slowPm: number | null;
  /** 느림 배율을 둘 수 있는 항목인가(마른 칸 흩기 소품, 엄폐 0·1) */
  readonly slowEditable: boolean;
}

/** 양 범위(분류·종류마다) */
export function amountRange(kind: TerrainRowKind): { readonly min: number; readonly max: number } {
  return kind === "school" ? { min: 1, max: 32 } : { min: 1, max: 1000 };
}

/** 양 칸 이름(바이옴 줄의 키) */
function amountKey(category: TerrainCategory, source: unknown): "weight" | "chancePm" | "count" {
  if (category === "map_props") return "weight";
  return source === "school" ? "count" : "chancePm";
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function nameOf(entry: JsonEntry): { ko: string; en: string } {
  const name = entry.name;
  if (isRecord(name) && typeof name.ko === "string" && typeof name.en === "string")
    return { ko: name.ko, en: name.en };
  const id = typeof entry.id === "string" ? entry.id : "?";
  return { ko: id, en: id };
}

function biomeList(entry: JsonEntry): readonly Readonly<Record<string, unknown>>[] {
  const list = entry.biomes;
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

/** 항목이 이 화면에서 지형마다 고칠 수 있는 것인가(바이옴 표가 있는 것) */
export function editable(category: TerrainCategory, entry: JsonEntry): boolean {
  if (category === "map_props") return true;
  return entry.source === "site" || entry.source === "school";
}

/** 느림 배율을 둘 수 있는 항목(팩 스키마와 같은 조건: 흩기·물 아님·엄폐 0·1) */
function slowEditableOf(category: TerrainCategory, entry: JsonEntry): boolean {
  return (
    category === "map_props" &&
    entry.placement === "scatter" &&
    entry.water !== true &&
    (entry.cover === 0 || entry.cover === 1)
  );
}

function slowOf(entry: JsonEntry): number | null {
  return typeof entry.slowPm === "number" ? entry.slowPm : null;
}

function rowKind(category: TerrainCategory, entry: JsonEntry): TerrainRowKind {
  if (category === "gather_objects") return entry.source === "school" ? "school" : "site";
  if (entry.water === true) return "water";
  if (slowEditableOf(category, entry) && slowOf(entry) !== null) return "slow";
  if (entry.placement === "forest" || (typeof entry.cover === "number" && entry.cover > 0)) return "cover";
  return "decor";
}

function rowOf(category: TerrainCategory, entry: JsonEntry, amount: number): TerrainRow {
  return {
    category,
    id: typeof entry.id === "string" ? entry.id : "",
    kind: rowKind(category, entry),
    name: nameOf(entry),
    art: typeof entry.art === "string" ? entry.art : "",
    amount,
    slowPm: slowEditableOf(category, entry) ? slowOf(entry) : null,
    slowEditable: slowEditableOf(category, entry),
  };
}

/** 그 지형(바이옴 ID)의 양(없으면 null) */
export function amountOf(category: TerrainCategory, entry: JsonEntry, biome: string): number | null {
  const key = amountKey(category, entry.source);
  for (const item of biomeList(entry)) {
    if (item.biome === biome && typeof item[key] === "number") return item[key];
  }
  return null;
}

/** 그 지형의 오브젝트 줄(팩 차례: 소품 규칙 → 채집 오브젝트) */
export function terrainRows(entries: TerrainEntries, biome: string): TerrainRow[] {
  const out: TerrainRow[] = [];
  for (const [category, list] of [
    ["map_props", entries.mapProps],
    ["gather_objects", entries.gatherObjects],
  ] as const) {
    for (const entry of list) {
      if (!editable(category, entry)) continue;
      const amount = amountOf(category, entry, biome);
      if (amount !== null) out.push(rowOf(category, entry, amount));
    }
  }
  return out;
}

/** 그 지형에 더할 수 있는 항목(아직 그 지형에 없는 것) */
export function addableRows(entries: TerrainEntries, biome: string): TerrainRow[] {
  const out: TerrainRow[] = [];
  for (const [category, list] of [
    ["map_props", entries.mapProps],
    ["gather_objects", entries.gatherObjects],
  ] as const) {
    for (const entry of list) {
      if (!editable(category, entry) || amountOf(category, entry, biome) !== null) continue;
      out.push(rowOf(category, entry, 0));
    }
  }
  return out;
}

/** 지형마다 오브젝트 종류 수(이 화면에서 고치는 것 + 공통 채집 오브젝트는 따로 세지 않는다) */
export function kindCounts(entries: TerrainEntries, biomes: readonly string[]): Map<string, number> {
  return new Map(biomes.map((biome) => [biome, terrainRows(entries, biome).length]));
}

/**
 * 양을 바꾼다: amount가 null이면 그 지형을 뺀다(마지막 지형은 빼지 않는다 — 스키마가 바이옴 하나 이상을 요구), 없던 지형이면 끝에 더한다.
 * 범위 밖이면 범위 안으로 자른다. 바뀐 새 목록을 돌려준다(입력은 그대로)
 */
export function setAmount(
  entries: TerrainEntries,
  category: TerrainCategory,
  id: string,
  biome: string,
  amount: number | null,
): TerrainEntries {
  const key = category === "map_props" ? "mapProps" : "gatherObjects";
  const list = entries[key].map((entry) => {
    if (entry.id !== id || !editable(category, entry)) return entry;
    const field = amountKey(category, entry.source);
    const range = amountRange(rowKind(category, entry));
    const biomes = biomeList(entry);
    const at = biomes.findIndex((item) => item.biome === biome);
    if (amount === null) {
      if (at < 0 || biomes.length <= 1) return entry;
      return { ...entry, biomes: biomes.filter((_, index) => index !== at) };
    }
    const value = Math.min(range.max, Math.max(range.min, Math.round(amount)));
    const next =
      at < 0
        ? [...biomes, { biome, [field]: value }]
        : biomes.map((item, index) => (index === at ? { ...item, [field]: value } : item));
    return { ...entry, biomes: next };
  });
  return { ...entries, [key]: list };
}

/**
 * 느림 배율을 바꾼다(map_props 마른 칸 흩기 소품만): null이거나 1000 이하면 칸을 지운다(느려지지 않음), 그 밖은 범위 안으로 자른다.
 * 바뀐 새 목록을 돌려준다(입력은 그대로)
 */
export function setSlow(entries: TerrainEntries, id: string, slowPm: number | null): TerrainEntries {
  const mapProps = entries.mapProps.map((entry) => {
    if (entry.id !== id || !slowEditableOf("map_props", entry)) return entry;
    if (slowPm === null || slowPm <= 1000) {
      const { slowPm: _removed, ...rest } = entry;
      return rest;
    }
    return { ...entry, slowPm: Math.min(SLOW_RANGE.max, Math.max(SLOW_RANGE.min, Math.round(slowPm))) };
  });
  return { ...entries, mapProps };
}

/** 키 차례를 정렬한 값(정규 JSON — @terra/content/node hashEntry와 같은 셈) */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).toSorted()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

/** 바뀐 항목(팩 원본과 정규 JSON이 다른 것) */
export function changedEntries(
  original: TerrainEntries,
  edited: TerrainEntries,
): {
  readonly category: TerrainCategory;
  readonly id: string;
  readonly before: JsonEntry;
  readonly entry: JsonEntry;
}[] {
  const out: { category: TerrainCategory; id: string; before: JsonEntry; entry: JsonEntry }[] = [];
  for (const [category, key] of [
    ["map_props", "mapProps"],
    ["gather_objects", "gatherObjects"],
  ] as const) {
    const before = new Map(original[key].map((entry) => [entry.id, entry]));
    for (const entry of edited[key]) {
      const old = before.get(entry.id);
      if (!old || typeof entry.id !== "string") continue;
      if (JSON.stringify(sortKeys(old)) !== JSON.stringify(sortKeys(entry)))
        out.push({ category, id: entry.id, before: old, entry });
    }
  }
  return out;
}

/** 항목 정규 JSON의 SHA-256(16진수 64자) */
export async function hashEntry(entry: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(sortKeys(entry)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 내보낼 차이(`terra-tuning-diff` 형식 1판, entries만) */
export async function buildDiff(
  original: TerrainEntries,
  edited: TerrainEntries,
  contentVersion: string,
  exportedAt: string,
): Promise<Record<string, unknown>> {
  const changes = changedEntries(original, edited);
  const entries = await Promise.all(
    changes.map(async (change) => ({
      category: change.category,
      id: change.id,
      from: await hashEntry(change.before),
      entry: change.entry,
    })),
  );
  const packId = contentVersion.split("@")[0] ?? "core";
  return {
    format: "terra-tuning-diff",
    formatVersion: 1,
    exportedAt,
    packId,
    contentVersion,
    contentHash: "",
    changes: [],
    entries,
  };
}
