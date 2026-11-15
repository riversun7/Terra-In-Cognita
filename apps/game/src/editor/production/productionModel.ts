// 생산 편집기(/dev/production) 모델 — 사용자 요청 2026-11-11 "생산에디터 : 예전 에디터가 아직 더 낫다 … 6가지 전부에 적용하며 각각의 스탯이
// 주력 보조로 골고루 쓰이게", 기획 D-513(옛 생산 편집기 기준)·43 §4, docs/adr/2026-11-11-production-six.md.
// - 담은 변경: 시설(채집 칸) · 전투 클래스 · 확률표 구간(gatherTiers/gatherTierModel.ts GatherStage 그대로)을 한 묶음으로. 서버 묶음은 건물
//   편집기와 같은 buildings.save(put·revert·put_combat_class·revert_combat_class·put_gather_band 등).
// - 미리 보기: 판정과 같은 식(@terra/shared/gatherMath)으로 유효 스탯 → 구간 → 티어 확률 → 시간당 기대 산출. 기대값은 표시용 실수다.
// 순수 함수만(시험: productionModel.test.ts). 건물 편집기 조각(editor/buildings/)은 가져오지 않는다.
import type {
  BuildingEditorChange,
  BuildingEditorCombatClass,
  BuildingEditorFacility,
  BuildingEditorGatherBand,
  BuildingEditorGatherRules,
  BuildingEditorItem,
  CombatClassJson,
  FacilityGatherJson,
  FacilityJson,
} from "@terra/shared/buildingEditor";
import {
  GATHER_TIERS,
  type GatherBand,
  type GatherSubcategorySource,
  DEFAULT_BUILDING_GATHER,
  buildingGatherTier,
  buildingYieldPm,
  gatherBandIndex,
  gatherCatchPm,
  gatherChancesPm,
  gatherProgress,
  gatherStat,
  gatherSubcategories,
  gatherYield,
  tierRequiredProgress,
} from "@terra/shared/gatherMath";
import type { PrimaryStat } from "@terra/shared/roster";
import { type ProductionTypeView, productionGroupOf } from "@terra/shared/unitGuide";
import { sameJson } from "../content/contentEditorModel.ts";
import {
  EMPTY_GATHER_STAGE,
  type GatherStage,
  draftBandOf,
  gatherChangesOf,
  gatherStageKeys,
} from "../gatherTiers/gatherTierModel.ts";

/** 항목 하나의 담은 변경. base·baseHash = 고치기 시작할 때의 실효 항목·해시 */
export type StagedEntry<T> =
  | { readonly op: "put"; readonly entry: T; readonly base: T; readonly baseHash: string }
  | { readonly op: "revert"; readonly base: T; readonly baseHash: string };

export interface ProductionStage {
  readonly facilities: ReadonlyMap<string, StagedEntry<FacilityJson>>;
  readonly classes: ReadonlyMap<string, StagedEntry<CombatClassJson>>;
  readonly gather: GatherStage;
}

export const EMPTY_PRODUCTION_STAGE: ProductionStage = {
  facilities: new Map(),
  classes: new Map(),
  gather: EMPTY_GATHER_STAGE,
};

interface Row<T> {
  readonly entry: T;
  readonly pack: T | null;
  readonly hash: string;
}

function withEntry<T>(
  map: ReadonlyMap<string, StagedEntry<T>>,
  id: string,
  next: StagedEntry<T> | null,
): Map<string, StagedEntry<T>> {
  const out = new Map(map);
  if (next === null) out.delete(id);
  else out.set(id, next);
  return out;
}

/** 항목을 고친 담음: 고치기 시작할 때의 실효 값과 같아지면 담음에서 뺀다 */
function edited<T>(
  map: ReadonlyMap<string, StagedEntry<T>>,
  id: string,
  row: Row<T>,
  entry: T,
): Map<string, StagedEntry<T>> {
  const current = map.get(id);
  const base = current ? current.base : row.entry;
  const baseHash = current ? current.baseHash : row.hash;
  return withEntry(map, id, sameJson(base, entry) ? null : { op: "put", entry, base, baseHash });
}

function reverted<T>(
  map: ReadonlyMap<string, StagedEntry<T>>,
  id: string,
  row: Row<T>,
): Map<string, StagedEntry<T>> {
  const current = map.get(id);
  return withEntry(map, id, {
    op: "revert",
    base: current ? current.base : row.entry,
    baseHash: current ? current.baseHash : row.hash,
  });
}

/** 화면에 보일 항목(담은 put이면 그 값, 되돌리기면 팩 값, 아니면 실효 값) */
export function draftOf<T>(row: Row<T>, staged: StagedEntry<T> | undefined): T {
  if (!staged) return row.entry;
  if (staged.op === "put") return staged.entry;
  return row.pack ?? row.entry;
}

export const editFacility = (
  stage: ProductionStage,
  row: BuildingEditorFacility,
  entry: FacilityJson,
): ProductionStage => ({ ...stage, facilities: edited(stage.facilities, row.entry.id, row, entry) });
export const revertFacility = (stage: ProductionStage, row: BuildingEditorFacility): ProductionStage => ({
  ...stage,
  facilities: reverted(stage.facilities, row.entry.id, row),
});
export const unstageFacility = (stage: ProductionStage, id: string): ProductionStage => ({
  ...stage,
  facilities: withEntry(stage.facilities, id, null),
});
export const editClass = (
  stage: ProductionStage,
  row: BuildingEditorCombatClass,
  entry: CombatClassJson,
): ProductionStage => ({ ...stage, classes: edited(stage.classes, row.entry.id, row, entry) });
export const revertClass = (stage: ProductionStage, row: BuildingEditorCombatClass): ProductionStage => ({
  ...stage,
  classes: reverted(stage.classes, row.entry.id, row),
});
export const unstageClass = (stage: ProductionStage, id: string): ProductionStage => ({
  ...stage,
  classes: withEntry(stage.classes, id, null),
});

/** 담은 키(시설 "facilities/<ID>", 클래스 "classes/<ID>", 확률표 구간 ID·잠든 줄) */
export function productionStageKeys(stage: ProductionStage): string[] {
  return [
    ...[...stage.facilities.keys()].map((id) => `facilities/${id}`),
    ...[...stage.classes.keys()].map((id) => `classes/${id}`),
    ...gatherStageKeys(stage.gather),
  ];
}

/** 담은 변경 → 서버 묶음(buildings.save) */
export function productionChangesOf(stage: ProductionStage): BuildingEditorChange[] {
  const changes: BuildingEditorChange[] = [];
  for (const [id, staged] of stage.facilities)
    changes.push(
      staged.op === "put"
        ? { op: "put", entry: staged.entry, baseHash: staged.baseHash }
        : { op: "revert", id, baseHash: staged.baseHash },
    );
  for (const [id, staged] of stage.classes)
    changes.push(
      staged.op === "put"
        ? { op: "put_combat_class", entry: staged.entry, baseHash: staged.baseHash }
        : { op: "revert_combat_class", id, baseHash: staged.baseHash },
    );
  return [...changes, ...gatherChangesOf(stage.gather)];
}

/** 채집 칸의 한 칸을 바꾼 시설(선택 칸을 undefined로 주면 그 칸을 뺀다). 팩 줄 차례를 지킨다 */
export function withGather(entry: FacilityJson, patch: Partial<FacilityGatherJson>): FacilityJson {
  if (!entry.gather) return entry;
  const merged = { ...entry.gather, ...patch };
  const gather: FacilityGatherJson = {
    primary: merged.primary,
    secondary: merged.secondary,
    subcategory: merged.subcategory,
    ...(merged.extraSubcategories === undefined || merged.extraSubcategories.length === 0
      ? {}
      : { extraSubcategories: merged.extraSubcategories }),
    ...(merged.mode === undefined ? {} : { mode: merged.mode }),
    ...(merged.yieldBase === undefined ? {} : { yieldBase: merged.yieldBase }),
    ...(merged.yieldPerStatPm === undefined ? {} : { yieldPerStatPm: merged.yieldPerStatPm }),
    ...(merged.yieldCap === undefined ? {} : { yieldCap: merged.yieldCap }),
    ...(merged.catch === undefined ? {} : { catch: merged.catch }),
  };
  return { ...entry, gather };
}

/** 생산 종류 한 줄(채집 단계 시설 + 채집 칸): 실효 줄·화면에 보일 초안·추천 표 모양 */
export interface ProductionTypeRow {
  readonly row: BuildingEditorFacility;
  readonly draft: FacilityJson;
  readonly gather: FacilityGatherJson;
  readonly type: ProductionTypeView;
  readonly staged: boolean;
}

/** 채집 칸이 있는 채집 단계 시설(목록 차례) */
export function productionTypeRows(
  facilities: readonly BuildingEditorFacility[],
  stage: ProductionStage,
): ProductionTypeRow[] {
  return facilities.flatMap((row) => {
    const staged = stage.facilities.get(row.entry.id);
    const draft = draftOf(row, staged);
    const gather = draft.gather;
    if (!gather || draft.stage !== "gather") return [];
    return [
      {
        row,
        draft,
        gather,
        staged: staged !== undefined,
        type: {
          facility: draft.id,
          name: draft.name,
          primary: gather.primary,
          secondary: gather.secondary,
          mode: gather.mode ?? "roll",
          group: productionGroupOf(gather),
        },
      },
    ];
  });
}

/** 가공 시설(생산 단계 process·part·finish) */
export function processRows(facilities: readonly BuildingEditorFacility[]): BuildingEditorFacility[] {
  return facilities.filter((row) => ["process", "part", "finish"].includes(row.entry.stage));
}

/**
 * 사다리: 채집 칸의 중분류들(주 + 함께 내는 것, 질문 946 나)의 켜진 아이템을 티어마다(목록 차례, 길이 10) — 시뮬·서버 사다리와 같은 규칙
 * (@terra/shared/gatherMath gatherSubcategories)
 */
export function ladderOf(
  items: readonly BuildingEditorItem[],
  gather: GatherSubcategorySource,
): readonly (readonly BuildingEditorItem[])[] {
  const subs = new Set(gatherSubcategories(gather));
  const ladder = Array.from({ length: GATHER_TIERS }, (): BuildingEditorItem[] => []);
  for (const item of items)
    if (item.enabled && item.subcategory !== null && subs.has(item.subcategory))
      ladder[Math.min(GATHER_TIERS - 1, Math.max(0, item.tier))]?.push(item);
  return ladder;
}

/** 화면에 보일 확률표(담은 변경을 얹은 것) */
export function draftBands(bands: readonly BuildingEditorGatherBand[], stage: ProductionStage): GatherBand[] {
  return bands.map((row) => {
    const draft = draftBandOf(row, stage.gather);
    return { from: draft.from, weightsPm: draft.weightsPm };
  });
}

export interface TypePreviewInput {
  readonly gather: FacilityGatherJson;
  /** 일꾼의 주·보조 스탯 값 */
  readonly primary: number;
  readonly secondary: number;
  /** 시설 레벨(1~) */
  readonly level: number;
  readonly bands: readonly GatherBand[];
  /** 티어마다 켜진 아이템 수(길이 10) */
  readonly ladderCounts: readonly number[];
  readonly rules: BuildingEditorGatherRules;
  /** 레벨당 유효 스탯 보너스(N43) */
  readonly levelBonus: number;
}

export interface TypePreview {
  /** 유효 스탯 = 주 + 보조 + 레벨 보너스 × (Lv − 1) */
  readonly stat: number;
  /** 유효 스탯이 든 구간 번호(선택 방식은 쓰지 않아 -1) */
  readonly bandIndex: number;
  /** 선택 방식(건물 채집소)이 기르는 티어 = 그 레벨 최고 티어(D-566 1721, 추첨이면 null) */
  readonly selectTier: number | null;
  /** 건물 채집소 수확 배율(‰ — 권장 스탯 미달 효율, 면적 모듈 없음 기준. 추첨이면 null) */
  readonly yieldPm: number | null;
  /** 한 번 시도에서 그 티어 아이템이 나올 확률(‰, 성공 확률을 곱한 값) */
  readonly tierPm: readonly number[];
  /** 아무것도 나오지 않을 확률(‰: 실패 + 빈 사다리) */
  readonly emptyPm: number;
  /** 성공 확률(‰, 규칙이 없으면 null) */
  readonly catchPm: number | null;
  /** 진행 속도(틱마다 진행) · 한 번에 나오는 개수 */
  readonly progress: number;
  readonly yieldPerLot: number;
  /** 한 번 시도에 드는 시간의 기대값(분) */
  readonly minutesPerLot: number;
  /** 일꾼 한 명 시간당 기대 산출(개, 표시용) */
  readonly perHour: number;
  /** 가장 자주 나오는 티어(없으면 null) */
  readonly topTier: number | null;
}

/** 미리 보기: 판정과 같은 식으로 유효 스탯·구간·티어 확률·시간당 기대 산출 */
export function typePreview(input: TypePreviewInput): TypePreview {
  const { gather, rules } = input;
  const primary = Math.max(0, Math.floor(input.primary));
  const secondary = Math.max(0, Math.floor(input.secondary));
  const stat = gatherStat(primary + secondary, Math.max(1, input.level), input.levelBonus);
  const progress = gatherProgress(primary, rules.progressDivisor);
  const yieldPerLot = gatherYield(secondary, {
    base: gather.yieldBase ?? 1,
    perStatPm: gather.yieldPerStatPm ?? rules.yieldPerStatPm,
    cap: gather.yieldCap,
  });
  const ladder = input.ladderCounts.map((count) => Array.from({ length: Math.max(0, count) }, () => ""));
  const select = gather.mode === "select";
  let tierPm = Array.from({ length: GATHER_TIERS }, () => 0);
  let emptyPm = 0;
  let selectTier: number | null = null;
  let yieldPm: number | null = null;
  let bandIndex = -1;
  if (select) {
    // 건물 채집소(D-566 1721·D-568): 레벨 최고 티어, 스탯은 수확 효율
    selectTier = buildingGatherTier(Math.max(1, input.level));
    yieldPm = buildingYieldPm(primary + secondary, selectTier, 0, rules.building ?? DEFAULT_BUILDING_GATHER);
    let landed = -1;
    for (let tier = selectTier; tier >= 0; tier--)
      if ((input.ladderCounts[tier] ?? 0) > 0) {
        landed = tier;
        break;
      }
    if (landed < 0) emptyPm = 1000;
    else tierPm[landed] = 1000;
  } else {
    // 표 하나(기획 D-552)
    const bands = input.bands;
    bandIndex = gatherBandIndex(bands, stat);
    const chances = gatherChancesPm(bands, stat, ladder);
    tierPm = chances.tierPm;
    emptyPm = chances.emptyPm;
  }
  const catchPm = gather.catch ? gatherCatchPm(primary + secondary, gather.catch) : null;
  if (catchPm !== null) {
    // 성공한 번만 티어를 본다: 티어 확률 × 성공 확률, 나머지는 빈 번
    const scaled = tierPm.map((pm) => Math.floor((pm * catchPm) / 1000));
    emptyPm = 1000 - scaled.reduce((sum, pm) => sum + pm, 0);
    tierPm = scaled;
  }
  // 한 번 시도의 필요 진행(나온 티어마다, 빈 번은 T0) → 시간 기대값
  const need = (tier: number): number =>
    tierRequiredProgress(tier, rules.tierProgressBase, rules.tierProgressStep) * Math.max(1, rules.tickMs);
  let expectedMs = (emptyPm * need(0)) / 1000;
  tierPm.forEach((pm, tier) => {
    expectedMs += (pm * need(tier)) / 1000;
  });
  expectedMs /= Math.max(1, progress);
  const landedPm = 1000 - emptyPm;
  const perHour =
    expectedMs <= 0
      ? 0
      : (3_600_000 / expectedMs) * (landedPm / 1000) * yieldPerLot * ((yieldPm ?? 1000) / 1000);
  let topTier: number | null = null;
  tierPm.forEach((pm, tier) => {
    if (pm > 0 && (topTier === null || pm > (tierPm[topTier] ?? 0))) topTier = tier;
  });
  return {
    stat,
    bandIndex,
    selectTier,
    yieldPm,
    tierPm,
    emptyPm,
    catchPm,
    progress,
    yieldPerLot,
    minutesPerLot: expectedMs / 60_000,
    perHour,
    topTier,
  };
}

/** 개요·미리 보기의 표본 스탯(주 = 보조): 새 유닛 평균·중간·높음 */
export function sampleStats(defaultStat: number): readonly number[] {
  const base = Math.max(1, defaultStat);
  return [base, base * 3, base * 6, base * 10];
}

/** 생산 편집기 탭: 생산 종류·가공 시설은 시설 ID를 품는다 */
export type ProductionTab =
  | { readonly kind: "type"; readonly facility: string }
  | { readonly kind: "process"; readonly facility: string }
  | { readonly kind: "tiers" | "expect" | "mapping" | "classes" | "overview" };

/** 공용 탭(expect = 예상 채집 확률표, D-534) */
export const COMMON_TABS = ["tiers", "expect", "mapping", "classes", "overview"] as const;
export type CommonTab = (typeof COMMON_TABS)[number];

/** 탭 → 주소 값(?tab=) */
export function tabKey(tab: ProductionTab): string {
  return tab.kind === "type" || tab.kind === "process" ? tab.facility : tab.kind;
}

/** 주소 값 → 탭. 모르는 값·없는 시설이면 null(부르는 쪽이 첫 탭으로) */
export function tabOfKey(
  key: string | undefined,
  types: readonly string[],
  processes: readonly string[],
): ProductionTab | null {
  if (key === undefined || key === "") return null;
  const common = COMMON_TABS.find((value) => value === key);
  if (common) return { kind: common };
  if (types.includes(key)) return { kind: "type", facility: key };
  if (processes.includes(key)) return { kind: "process", facility: key };
  return null;
}

/** 스탯 코드(화면 차례) */
export const STAT_ORDER: readonly PrimaryStat[] = ["str", "vit", "int", "wis", "dex", "agi"];
