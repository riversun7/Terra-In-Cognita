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
  /** 3D 모델 파일 이름 또는 경로(GLB) */
  readonly model?: string | undefined;
  /** 변종이면 그룹 대표 크리쳐 ID */
  readonly variantOf?: string | undefined;
  /** 1레벨 기준 스탯(도감 값) */
  readonly primaries: CreaturePrimariesJson;
  /** 스탯별 조우 오차(±). 없으면 기본 규칙(creatureDefaultSpread) */
  readonly primarySpread?: CreaturePrimariesJson | undefined;
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
  spread: { min: 0, max: 10 },
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
  /** public/creatures/models/ 아래에서 감지된 3D 모델(GLB) 파일 이름 목록 */
  readonly availableModels: readonly string[];
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

/** 크리처 3D 모델 경로 해석기 — 파일 이름만 적혀 있으면 `/creatures/models/<파일명>`, `/`·`http`로 시작하면 그대로 */
export function resolveCreatureModelUrl(model: string | undefined): string | null {
  if (!model) return null;
  const trimmed = model.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `/creatures/models/${trimmed}`;
}

/**
 * 스탯 조우 오차(±) 기본값 — 사용자 결정 2026-11-25: 기준 스탯 10 이하 ±1, 20 이하 ±2, 그 위 ±3.
 * 도감 값은 1레벨 기준이고, 조우 개체는 스탯마다 기준 ± 오차 안에서 굴린다(docs/adr/2026-11-25-creature-codex-groups.md)
 */
export function creatureDefaultSpread(value: number): number {
  if (value <= 10) return 1;
  if (value <= 20) return 2;
  return 3;
}

/** 그 스탯의 오차(±): 적어 둔 값, 없으면 기본 규칙 */
export function creatureSpreadOf(
  entry: Pick<CreatureJson, "primaries" | "primarySpread">,
  code: CreaturePrimaryCode,
): number {
  return entry.primarySpread?.[code] ?? creatureDefaultSpread(entry.primaries[code]);
}

/** 1레벨 조우 범위(최소 1): 기준 − 오차 ~ 기준 + 오차 */
export function creatureStatRange(
  entry: Pick<CreatureJson, "primaries" | "primarySpread">,
  code: CreaturePrimaryCode,
): { readonly min: number; readonly max: number; readonly spread: number } {
  const base = entry.primaries[code];
  const spread = creatureSpreadOf(entry, code);
  return { min: Math.max(CREATURE_LIMITS.stat.min, base - spread), max: base + spread, spread };
}

/** 6스탯 합의 조우 범위(스탯마다 최소·최대를 더한 값) */
export function creatureStatSumRange(entry: Pick<CreatureJson, "primaries" | "primarySpread">): {
  readonly min: number;
  readonly base: number;
  readonly max: number;
} {
  let min = 0;
  let base = 0;
  let max = 0;
  for (const code of CREATURE_PRIMARY_CODES) {
    const range = creatureStatRange(entry, code);
    min += range.min;
    base += entry.primaries[code];
    max += range.max;
  }
  return { min, base, max };
}

/** 스탯 분포 성향 — 1차 스탯 묶음(STR·VIT 물리, DEX·AGI 기교, INT·WIS 마법) 가운데 어디에 쏠렸는가 */
export const CREATURE_STAT_LEANS = ["physical", "finesse", "magic", "balanced"] as const;
export type CreatureStatLean = (typeof CREATURE_STAT_LEANS)[number];

export interface CreatureStatProfile {
  readonly lean: CreatureStatLean;
  /** 묶음 몫(‰, 합 1000) */
  readonly sharePm: { readonly physical: number; readonly finesse: number; readonly magic: number };
  /** 값이 큰 차례 두 스탯(같으면 코드 차례) */
  readonly top: readonly [CreaturePrimaryCode, CreaturePrimaryCode];
}

/** 묶음 하나가 이 몫(‰) 이상이면 그 성향, 아니면 균형 */
const LEAN_THRESHOLD_PM = 400;

export function creatureStatProfile(primaries: CreaturePrimariesJson): CreatureStatProfile {
  const total = CREATURE_PRIMARY_CODES.reduce((acc, code) => acc + primaries[code], 0);
  const share = (sum: number): number => (total > 0 ? Math.round((sum * 1000) / total) : 0);
  const physical = share(primaries.str + primaries.vit);
  const finesse = share(primaries.dex + primaries.agi);
  const magic = total > 0 ? 1000 - physical - finesse : 0;
  const ranked = [...CREATURE_PRIMARY_CODES].toSorted((a, b) => primaries[b] - primaries[a]);
  const best = Math.max(physical, finesse, magic);
  const lean: CreatureStatLean =
    best < LEAN_THRESHOLD_PM
      ? "balanced"
      : best === physical
        ? "physical"
        : best === magic
          ? "magic"
          : "finesse";
  return {
    lean,
    sharePm: { physical, finesse, magic },
    top: [ranked[0] ?? "str", ranked[1] ?? "vit"],
  };
}

/** 그룹 대표 ID: 변종이면 대표, 아니면 자기 */
export function creatureGroupRootId(entry: Pick<CreatureJson, "id" | "variantOf">): string {
  return entry.variantOf ?? entry.id;
}

export interface CreatureGroup<T> {
  readonly rootId: string;
  /** 대표(목록에 없으면 null — 걸러진 목록) */
  readonly root: T | null;
  /** 변종(목록 차례) */
  readonly variants: readonly T[];
}

/** 목록을 그룹으로 묶는다(차례 = 그룹의 첫 항목이 나온 차례). 변종이 없는 크리쳐는 변종 0개 그룹이다 */
export function groupCreatures<T>(
  rows: readonly T[],
  entryOf: (row: T) => Pick<CreatureJson, "id" | "variantOf">,
): CreatureGroup<T>[] {
  const groups = new Map<string, { rootId: string; root: T | null; variants: T[] }>();
  for (const row of rows) {
    const entry = entryOf(row);
    const rootId = creatureGroupRootId(entry);
    let group = groups.get(rootId);
    if (!group) {
      group = { rootId, root: null, variants: [] };
      groups.set(rootId, group);
    }
    if (entry.id === rootId) group.root = row;
    else group.variants.push(row);
  }
  return [...groups.values()];
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

/**
 * 6스탯 랜덤 분포 뽑기(편의 기능, 사용자 결정 2026-11-25) — 총합(budget)과 고정할 스탯(locked)을 주면 나머지를 성향·크기 비중에
 * 흔들림(±40%)을 얹어 나눈다. 강조 스탯(focus)은 비중을 더 준다. 합은 budget과 같다(고정 값이 budget을 넘지 않는 한). 같은 시드면 같은 분포다
 */
export function rollCreatureStatDistribution(opts: {
  readonly budget: number;
  readonly size: CreatureSize;
  readonly tendency?: CreatureStatTendency | undefined;
  readonly focus?: readonly CreaturePrimaryCode[] | undefined;
  readonly locked?: Partial<Record<CreaturePrimaryCode, number>> | undefined;
  readonly seed: number;
}): CreaturePrimariesJson {
  const rng = createRng(opts.seed);
  const locked = opts.locked ?? {};
  const free = CREATURE_PRIMARY_CODES.filter((code) => locked[code] === undefined);
  const lockedSum = CREATURE_PRIMARY_CODES.reduce((acc, code) => acc + (locked[code] ?? 0), 0);
  const budget = Math.max(6, Math.min(STAT_SUM_ABSOLUTE_MAX, Math.trunc(opts.budget)));
  // 고정하지 않은 칸에 돌아갈 몫(칸마다 최소 1)
  const pool = Math.max(free.length, budget - lockedSum);
  const baseW = opts.tendency ? TENDENCY_WEIGHTS[opts.tendency] : [16, 16, 16, 16, 16, 16];
  const sizeW = SIZE_MODIFIERS[opts.size];
  const weights = free.map((code) => {
    const idx = CREATURE_PRIMARY_CODES.indexOf(code);
    const jitterPm = 600 + rng.nextInt(801);
    const focus = opts.focus?.includes(code) === true ? 1.6 : 1;
    return (baseW[idx] ?? 16) * (sizeW[idx] ?? 1) * focus * (jitterPm / 1000);
  });
  const totalW = weights.reduce((a, b) => a + b, 0);
  const values = weights.map((w) => Math.max(1, Math.floor((w / totalW) * pool)));
  // 남은 몫은 비중이 큰 칸부터, 넘친 몫은 값이 큰 칸부터 맞춘다
  const order = weights.map((w, i) => ({ w, i })).toSorted((a, b) => b.w - a.w || a.i - b.i);
  let diff = pool - values.reduce((a, b) => a + b, 0);
  for (let step = 0; diff > 0 && order.length > 0; step++) {
    const slot = order[step % order.length];
    if (!slot) break;
    values[slot.i] = (values[slot.i] ?? 1) + 1;
    diff -= 1;
  }
  for (let guard = 0; diff < 0 && guard < 1000; guard++) {
    let big = -1;
    for (let i = 0; i < values.length; i++) {
      if ((values[i] ?? 1) > 1 && (big < 0 || (values[i] ?? 1) > (values[big] ?? 1))) big = i;
    }
    if (big < 0) break;
    values[big] = (values[big] ?? 2) - 1;
    diff += 1;
  }
  const out: Record<CreaturePrimaryCode, number> = { str: 1, dex: 1, agi: 1, vit: 1, int: 1, wis: 1 };
  for (const code of CREATURE_PRIMARY_CODES) {
    const fixed = locked[code];
    if (fixed !== undefined) out[code] = fixed;
  }
  free.forEach((code, i) => {
    out[code] = values[i] ?? 1;
  });
  return out;
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
