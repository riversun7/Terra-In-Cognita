// 채집 오브젝트 편집기 자료(순수) — 기획 D-552(사용자 "오브젝트마다 3d 모델 및 티어범위, 해당오브젝트 출현 2차맵 지형등을 관리하는 에디터페이지
// 만들어라"), docs/adr/2026-11-15-gather-object-tiers.md 7절. 팩 원본 항목(gather_objects, 행성 편집기 정의 조회의 JSON 그대로)을 오브젝트마다
// 고치고 바뀐 항목만 `terra-tuning-diff` 차이(entries, 분류 gather_objects)로 내보낸다(`pnpm tuning:apply`가 팩에 넣는다).
// - 원자재 종류(사다리) = 대표 아이템(item)의 중분류. 티어 범위가 없으면 대표 아이템 티어 하나(서버 objectYield.ts objectRollOf와 같다).
// - 굴림표(table) 오브젝트는 티어 범위·대표 아이템을 고치지 않는다(굴림표 안 아이템이라야 한다 — 팩 검사).
// - 나오는 2차맵 지형: site = 바이옴마다 묶음 천분율(chancePm 1~1000), school = 바이옴마다 어군 수(count 1~32), plot·outcrop·site = 지표,
//   rock·outcrop = 묶음 천분율(chancePm). prop은 소품 그림(arts — 그 그림이 선 칸에 선다)이 곧 자리다.
// - 미리 보기: 유효 스탯 하나에서 확률표(표 하나) → 범위로 자름 → 그 티어에 대표 아이템이 있으면 대표, 아니면 그 티어 켜진 아이템 고르게(없으면
//   더 낮은 티어) — @terra/sim rollGatherOutputs와 같은 셈을 확률로. 맡는 시설이 선택 방식(농장·목장)이면 해금 티어를 쓰는데, 이 화면은 시설
//   방식을 모르므로 추첨으로 보인다(질문 1565 메모).
// 판정 코드가 아니다(화면 미리 보기) — 그래도 정수 연산만 쓴다.
import { MAP_PROP_ARTS, type MapPropArt, isUsableMapPropArt } from "@terra/shared";
import { hashEntry, sortKeys } from "../terrainObjects/terrainObjectsModel.ts";

export type JsonEntry = Readonly<Record<string, unknown>>;
export type GatherSource = "prop" | "rock" | "plot" | "outcrop" | "site" | "school";

/** 티어 끝(T0 ~ T9, 팩 스키마 gatherObjects tierRange와 같다) */
export const TIER_MIN = 0;
export const TIER_MAX = 9;
/** 양(lots) 범위(팩 스키마와 같다) */
export const LOTS_RANGE = { min: 1, max: 100 } as const;
/** 천분율·어군 수 범위(팩 스키마와 같다) */
export const CHANCE_RANGE = { min: 1, max: 1000 } as const;
export const COUNT_RANGE = { min: 1, max: 32 } as const;

/** 2차맵 지형 칸 지표 이름(@terra/content GATHER_PLOT_SURFACES와 같은 차례 — 게임 앱은 그 패키지를 가져오지 않아 옮겨 적는다) */
export const SURFACES = [
  "water",
  "grass",
  "dirt",
  "rock",
  "sand",
  "gravel",
  "snow",
  "ice",
  "mud",
  "ash",
  "shallow_water",
] as const;
export type SurfaceName = (typeof SURFACES)[number];

/** 고를 수 있는 소품 그림(3D 모델) 이름 */
export const MODEL_ARTS: readonly MapPropArt[] = MAP_PROP_ARTS.filter(isUsableMapPropArt);

export interface LocalName {
  readonly ko: string;
  readonly en: string;
}

/** 편집기 참고 자료(서버 planetEditor.definitions gatherRefs) */
export interface GatherRefs {
  readonly items: readonly {
    readonly id: string;
    readonly name: LocalName;
    readonly subcategory: string;
    readonly tier: number;
    readonly enabled: boolean;
  }[];
  readonly subcategories: readonly { readonly id: string; readonly name: LocalName }[];
  readonly bands: readonly { readonly from: number; readonly weightsPm: readonly number[] }[];
}

export interface TierRange {
  readonly min: number;
  readonly max: number;
}

/** 목록 줄 하나 */
export interface ObjectRow {
  readonly id: string;
  readonly name: LocalName;
  readonly source: GatherSource;
  readonly item: string;
  /** 대표 아이템 티어(모르면 0) */
  readonly itemTier: number;
  /** 원자재 종류(대표 아이템 중분류, 모르면 빈 글) */
  readonly subcategory: string;
  /** 실효 티어 범위(칸이 없으면 대표 아이템 티어 하나). 굴림표 오브젝트는 null */
  readonly range: TierRange | null;
  /** 범위 칸이 팩 항목에 있나 */
  readonly rangeSet: boolean;
  readonly lots: number;
  readonly table: boolean;
  /** 3D 모델(소품 그림 이름들 — prop은 arts, outcrop·site·school은 art 하나, rock은 없음) */
  readonly models: readonly string[];
  /** 나오는 2차맵 지형 수(바이옴 줄 수 — site·school만, 그 밖은 0) */
  readonly biomeCount: number;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const SOURCES: readonly GatherSource[] = ["prop", "rock", "plot", "outcrop", "site", "school"];

export function sourceOf(entry: JsonEntry): GatherSource {
  const source = entry.source;
  return SOURCES.find((value) => value === source) ?? "prop";
}

function nameOf(entry: JsonEntry): LocalName {
  const name = entry.name;
  const id = typeof entry.id === "string" ? entry.id : "";
  if (!isRecord(name)) return { ko: id, en: id };
  return {
    ko: typeof name.ko === "string" ? name.ko : id,
    en: typeof name.en === "string" ? name.en : id,
  };
}

const clampTier = (value: number): number => Math.min(TIER_MAX, Math.max(TIER_MIN, Math.round(value)));
const clampTo = (value: number, range: { readonly min: number; readonly max: number }): number =>
  Math.min(range.max, Math.max(range.min, Math.round(value)));

/** 항목의 3D 모델 이름들 */
export function modelsOf(entry: JsonEntry): string[] {
  const source = sourceOf(entry);
  if (source === "prop")
    return Array.isArray(entry.arts) ? entry.arts.filter((art) => typeof art === "string") : [];
  if (source === "rock") return [];
  return typeof entry.art === "string" ? [entry.art] : [];
}

/** 바이옴 줄(site: chancePm, school: count). 그 밖은 빈 목록 */
export function biomesOf(entry: JsonEntry): { biome: string; amount: number }[] {
  const source = sourceOf(entry);
  if ((source !== "site" && source !== "school") || !Array.isArray(entry.biomes)) return [];
  const key = source === "school" ? "count" : "chancePm";
  const rows: readonly unknown[] = entry.biomes;
  const out: { biome: string; amount: number }[] = [];
  for (const row of rows)
    if (isRecord(row) && typeof row.biome === "string" && typeof row[key] === "number")
      out.push({ biome: row.biome, amount: row[key] });
  return out;
}

/** 지표 목록(plot·outcrop·site). 그 밖은 빈 목록 */
export function surfacesOf(entry: JsonEntry): string[] {
  const source = sourceOf(entry);
  if ((source !== "plot" && source !== "outcrop" && source !== "site") || !Array.isArray(entry.surfaces))
    return [];
  return entry.surfaces.filter((surface) => typeof surface === "string");
}

/** 대표 아이템 참고 줄(없으면 undefined) */
function refItem(refs: GatherRefs, id: string) {
  return refs.items.find((item) => item.id === id);
}

/** 실효 티어 범위(굴림표면 null, 칸이 없으면 대표 아이템 티어 하나) */
export function effectiveRange(entry: JsonEntry, refs: GatherRefs): TierRange | null {
  if (Array.isArray(entry.table)) return null;
  const range = entry.tierRange;
  if (isRecord(range) && typeof range.min === "number" && typeof range.max === "number")
    return { min: range.min, max: range.max };
  const tier = clampTier(refItem(refs, typeof entry.item === "string" ? entry.item : "")?.tier ?? 0);
  return { min: tier, max: tier };
}

export function objectRows(entries: readonly JsonEntry[], refs: GatherRefs): ObjectRow[] {
  return entries.map((entry) => {
    const item = typeof entry.item === "string" ? entry.item : "";
    const ref = refItem(refs, item);
    return {
      id: typeof entry.id === "string" ? entry.id : "",
      name: nameOf(entry),
      source: sourceOf(entry),
      item,
      itemTier: ref?.tier ?? 0,
      subcategory: ref?.subcategory ?? "",
      range: effectiveRange(entry, refs),
      rangeSet: isRecord(entry.tierRange),
      lots: typeof entry.lots === "number" ? entry.lots : 1,
      table: Array.isArray(entry.table),
      models: modelsOf(entry),
      biomeCount: biomesOf(entry).length,
    };
  });
}

/** 항목 하나를 바꾼다(id가 같은 것만) */
function mapEntry(
  entries: readonly JsonEntry[],
  id: string,
  change: (entry: JsonEntry) => JsonEntry,
): JsonEntry[] {
  return entries.map((entry) => (entry.id === id ? change(entry) : entry));
}

/** 티어 범위 한 끝을 고친다(다른 끝을 밀어 아래 ≤ 위). 칸이 없으면 실효 범위에서 시작한다. 굴림표 오브젝트는 그대로 */
export function setTierRange(
  entries: readonly JsonEntry[],
  refs: GatherRefs,
  id: string,
  edge: "min" | "max",
  value: number,
): JsonEntry[] {
  return mapEntry(entries, id, (entry) => {
    const range = effectiveRange(entry, refs);
    if (!range) return entry;
    const tier = clampTier(value);
    const next =
      edge === "min"
        ? { min: tier, max: Math.max(tier, range.max) }
        : { min: Math.min(tier, range.min), max: tier };
    return { ...entry, tierRange: next };
  });
}

/** 양(한 번 캘 때 묶음 수) */
export function setLots(entries: readonly JsonEntry[], id: string, lots: number): JsonEntry[] {
  return mapEntry(entries, id, (entry) => ({ ...entry, lots: clampTo(lots, LOTS_RANGE) }));
}

/** 대표 아이템(= 원자재 종류). 굴림표 오브젝트는 그대로 */
export function setItem(entries: readonly JsonEntry[], id: string, item: string): JsonEntry[] {
  return mapEntry(entries, id, (entry) => (Array.isArray(entry.table) ? entry : { ...entry, item }));
}

/**
 * 3D 모델: prop은 그림을 켜고 끈다(하나는 남긴다), outcrop·site·school은 그림 하나를 바꾼다. rock은 그대로(바위 지표에 선다)
 */
export function toggleModel(entries: readonly JsonEntry[], id: string, art: string): JsonEntry[] {
  return mapEntry(entries, id, (entry) => {
    const source = sourceOf(entry);
    if (source === "rock") return entry;
    if (source !== "prop") return { ...entry, art };
    const arts = modelsOf(entry);
    if (!arts.includes(art)) return { ...entry, arts: [...arts, art] };
    if (arts.length <= 1) return entry;
    return { ...entry, arts: arts.filter((name) => name !== art) };
  });
}

/** 나오는 바이옴 양(site 천분율·school 어군 수). null이면 그 바이옴을 뺀다(하나는 남긴다) */
export function setBiome(
  entries: readonly JsonEntry[],
  id: string,
  biome: string,
  amount: number | null,
): JsonEntry[] {
  return mapEntry(entries, id, (entry) => {
    const source = sourceOf(entry);
    if (source !== "site" && source !== "school") return entry;
    const key = source === "school" ? "count" : "chancePm";
    const limit = source === "school" ? COUNT_RANGE : CHANCE_RANGE;
    const rows = biomesOf(entry);
    const at = rows.findIndex((row) => row.biome === biome);
    let next = rows;
    if (amount === null) {
      if (at < 0 || rows.length <= 1) return entry;
      next = rows.filter((row) => row.biome !== biome);
    } else if (at < 0) next = [...rows, { biome, amount: clampTo(amount, limit) }];
    else next = rows.map((row) => (row.biome === biome ? { biome, amount: clampTo(amount, limit) } : row));
    return { ...entry, biomes: next.map((row) => ({ biome: row.biome, [key]: row.amount })) };
  });
}

/** 지표를 켜고 끈다(하나는 남긴다, 지표 차례로) */
export function toggleSurface(entries: readonly JsonEntry[], id: string, surface: SurfaceName): JsonEntry[] {
  return mapEntry(entries, id, (entry) => {
    const source = sourceOf(entry);
    if (source !== "plot" && source !== "outcrop" && source !== "site") return entry;
    const current = surfacesOf(entry);
    const has = current.includes(surface);
    if (has && current.length <= 1) return entry;
    const next = SURFACES.filter((name) => (name === surface ? !has : current.includes(name)));
    return { ...entry, surfaces: next };
  });
}

/** 묶음 천분율(rock·outcrop) */
export function setChance(entries: readonly JsonEntry[], id: string, chancePm: number): JsonEntry[] {
  return mapEntry(entries, id, (entry) => {
    const source = sourceOf(entry);
    if (source !== "rock" && source !== "outcrop") return entry;
    return { ...entry, chancePm: clampTo(chancePm, CHANCE_RANGE) };
  });
}

/** 미리 보기 한 줄: 나오는 아이템·티어·확률(‰, 소수 한 자리는 화면이 낸다 — 여기는 ‰ × 1000 정수) */
export interface ChanceRow {
  readonly item: string;
  readonly tier: number;
  /** 백만분율(‰ × 1000) — 같은 티어 아이템 셋이면 1/3씩을 정수로 */
  readonly ppm: number;
}

/** 유효 스탯이 드는 구간(from이 스탯 이하인 마지막, 첫 구간보다 작으면 첫 구간) */
function bandAt(refs: GatherRefs, stat: number): readonly number[] {
  let found = refs.bands[0]?.weightsPm ?? [1000];
  for (const band of refs.bands) if (band.from <= stat) found = band.weightsPm;
  return found;
}

/**
 * 유효 스탯 하나의 나오는 아이템 확률(머리 주석). 굴림표면 표의 가중치. 아이템이 하나도 없으면 빈 목록. 확률이 큰 차례(같으면 티어·ID)
 */
export function chancePreview(entry: JsonEntry, refs: GatherRefs, stat: number): ChanceRow[] {
  const out = new Map<string, { tier: number; ppm: number }>();
  if (Array.isArray(entry.table)) {
    const rows: readonly unknown[] = entry.table;
    for (const row of rows)
      if (isRecord(row) && typeof row.item === "string" && typeof row.weightPm === "number")
        out.set(row.item, { tier: refItem(refs, row.item)?.tier ?? 0, ppm: row.weightPm * 1000 });
  } else {
    const item = typeof entry.item === "string" ? entry.item : "";
    const ref = refItem(refs, item);
    const range = effectiveRange(entry, refs) ?? { min: 0, max: 0 };
    // 사다리: 대표 아이템 중분류의 켜진 아이템(대표 아이템은 꺼져 있어도 그 티어에 든다 — 서버와 같다)
    const ladder: string[][] = Array.from({ length: TIER_MAX + 1 }, () => []);
    for (const candidate of refs.items)
      if (candidate.subcategory === ref?.subcategory && candidate.enabled)
        ladder[clampTier(candidate.tier)]?.push(candidate.id);
    const own = clampTier(ref?.tier ?? 0);
    if (!ladder[own]?.includes(item)) ladder[own]?.push(item);
    const weights = bandAt(refs, stat);
    let total = 0;
    for (const weight of weights) total += Math.max(0, weight);
    if (total <= 0) return [];
    weights.forEach((weight, rolled) => {
      if (weight <= 0) return;
      const tier = Math.min(Math.max(rolled, range.min), range.max);
      for (let t = tier; t >= 0; t--) {
        const choices = ladder[t] ?? [];
        if (choices.length === 0) continue;
        const picks = choices.includes(item) ? [item] : choices;
        const share = Math.floor((weight * 1_000_000) / total / picks.length);
        for (const pick of picks) {
          const before = out.get(pick);
          out.set(pick, { tier: t, ppm: (before?.ppm ?? 0) + share });
        }
        break;
      }
    });
  }
  return [...out]
    .map(([item, value]) => ({ item, tier: value.tier, ppm: value.ppm }))
    .toSorted((a, b) => b.ppm - a.ppm || a.tier - b.tier || a.item.localeCompare(b.item));
}

/** 바뀐 항목(팩 원본과 정규 JSON이 다른 것) */
export function changedEntries(
  original: readonly JsonEntry[],
  edited: readonly JsonEntry[],
): { readonly id: string; readonly before: JsonEntry; readonly entry: JsonEntry }[] {
  const before = new Map(original.map((entry) => [entry.id, entry]));
  const out: { id: string; before: JsonEntry; entry: JsonEntry }[] = [];
  for (const entry of edited) {
    const old = before.get(entry.id);
    if (!old || typeof entry.id !== "string") continue;
    if (JSON.stringify(sortKeys(old)) !== JSON.stringify(sortKeys(entry)))
      out.push({ id: entry.id, before: old, entry });
  }
  return out;
}

/** 내보낼 차이(`terra-tuning-diff` 형식 1판, entries만 — 분류 gather_objects) */
export async function buildDiff(
  original: readonly JsonEntry[],
  edited: readonly JsonEntry[],
  contentVersion: string,
  exportedAt: string,
): Promise<Record<string, unknown>> {
  const changes = changedEntries(original, edited);
  const entries = await Promise.all(
    changes.map(async (change) => ({
      category: "gather_objects",
      id: change.id,
      from: await hashEntry(change.before),
      entry: change.entry,
    })),
  );
  return {
    format: "terra-tuning-diff",
    formatVersion: 1,
    exportedAt,
    packId: contentVersion.split("@")[0] ?? "core",
    contentVersion,
    contentHash: "",
    changes: [],
    entries,
  };
}

/** 원자재 아이템을 중분류마다 묶는다(대표 아이템 고르기 — 중분류 차례, 안에서는 티어·ID 차례) */
export function itemGroups(
  refs: GatherRefs,
): { subcategory: string; name: LocalName; items: GatherRefs["items"] }[] {
  return refs.subcategories
    .map((sub) => ({
      subcategory: sub.id,
      name: sub.name,
      items: refs.items
        .filter((item) => item.subcategory === sub.id)
        .toSorted((a, b) => a.tier - b.tier || a.id.localeCompare(b.id)),
    }))
    .filter((group) => group.items.length > 0);
}
