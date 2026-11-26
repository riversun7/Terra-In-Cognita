// 건물 편집기 모델 — 담은 변경(시설마다 put·revert, 잠든 줄 버리기), 시설 칸 고치기(레벨 구간·재료·채집), 레벨 표 셈(@terra/shared
// facilityBuild 하나: 재료·시간. 화폐 유지비는 없다 — D-171·49 N50). 계산이 없는 순수 함수만 둔다(시험: buildingModel.test.ts). docs/adr/2026-11-02-building-editor.md
import {
  type BuildLevelJson,
  type BuildStackJson,
  type BuildingEditorChange,
  type BuildingEditorItem,
  type BuildingEditorSubcategory,
  FACILITY_BUILD_LIMITS,
  FACILITY_LEVEL_MAX,
  FACILITY_REPAIR_LIMITS,
  type FacilityBuildJson,
  type FacilityBuildRules,
  type FacilityGatherJson,
  type FacilityJson,
  type FacilityLookJson,
  type FacilityRepairJson,
  buildCostAt,
  buildLevelAt,
  buildTimeAt,
  cleanFacilityLook,
} from "@terra/shared/buildingEditor";
import { type BulkOp, bulkApply, pickedByColumn } from "../content/contentEditorNumeric.ts";

/** 시설 하나의 담은 변경: 고친 항목 통째 또는 팩 값으로 되돌리기. base·baseHash = 고치기 시작할 때의 실효 항목·해시 */
export type StagedFacility =
  | {
      readonly op: "put";
      readonly entry: FacilityJson;
      readonly base: FacilityJson;
      readonly baseHash: string;
    }
  | { readonly op: "revert"; readonly base: FacilityJson; readonly baseHash: string };

export interface BuildingStage {
  readonly facilities: ReadonlyMap<string, StagedFacility>;
  /** 버릴 잠든 줄(시설 ID) */
  readonly discard: ReadonlySet<string>;
}

export const EMPTY_STAGE: BuildingStage = {
  facilities: new Map(),
  discard: new Set(),
};

/** 시설 하나의 담음을 바꾼다(null = 뺀다) */
export function stageFacility(stage: BuildingStage, id: string, next: StagedFacility | null): BuildingStage {
  const facilities = new Map(stage.facilities);
  if (next === null) facilities.delete(id);
  else facilities.set(id, next);
  return { ...stage, facilities };
}

/** 잠든 줄 버리기를 담거나 뺀다 */
export function stageDiscard(stage: BuildingStage, id: string, on: boolean): BuildingStage {
  const discard = new Set(stage.discard);
  if (on) discard.add(id);
  else discard.delete(id);
  return { ...stage, discard };
}

/** 담은 키(시설 ID, 버릴 잠든 줄은 "sleeping/<ID>"). 1차 생산 티어 확률표는 따로 화면(/dev/gather-tiers, 2026-11-09) */
export function stageKeys(stage: BuildingStage): string[] {
  return [...stage.facilities.keys(), ...[...stage.discard].map((id) => `sleeping/${id}`)];
}

/** 담은 변경 → 서버 묶음 */
export function changesOf(stage: BuildingStage): BuildingEditorChange[] {
  const changes: BuildingEditorChange[] = [];
  for (const [id, staged] of stage.facilities) {
    if (staged.op === "put") changes.push({ op: "put", entry: staged.entry, baseHash: staged.baseHash });
    else changes.push({ op: "revert", id, baseHash: staged.baseHash });
  }
  for (const id of stage.discard) changes.push({ op: "discard_sleeping", id, category: "facilities" });
  return changes;
}

/** 시설의 최고 레벨(없으면 5) */
export const maxLevelOf = (entry: FacilityJson): number => entry.maxLevel ?? FACILITY_LEVEL_MAX;

/** 채집 칸에서 undefined 선택 칸을 뺀다(팩 줄 차례) */
function cleanGather(gather: FacilityGatherJson): FacilityGatherJson {
  return {
    primary: gather.primary,
    secondary: gather.secondary,
    subcategory: gather.subcategory,
    ...(gather.extraSubcategories === undefined || gather.extraSubcategories.length === 0
      ? {}
      : { extraSubcategories: [...gather.extraSubcategories] }),
    ...(gather.mode === undefined ? {} : { mode: gather.mode }),
    ...(gather.yieldBase === undefined ? {} : { yieldBase: gather.yieldBase }),
    ...(gather.yieldPerStatPm === undefined ? {} : { yieldPerStatPm: gather.yieldPerStatPm }),
    ...(gather.yieldCap === undefined ? {} : { yieldCap: gather.yieldCap }),
    ...(gather.catch === undefined
      ? {}
      : {
          catch: {
            basePm: gather.catch.basePm,
            maxPm: gather.catch.maxPm,
            statPm: gather.catch.statPm,
            fullStat: gather.catch.fullStat,
          },
        }),
  };
}

/** 선택 칸 중 undefined인 것을 뺀 JSON(팩 줄과 같은 칸 차례로 견주고 보낸다 — 내보내기가 팩 파일에 그대로 들어간다) */
export function cleanFacility(entry: FacilityJson): FacilityJson {
  const look = cleanFacilityLook(entry.look);
  return {
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    stage: entry.stage,
    // 시설 분류(기획 D-560 — 팩 칸 차례: stage 다음)
    ...(entry.category === undefined ? {} : { category: entry.category }),
    ...(entry.maxLevel === undefined ? {} : { maxLevel: entry.maxLevel }),
    slotsPerLevel: entry.slotsPerLevel,
    ...(entry.pollution === undefined ? {} : { pollution: entry.pollution }),
    ...(entry.restRecoveryPm === undefined ? {} : { restRecoveryPm: entry.restRecoveryPm }),
    // 건물 런타임 칸(docs/adr/2026-11-07-buildings-runtime.md): 빼면 다른 칸만 고쳐도 덮어쓰기가 이 칸을 지운다
    ...(entry.footprint === undefined
      ? {}
      : { footprint: { width: entry.footprint.width, height: entry.footprint.height } }),
    ...(entry.needsWaterWithin === undefined ? {} : { needsWaterWithin: entry.needsWaterWithin }),
    ...(entry.durability === undefined ? {} : { durability: entry.durability }),
    ...(entry.storageKg === undefined ? {} : { storageKg: entry.storageKg }),
    ...(entry.gather === undefined ? {} : { gather: cleanGather(entry.gather) }),
    ...(entry.build === undefined ? {} : { build: entry.build }),
    ...(entry.repair === undefined ? {} : { repair: entry.repair }),
    // 배 시설 칸(docs/adr/2026-11-15-shipyard-harbor.md): 편집기가 고치지 않지만 빼면 다른 칸만 고쳐도 덮어쓰기가 이 칸을 지운다
    ...(entry.harbor === undefined ? {} : { harbor: entry.harbor }),
    // 거래소 종류(docs/adr/2026-11-16-exchange-buildings.md): 같은 까닭으로 그대로 돌려보낸다
    ...(entry.exchange === undefined ? {} : { exchange: entry.exchange }),
    // 물류센터(docs/adr/2026-11-16-logistics-center.md): 같은 까닭으로 그대로 돌려보낸다
    ...(entry.logistics === true ? { logistics: true as const } : {}),
    ...(entry.boats === undefined ? {} : { boats: entry.boats }),
    // 2차맵 겉모습(빈 칸을 빼고, 칸이 하나도 없으면 칸째 뺀다 — docs/adr/2026-11-08-building-art.md "바뀜 (2026-11-09)")
    ...(look === undefined ? {} : { look }),
  };
}

/** 겉모습 칸 하나를 바꾼다(undefined = 그 칸을 뺀다 — 모델 기본 값) */
export function setLook<K extends keyof FacilityLookJson>(
  entry: FacilityJson,
  key: K,
  value: FacilityLookJson[K],
): FacilityJson {
  const next = cleanFacilityLook({ ...entry.look, [key]: value });
  const { look: _old, ...rest } = entry;
  return next === undefined ? rest : { ...rest, look: next };
}

/** 칸 값이 같은가(칸 안 키 차례는 편집기가 늘 같은 차례로 만든다) */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * 3방향 합치기(entry_changed 뒤 다시 얹기): base = 내가 고치기 시작한 항목, mine = 내 초안, theirs = 지금 서버 항목. 칸마다 내가 바꾼
 * 칸만 theirs 위에 얹는다(이름·건설·채집·수리 칸은 통째). 양쪽이 같은 칸을 다르게 바꿨으면 내 값을 넣고 칸 이름을 알린다
 */
export function mergeFacility(
  base: FacilityJson,
  mine: FacilityJson,
  theirs: FacilityJson,
): { entry: FacilityJson; conflicts: string[] } {
  const conflicts: string[] = [];
  const pick = <K extends keyof FacilityJson>(key: K): FacilityJson[K] => {
    if (same(base[key], mine[key])) return theirs[key];
    if (!same(base[key], theirs[key]) && !same(mine[key], theirs[key])) conflicts.push(key);
    return mine[key];
  };
  const entry = cleanFacility({
    id: theirs.id,
    name: pick("name"),
    stage: pick("stage"),
    category: pick("category"),
    maxLevel: pick("maxLevel"),
    slotsPerLevel: pick("slotsPerLevel"),
    pollution: pick("pollution"),
    restRecoveryPm: pick("restRecoveryPm"),
    footprint: pick("footprint"),
    durability: pick("durability"),
    storageKg: pick("storageKg"),
    gather: pick("gather"),
    build: pick("build"),
    repair: pick("repair"),
    look: pick("look"),
  });
  return { entry, conflicts };
}

const withBuild = (entry: FacilityJson, build: FacilityBuildJson): FacilityJson => ({ ...entry, build });

const replaceAt = <T>(list: readonly T[], index: number, value: T): T[] =>
  list.map((item, at) => (at === index ? value : item));

/** 구간 하나를 바꾼다 */
export function setBand(entry: FacilityJson, index: number, band: BuildLevelJson): FacilityJson {
  if (!entry.build) return entry;
  return withBuild(entry, { ...entry.build, levels: replaceAt(entry.build.levels, index, band) });
}

/** 다음 구간을 더한다: 앞 구간 다음 레벨부터(최고 레벨 안에서), 재료는 앞 구간을 그대로 복사. 더할 레벨이 없으면 그대로 */
export function addBand(entry: FacilityJson): FacilityJson {
  const build = entry.build;
  if (!build) return entry;
  const last = build.levels.at(-1);
  const from = (last?.from ?? 0) + 1;
  if (from > maxLevelOf(entry) || build.levels.length >= FACILITY_BUILD_LIMITS.levels) return entry;
  const materials = last ? last.materials.map((stack) => ({ ...stack })) : [];
  return withBuild(entry, { ...build, levels: [...build.levels, { from, materials }] });
}

/** 구간을 뺀다(하나 남으면 빼지 않는다) */
export function removeBand(entry: FacilityJson, index: number): FacilityJson {
  const build = entry.build;
  if (!build || build.levels.length <= 1) return entry;
  return withBuild(entry, { ...build, levels: build.levels.filter((_, at) => at !== index) });
}

/** 구간의 재료 한 줄을 바꾼다 */
export function setMaterial(
  entry: FacilityJson,
  bandIndex: number,
  line: number,
  stack: BuildStackJson,
): FacilityJson {
  const band = entry.build?.levels[bandIndex];
  if (!band) return entry;
  return setBand(entry, bandIndex, { ...band, materials: replaceAt(band.materials, line, stack) });
}

/** 구간에 재료 한 줄을 더한다: 그 구간에 아직 없는 첫 아이템(고르기 창 차례), 수량 1 */
export function addMaterial(
  entry: FacilityJson,
  bandIndex: number,
  items: readonly BuildingEditorItem[],
): FacilityJson {
  const band = entry.build?.levels[bandIndex];
  if (!band || band.materials.length >= FACILITY_BUILD_LIMITS.materials) return entry;
  const used = new Set(band.materials.map((stack) => stack.item));
  const item = items.find((option) => !used.has(option.id));
  if (!item) return entry;
  return setBand(entry, bandIndex, { ...band, materials: [...band.materials, { item: item.id, qty: 1 }] });
}

/** 재료 한 줄을 뺀다(하나 남으면 빼지 않는다: 구간마다 재료 한 줄 이상) */
export function removeMaterial(entry: FacilityJson, bandIndex: number, line: number): FacilityJson {
  const band = entry.build?.levels[bandIndex];
  if (!band || band.materials.length <= 1) return entry;
  return setBand(entry, bandIndex, { ...band, materials: band.materials.filter((_, at) => at !== line) });
}

/** 구간 × 재료 표: 열 = 구간들에 나오는 아이템(처음 나온 차례), 칸 = 그 구간의 재료 줄 차례와 수량(없으면 null) */
export interface BandMatrix {
  readonly items: readonly string[];
  readonly cells: readonly (readonly ({ readonly line: number; readonly qty: number } | null)[])[];
}

export function bandMatrix(entry: FacilityJson): BandMatrix {
  const levels = entry.build?.levels ?? [];
  const items: string[] = [];
  for (const band of levels)
    for (const stack of band.materials) if (!items.includes(stack.item)) items.push(stack.item);
  const cells = levels.map((band) =>
    items.map((item) => {
      const line = band.materials.findIndex((stack) => stack.item === item);
      const stack = band.materials[line];
      return stack ? { line, qty: stack.qty } : null;
    }),
  );
  return { items, cells };
}

/**
 * 구간 × 재료 표의 고른 칸(열쇠 "구간:열") 묶음 바꾸기: 재료 열마다 구간 차례로 셈한다(값으로·더하기·곱하기·채우기).
 * 그 구간에 그 재료가 없는 칸은 건너뛴다. 수량은 범위(1 ~ 100만) 안 정수
 */
export function bulkEditBandMatrix(entry: FacilityJson, picked: Iterable<string>, op: BulkOp): FacilityJson {
  const matrix = bandMatrix(entry);
  let out = entry;
  for (const [col, rows] of pickedByColumn(picked)) {
    const present = rows.filter((row) => matrix.cells[row]?.[col] != null);
    const column = matrix.cells.map((row) => row[col]?.qty ?? 0);
    const next = bulkApply(column, present, op, FACILITY_BUILD_LIMITS.qty);
    for (const row of present) {
      const cell = matrix.cells[row]?.[col];
      const item = matrix.items[col];
      if (!cell || item === undefined) continue;
      out = setMaterial(out, row, cell.line, { item, qty: next[row] ?? cell.qty });
    }
  }
  return out;
}

/** 레벨마다 구간 하나로 나눈다(재료는 그 레벨이 쓰던 구간 것을 복사 — 레벨 표의 값은 그대로다). 레벨마다 따로 고칠 수 있게 */
export function splitBandsPerLevel(entry: FacilityJson): FacilityJson {
  const build = entry.build;
  if (!build) return entry;
  const levels: BuildLevelJson[] = [];
  for (let level = 1; level <= maxLevelOf(entry); level++) {
    const band = buildLevelAt(build, level);
    if (band) levels.push({ from: level, materials: band.materials.map((stack) => ({ ...stack })) });
  }
  if (levels.length === 0 || levels.length === build.levels.length) return entry;
  return withBuild(entry, { ...build, levels });
}

/** 건설 칸이 없는 시설에 처음 칸을 만든다(분류 배율 1000‰, Lv1 = 첫 아이템 1) */
export function newBuild(entry: FacilityJson, items: readonly BuildingEditorItem[]): FacilityJson {
  const item = items[0];
  if (entry.build || !item) return entry;
  return withBuild(entry, { mulPm: 1000, levels: [{ from: 1, materials: [{ item: item.id, qty: 1 }] }] });
}

/** 채집 칸이 없는 채집 시설에 처음 칸을 만든다(첫 원자재 중분류, STR·VIT, 추첨) */
export function newGather(
  entry: FacilityJson,
  subcategories: readonly BuildingEditorSubcategory[],
): FacilityJson {
  const sub = subcategories.find((option) => option.major === "raw");
  if (entry.gather || !sub) return entry;
  return { ...entry, gather: { primary: "str", secondary: "vit", subcategory: sub.id } };
}

/** 채집 칸을 바꾼다 */
export const setGather = (entry: FacilityJson, gather: FacilityGatherJson | undefined): FacilityJson => {
  const { gather: _old, ...rest } = entry;
  return gather === undefined ? rest : { ...rest, gather };
};

/** 재료로 고를 수 있는 아이템 대분류(장비·소모품·문서는 건설·수리 재료로 쓰지 않는다) */
export const MATERIAL_CATEGORIES: ReadonlySet<string> = new Set([
  "raw",
  "processed",
  "part",
  "construction",
  "gem",
  "precious",
]);

/** 수리 칸을 바꾼다(빈 목록·undefined = 칸 없음 = 수리하지 않는 시설, D-512 323) */
export const setRepair = (
  entry: FacilityJson,
  repair: readonly FacilityRepairJson[] | undefined,
): FacilityJson => {
  const { repair: _old, ...rest } = entry;
  return repair === undefined || repair.length === 0
    ? rest
    : { ...rest, repair: repair.slice(0, FACILITY_REPAIR_LIMITS.rules) };
};

/** 새 수리 줄: 칸 없음·무기 종류 없음(고를 때까지 서버 검사가 막는다), 재료 = 첫 재료 아이템 1. 재료 아이템이 없으면 null */
export function newRepairRule(items: readonly BuildingEditorItem[]): FacilityRepairJson | null {
  const item = items.find((option) => MATERIAL_CATEGORIES.has(option.category));
  return item ? { slots: [], weaponTypes: [], materials: [{ item: item.id, qty: 1 }] } : null;
}

/** 목록에 값을 넣거나 뺀다(넣을 때는 order 차례를 지킨다 — 팩 줄과 같은 차례로 견준다) */
export function toggleIn(
  list: readonly string[],
  value: string,
  on: boolean,
  order: readonly string[],
): string[] {
  const next = new Set(list);
  if (on) next.add(value);
  else next.delete(value);
  const rank = (id: string): number => {
    const index = order.indexOf(id);
    return index < 0 ? order.length : index;
  };
  return [...next].toSorted((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** 레벨 표 한 줄(편집기 미리 보기) */
export interface LevelRow {
  readonly level: number;
  /** 이 레벨이 쓰는 구간의 시작 레벨(구간이 없으면 null) */
  readonly from: number | null;
  readonly materials: readonly BuildStackJson[];
  readonly timeMs: number;
  /** 일하는 자리(Lv × 레벨당 자리) */
  readonly slots: number;
  /** 채집 시설의 레벨 보너스(유효 스탯, N43 × (Lv − 1)). 채집 칸이 없으면 null */
  readonly gatherBonus: number | null;
  /** 꺼진 재료 아이템 */
  readonly disabled: readonly string[];
  /** 무게를 몰라 시간에서 0으로 셈한 재료 */
  readonly unknownWeight: readonly string[];
}

/** 레벨 1 ~ 최고 레벨의 재료·시간·자리 */
export function levelRows(
  entry: FacilityJson,
  items: readonly BuildingEditorItem[],
  rules: FacilityBuildRules,
  gatherLevelBonus: number,
): LevelRow[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  // 건설 재료 수량은 기본 단위(광석은 g)이므로 기본 단위 무게(g)를 쓴다
  const weightOf = (id: string): number | undefined => {
    const item = byId.get(id);
    return item?.weight === null || item === undefined ? undefined : item.weight;
  };
  return Array.from({ length: maxLevelOf(entry) }, (_, index) => {
    const level = index + 1;
    const build = entry.build;
    const materials = build ? buildCostAt(build, level) : [];
    const time = build ? buildTimeAt(build, level, weightOf, rules) : { ms: 0, unknownWeight: [] };
    return {
      level,
      from: build ? (buildLevelAt(build, level)?.from ?? null) : null,
      materials,
      timeMs: time.ms,
      slots: level * entry.slotsPerLevel,
      gatherBonus: entry.gather ? gatherLevelBonus * (level - 1) : null,
      disabled: materials
        .filter((stack) => byId.get(stack.item)?.enabled === false)
        .map((stack) => stack.item),
      unknownWeight: time.unknownWeight,
    };
  });
}

/** 구간 i가 덮는 레벨(from ~ 다음 구간 앞, 최고 레벨까지) */
export function bandRange(entry: FacilityJson, index: number): { from: number; to: number } | null {
  const levels = entry.build?.levels;
  const band = levels?.[index];
  if (!levels || !band) return null;
  const next = levels[index + 1];
  return { from: band.from, to: Math.max(band.from, Math.min(maxLevelOf(entry), (next?.from ?? 99) - 1)) };
}

const two = (value: number): string => String(value).padStart(2, "0");

/** 건설 시간 ms → "시:분:초"(시는 자릿수 제한 없음) */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${two(minutes)}:${two(seconds)}`;
}
