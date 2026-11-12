// 크리처 편집기(/dev/creatures) 공용 자료 모양·검증 상수·자동 배분·시뮬레이터 — 서버(apps/server/src/creatureEdit/)와 화면(apps/game/src/editor/creatures/)이 같이 쓴다.
import type {
  ContentEditOrigin,
  ContentHistoryRow,
  ContentIssueView,
  ContentOverrideView,
  ContentSleepingRow,
  LocalizedName,
} from "./contentEdit.ts";
import { createRng } from "./rng.ts";
import { STAT_SUM_ABSOLUTE_MAX } from "./statGrowth.ts";

export const CREATURE_CATEGORIES = [
  "beast",
  "dragon",
  "aquatic",
  "bird",
  "insect",
  "undead",
  "humanoid",
  "mythical",
  "construct",
  "dinosaur",
  "elemental",
  "demon",
  "plant",
  "aberration",
] as const;
export type CreatureCategory = (typeof CREATURE_CATEGORIES)[number];

export const CREATURE_GRADES = ["common", "rare", "epic", "boss", "legendary", "mythic"] as const;
export type CreatureGrade = (typeof CREATURE_GRADES)[number];

export const CREATURE_SIZES = ["S", "M", "L", "XL"] as const;
export type CreatureSize = (typeof CREATURE_SIZES)[number];

export const CREATURE_PRIMARY_CODES = ["str", "dex", "agi", "vit", "int", "wis"] as const;
export type CreaturePrimaryCode = (typeof CREATURE_PRIMARY_CODES)[number];

export const CREATURE_PRESET_TAGS = [
  "tendency_attack",
  "tendency_defense",
  "tendency_agile",
  "tendency_mount",
  "tendency_magic",
  "tendency_production",
  "set_zodiac_12",
  "set_horoscope_12",
  "set_four_gods",
  "set_mh_homage",
  "set_dq_ff",
  "set_greek_myth",
  "set_ancient_dino",
] as const;
export type CreaturePresetTag = (typeof CREATURE_PRESET_TAGS)[number];

export const CREATURE_WEAPON_APPROPRIATES = ["str", "dex", "agi", "int"] as const;
export type CreatureWeaponAppropriate = (typeof CREATURE_WEAPON_APPROPRIATES)[number];

/** 원형 초상화 원 — 단위·계산은 portraitCrop.ts(고르는 쪽과 그리는 쪽이 같이 쓴다)가 기준이다 */
export interface CreaturePortraitCrop {
  /** 원 중심 X (그림 너비의 0~1000‰, 500 = 가로 정중앙) */
  readonly cxPm: number;
  /** 원 중심 Y (그림 높이의 0~1000‰, 500 = 세로 정중앙) */
  readonly cyPm: number;
  /** 원 반지름 (그림 너비의 50~500‰, 320 = 지름이 너비의 64%) */
  readonly radiusPm: number;
}

export const CREATURE_DEFAULT_PORTRAIT_CROP: CreaturePortraitCrop = {
  cxPm: 500,
  cyPm: 360,
  radiusPm: 320,
};

export interface CreatureWeaponAttackJson {
  readonly attack: number;
  readonly min: number;
  readonly max: number;
  readonly elementsPm?: readonly number[] | undefined;
}

export interface CreatureWeaponStatRangeJson {
  readonly stat: string;
  readonly min: number;
  readonly max: number;
}

export interface CreatureNaturalWeaponJson {
  readonly name?: LocalizedName | undefined;
  readonly appropriate?: CreatureWeaponAppropriate | undefined;
  readonly physical?: CreatureWeaponAttackJson | undefined;
  readonly elemental?: CreatureWeaponAttackJson | undefined;
  readonly skillElementsPm?: readonly number[] | undefined;
  readonly hitPm?: number | undefined;
  readonly critPm?: number | undefined;
  readonly intervalMs: number;
  readonly range: number;
  readonly arc?: boolean | undefined;
  readonly staminaCost?: number | undefined;
  readonly mpCost?: number | undefined;
  readonly stats?: readonly CreatureWeaponStatRangeJson[] | undefined;
}

export interface CreatureSkillLinkJson {
  readonly skill: string;
  readonly unlockLevel?: number | undefined;
  readonly innate?: boolean | undefined;
}

export interface CreatureDropJson {
  readonly item: string;
  readonly chancePm: number;
  readonly min: number;
  readonly max: number;
}

export interface CreatureSkillSlotsJson {
  readonly base: number;
  readonly perRebirth: number;
  readonly max: number;
}

export type CreaturePrimariesJson = {
  readonly [K in CreaturePrimaryCode]: number;
};

export interface CreatureJson {
  readonly id: string;
  readonly name: LocalizedName;
  readonly description?: LocalizedName | undefined;
  readonly category: CreatureCategory;
  readonly grade: CreatureGrade;
  readonly size: CreatureSize;
  readonly giant3Tile?: boolean | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly image?: string | undefined;
  readonly portraitCrop?: CreaturePortraitCrop | undefined;
  readonly primaries: CreaturePrimariesJson;
  readonly elements: readonly number[];
  readonly resistPm?: readonly number[] | undefined;
  readonly allowedSubspecies?: readonly string[] | undefined;
  readonly skillSlots: CreatureSkillSlotsJson;
  readonly skills?: readonly CreatureSkillLinkJson[] | undefined;
  readonly naturalWeapon?: CreatureNaturalWeaponJson | undefined;
  readonly drops?: readonly CreatureDropJson[] | undefined;
  readonly unitKind?: string | undefined;
  readonly enabled: boolean;
}

export const CREATURE_LIMITS = {
  stat: { min: 1, max: 999 },
  element: { min: 0, max: 10 },
  elementSumMax: 20,
  resistPm: { min: -1000, max: 1000 },
  portraitCoordPm: { min: 0, max: 1000 },
  portraitRadiusPm: { min: 50, max: 500 },
  skillSlotBase: { min: 1, max: 10 },
  skillSlotPerRebirth: { min: 0, max: 5 },
  skillSlotMax: { min: 1, max: 10 },
  skillSlots: { min: 1, max: 10 },
  weaponAttack: { min: 0, max: 1_000_000 },
  weaponIntervalMs: { min: 200, max: 60_000 },
  weaponRange: { min: 1, max: 64 },
  weaponStats: 6,
  dropChancePm: { min: 1, max: 1000 },
  dropQty: { min: 1, max: 999 },
  dropQtyMax: 999,
  dropsMax: 24,
  tagsMax: 24,
  skillsMax: 10,
  changesMax: 50,
  historyLimit: 30,
} as const;

export interface CreatureEditorRow {
  readonly entry: CreatureJson;
  readonly origin: ContentEditOrigin;
  readonly pack: CreatureJson | null;
  readonly override: ContentOverrideView | null;
  readonly hash: string;
}

export interface CreatureEditorItemOption {
  readonly id: string;
  readonly name: LocalizedName;
  readonly category: string;
  readonly tier: number;
  readonly startPrice?: number | null | undefined;
  readonly enabled: boolean;
}

export interface CreatureEditorSkillOption {
  readonly id: string;
  readonly name: LocalizedName;
  readonly base: string;
  readonly bareHand: boolean;
  readonly enabled: boolean;
}

export interface CreatureEditorUnitKindOption {
  readonly id: string;
  readonly name: LocalizedName;
  readonly slots: readonly string[];
  readonly enabled: boolean;
}

export interface CreatureEditorListResponse {
  readonly contentVersion: string;
  readonly revision: number;
  readonly creatures: readonly CreatureEditorRow[];
  readonly items: readonly CreatureEditorItemOption[];
  readonly skills: readonly CreatureEditorSkillOption[];
  readonly unitKinds: readonly CreatureEditorUnitKindOption[];
  /** public/creatures/ 아래에서 감지된 사용 가능 이미지 파일 이름 목록 */
  readonly availableImages: readonly string[];
  readonly retired: readonly string[];
  readonly sleeping: readonly ContentSleepingRow[];
}

export type CreatureEditorChange =
  | { readonly op: "put"; readonly entry: CreatureJson; readonly baseHash: string | null }
  | { readonly op: "revert"; readonly id: string; readonly baseHash: string }
  | { readonly op: "discard_sleeping"; readonly id: string };

export const CREATURE_EDITOR_REASONS = [
  "invalid_entry",
  "unknown_entry",
  "retired_id",
  "duplicate_entry",
  "invalid_note",
  "entry_changed",
  "entry_too_large",
  "created_limit",
  "revision_conflict",
] as const;
export type CreatureEditorReason = (typeof CREATURE_EDITOR_REASONS)[number];

export interface CreatureEditorCheckResponse {
  readonly ok: boolean;
  readonly issues: readonly ContentIssueView[];
}

export type CreatureEditorHistoryRow = ContentHistoryRow;
export const CREATURE_EDITOR_HISTORY_LIMIT = 30;

/**
 * 크리처 이미지 경로 해석기 — 파일 이름만 적혀 있으면 `/creatures/<파일명>`으로 바꾸고,
 * 이미 `/` 또는 `http`로 시작하면 그대로 돌려준다. 확장자(`.webp`, `.png`, `.jpg` 등)는 가리지 않는다.
 */
export function resolveCreatureImageUrl(image: string | undefined): string | null {
  if (!image) return null;
  const trimmed = image.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `/creatures/${trimmed}`;
}

/**
 * 등급별 6스탯 총합 기준 예산(기획 D-5024·50_Content_Rules §3.4). 바뀜(D-534, 2026-11-12): 크리쳐 초기 합은 상위 콘텐츠로 최대 80, 어떤 경우에도
 * 100 이하(statGrowth.ts STAT_SUM_ABSOLUTE_MAX) → 보스 72·전설 78·신화 80 [임시](옛 78·92·110). 팩 검사(creature_stat_sum)가 설정 칸 상한을 본다
 */
export const CREATURE_GRADE_STAT_BUDGET: Readonly<Record<CreatureGrade, number>> = {
  common: 36,
  rare: 48,
  epic: 62,
  boss: 72,
  legendary: 78,
  mythic: 80,
};

/** 성향별 6스탯 기본 가중치(STR, DEX, AGI, VIT, INT, WIS) */
export type CreatureStatTendency =
  | "tendency_attack"
  | "tendency_defense"
  | "tendency_agile"
  | "tendency_mount"
  | "tendency_magic"
  | "tendency_production";

const TENDENCY_WEIGHTS: Readonly<
  Record<CreatureStatTendency, readonly [number, number, number, number, number, number]>
> = {
  tendency_attack: [30, 20, 18, 16, 8, 8],
  tendency_defense: [20, 12, 10, 36, 10, 12],
  tendency_agile: [16, 26, 32, 12, 7, 7],
  tendency_mount: [20, 14, 28, 24, 7, 7],
  tendency_magic: [8, 12, 12, 14, 30, 24],
  tendency_production: [18, 26, 14, 22, 10, 10],
};

/** 크기별 스탯 보정 가중치(S: 민첩·솜씨↑, L/XL: 힘·체력↑ 민첩↓) */
const SIZE_MODIFIERS: Readonly<
  Record<CreatureSize, readonly [number, number, number, number, number, number]>
> = {
  S: [0.85, 1.15, 1.25, 0.8, 1.0, 1.0],
  M: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  L: [1.18, 0.95, 0.85, 1.2, 0.95, 0.95],
  XL: [1.35, 0.85, 0.72, 1.4, 0.95, 0.95],
};

/**
 * 특성 기반 6스탯 자동 배분 생성기(기획 D-094·D-5024)
 * 등급 예산·크기·성향·주력/부주력 스탯을 조합해 합계가 예산과 정확히 일치하는 6대 스탯을 산출한다.
 */
export function allocateCreatureStats(opts: {
  readonly grade: CreatureGrade;
  readonly size: CreatureSize;
  readonly tendency: CreatureStatTendency;
  readonly primaryStat?: CreaturePrimaryCode | undefined;
  readonly secondaryStat?: CreaturePrimaryCode | undefined;
  readonly customBudget?: number | undefined;
}): CreaturePrimariesJson {
  const budget = Math.max(
    6,
    Math.min(STAT_SUM_ABSOLUTE_MAX, opts.customBudget ?? CREATURE_GRADE_STAT_BUDGET[opts.grade]),
  );
  const baseW = TENDENCY_WEIGHTS[opts.tendency];
  const sizeW = SIZE_MODIFIERS[opts.size];
  const raw = CREATURE_PRIMARY_CODES.map((code, idx) => {
    let w = (baseW[idx] ?? 16) * (sizeW[idx] ?? 1);
    if (opts.primaryStat === code) w *= 1.28;
    else if (opts.secondaryStat === code) w *= 1.14;
    return w;
  });
  const totalW = raw.reduce((a, b) => a + b, 0);
  const allocated = raw.map((w) => Math.max(1, Math.round((w / totalW) * budget)));
  let diff = budget - allocated.reduce((a, b) => a + b, 0);
  const primaryIdx = opts.primaryStat ? CREATURE_PRIMARY_CODES.indexOf(opts.primaryStat) : 0;
  let guard = 0;
  while (diff !== 0 && guard < 100) {
    guard++;
    const targetIdx = diff > 0 ? Math.max(0, primaryIdx) : allocated.findIndex((v) => v > 1);
    if (targetIdx < 0) break;
    allocated[targetIdx] = (allocated[targetIdx] ?? 1) + (diff > 0 ? 1 : -1);
    diff += diff > 0 ? -1 : 1;
  }
  return {
    str: allocated[0] ?? 6,
    dex: allocated[1] ?? 6,
    agi: allocated[2] ?? 6,
    vit: allocated[3] ?? 6,
    int: allocated[4] ?? 6,
    wis: allocated[5] ?? 6,
  };
}

export interface CreatureStatDistributionSummary {
  readonly count: number;
  readonly stats: {
    readonly [K in CreaturePrimaryCode]: {
      readonly min: number;
      readonly avg: number;
      readonly max: number;
    };
  };
}

/** 세트·분류 내 6스탯 분포 집계(기획 D-094 세트 내 스탯 균형 검증용) */
export function summarizeCreatureStatDistribution(
  entries: readonly Pick<CreatureJson, "primaries">[],
): CreatureStatDistributionSummary {
  if (entries.length === 0) {
    const empty = { min: 0, avg: 0, max: 0 };
    return {
      count: 0,
      stats: { str: empty, dex: empty, agi: empty, vit: empty, int: empty, wis: empty },
    };
  }
  const statOf = (code: CreaturePrimaryCode): { min: number; avg: number; max: number } => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let sum = 0;
    for (const entry of entries) {
      const v = entry.primaries[code];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return {
      min,
      avg: Math.round((sum / entries.length) * 10) / 10,
      max,
    };
  };
  return {
    count: entries.length,
    stats: {
      str: statOf("str"),
      dex: statOf("dex"),
      agi: statOf("agi"),
      vit: statOf("vit"),
      int: statOf("int"),
      wis: statOf("wis"),
    },
  };
}

export interface SimulatedWeaponRoll {
  readonly physicalAttack: number | null;
  readonly elementalAttack: number | null;
  readonly stats: readonly { readonly stat: string; readonly value: number }[];
  readonly qualityPm: number;
}

/**
 * 고유 무기 랜덤 지급 시뮬레이터 — 제작소에서 철검(기준 30)을 만들 때 25~40이 나오듯,
 * 시드 난수로 고유 무기의 물리/원소 공격력과 추가 스탯을 min~max 범위에서 뽑는다.
 */
export function simulateCreatureWeaponRoll(
  weapon: CreatureNaturalWeaponJson,
  seed: number,
): SimulatedWeaponRoll {
  const rng = createRng(seed);
  let ratioSum = 0;
  let ratioCount = 0;
  const rollRange = (min: number, max: number): number => {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    if (lo === hi) return lo;
    const picked = lo + rng.nextInt(hi - lo + 1);
    ratioSum += (picked - lo) / (hi - lo);
    ratioCount += 1;
    return picked;
  };
  const physicalAttack = weapon.physical ? rollRange(weapon.physical.min, weapon.physical.max) : null;
  const elementalAttack = weapon.elemental ? rollRange(weapon.elemental.min, weapon.elemental.max) : null;
  const stats = (weapon.stats ?? []).map((row) => ({
    stat: row.stat,
    value: rollRange(row.min, row.max),
  }));
  const qualityPm = ratioCount > 0 ? Math.round((ratioSum / ratioCount) * 1000) : 1000;
  return {
    physicalAttack,
    elementalAttack,
    stats,
    qualityPm,
  };
}

export interface SimulatedLootRow {
  readonly item: string;
  readonly totalQty: number;
  readonly avgPerKill: number;
}

/** 전리품 드롭 몬테카를로 시뮬레이터(결정적 시드 난수 사용) */
export function simulateCreatureLoot(
  drops: readonly CreatureDropJson[],
  kills: number,
  seed: number,
): readonly SimulatedLootRow[] {
  const rng = createRng(seed);
  const totals = drops.map(() => 0);
  const clampedKills = Math.max(1, Math.min(100_000, kills));
  for (let k = 0; k < clampedKills; k++) {
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d) continue;
      const roll = rng.nextInt(1000);
      if (roll < d.chancePm) {
        const lo = Math.min(d.min, d.max);
        const hi = Math.max(d.min, d.max);
        const qty = lo === hi ? lo : lo + rng.nextInt(hi - lo + 1);
        totals[i] = (totals[i] ?? 0) + qty;
      }
    }
  }
  return drops.map((d, i) => ({
    item: d.item,
    totalQty: totals[i] ?? 0,
    avgPerKill: Math.round(((totals[i] ?? 0) / clampedKills) * 1000) / 1000,
  }));
}
