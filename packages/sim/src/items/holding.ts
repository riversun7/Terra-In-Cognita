// 보유 물건(아이템 인스턴스) 판정 — docs/adr/2026-11-03-item-holdings.md, 조사 docs/research/2026-11-03-old-item-holdings.md.
// 서버(apps/server/src/holdings/)와 뒤에 시뮬레이터가 같은 함수를 쓴다(D-013). 정수만, 시드 난수만 쓴다.
// - 모양: 장비는 하나하나(instance, 스택 1 D-5003), 신선도가 있는 것은 묶음(lot, 같은 숙성 상태끼리만 쌓임 D-285·D-289),
//   그 밖 소모품(use)은 같은 것끼리 쌓인다(stack, D-496 286 "같은 물약은 같은 물건"). 그 밖(원자재·가공품 등 쌓이는 물자)은
//   원장 계정(위치 계정)에 둔다(경제 ADR 2026-10-31-economy-core.md 3절) → null.
// - 굴림(옛 ItemRollEngine.rollInstanceProperties): 얻는 때 한 번 스탯마다 [최소, 최대] 균등 정수 하나, 범위 안 자리(‰)를 같이 둔다.
//   등급 점수 = 자리의 평균(D-5006, 천분율 정수, 만든 직후 값). 범위가 없으면 자리 1000(옛 _calcQuality "범위 없으면 만점").
//   굴린 값은 만들 때 정해지고(N49, 옛 user_equipments bonus_*), 그 밖 칸(무기 사양·속성·칸 등)은 실효 아이템 정의를 그때그때 읽는다
//   (옛 CharacterRepository가 template 값을 늘 읽음, 기획 285 해석). 다시 굴리기는 개발자 소급 명령만(D-496).
// - 닳기(D-496 289, 옛 BattleResult.processDurability): 전투가 끝날 때 입은 장비마다 확률로 깎는다(이겨도), 지면 더 깎을 수 있다.
//   확률·양은 설정 칸(N49·C20). 0이면 입지 못한다(옛: 내구도 0 → 강제로 벗김). 퇴각한 유닛은 닳지 않는다(D-514 352 — D-190
//   "퇴각하면 장비 내구도를 잃지 않는다": 전투마다 닳음도 패배 닳음도 없다).
// - 수리(D-5031·F11·F12): 최대 내구도 감소는 society/cyborgUpkeep.ts repairDurable 하나. 재료 양 = max(1, ⌈기본 양 × 티어 × 잃은 ÷ 최대⌉)
//   (옛 enhancement_routes.js 장비 수리, 티어 0은 1로 친다 — 옛 `Number(tier) || 1`).
// - 신선도(D-285·D-496 288, 옛 GDD Consolidated_Item 4장): 신선도 = max(0, 1 − 경과 ÷ 유통기한). 경과는 실제 시간을 보존 배율로 나눈
//   합(숙성 ms)이고 유통기한은 실효 정의를 그때그때 읽는다. 0이 되면 편집기에서 고른 다른 아이템으로 바뀐다(그 아이템이 꺼졌거나 없으면
//   버린다 — 옛 "자동 폐기 또는 변환", 끈 항목은 새로 나오지 않는다). 옛 코드의 하루 −10% 수량 감소·만료 지우기는 쓰지 않는다(N49).
//   보존 배율은 보관 곳마다 설정 칸(D-512 322, 옛 문서 Consolidated_Item.md:1862~1868: 냉장 ×2·절임 ×3·통조림 ×5·냉동 멈춤, 유닛이 듦 ×1,
//   거래소 멈춤 D-289). 효과량은 신선도에 비례한다(D-512 320, combat/useAmount.ts).
// - 소모품 효과 교체(D-501): 같은 효과는 높은 값만 남는다(낮거나 같으면 쓰지 않는다 = 낭비 막기). 같은 배타 묶음의 다른 효과는 확인
//   뒤 새 것으로 바꾼다. 자동 사용의 "상황에 더 좋은 쪽" 판단식은 기획 질문(287)이라 자동 사용은 다른 효과를 바꾸지 않는다.
import type { Rng } from "@terra/shared";
import type { StatRange } from "../combat/equipment.ts";
import type { Durable } from "../society/cyborgUpkeep.ts";

/** 보유 모양: 장비 하나하나·신선도 묶음·쌓이는 소모품 */
export type HoldingKind = "instance" | "lot" | "stack";

/** 모양을 정하는 데 드는 아이템 칸(팩 items 항목) */
export interface HoldableDef {
  readonly category: string;
  readonly perish?: { readonly shelfLifeMs: number; readonly spoilsTo: string } | undefined;
  readonly use?: unknown;
  /** 유전자(팩 gene 칸): 하나하나 값이 다른 인스턴스(D-516) */
  readonly gene?: unknown;
}

/** 보유 표에 두는 아이템인가, 둔다면 어떤 모양인가(아니면 null = 원장 물자). 장비·유전자(D-516)는 하나하나 */
export function holdingKindOf(def: HoldableDef): HoldingKind | null {
  if (def.category === "equipment" || def.gene !== undefined) return "instance";
  if (def.perish !== undefined) return "lot";
  if (def.use !== undefined) return "stack";
  return null;
}

/** stackMax가 없을 때 한 칸 상한(팩 스키마 상한과 같은 값, 기술 기본) */
export const DEFAULT_STACK_MAX = 1_000_000;

/** 한 칸에 쌓는 수(장비·유전자는 1) */
export function stackMaxOf(def: HoldableDef & { readonly stackMax?: number | undefined }): number {
  if (def.category === "equipment" || def.gene !== undefined) return 1;
  return Math.max(1, def.stackMax ?? DEFAULT_STACK_MAX);
}

/** 굴린 스탯 하나: 값과 범위 안 자리(‰) */
export interface RolledStat {
  readonly stat: string;
  readonly value: number;
  readonly pm: number;
}

export interface RolledStats {
  readonly stats: readonly RolledStat[];
  /** 등급 점수(D-5006) = 자리 평균(‰, 내림). 스탯이 없으면 1000 */
  readonly scorePm: number;
}

/** 범위 안 자리(‰, 내림). 범위가 없으면(최대 ≤ 최소) 1000 */
export function rangePositionPm(range: StatRange, value: number): number {
  if (range.max <= range.min) return 1000;
  const pm = Math.floor(((value - range.min) * 1000) / (range.max - range.min));
  return Math.max(0, Math.min(1000, pm));
}

/** 얻는 때 한 번: 스탯마다 [최소, 최대] 균등 정수(sim rollItem과 같은 굴림), 최대 < 최소면 최소(옛 _randomBetween) */
export function rollHoldingStats(ranges: readonly StatRange[], rng: Rng): RolledStats {
  const stats = ranges.map((range): RolledStat => {
    const value = range.max > range.min ? range.min + rng.nextInt(range.max - range.min + 1) : range.min;
    return { stat: range.stat, value, pm: rangePositionPm(range, value) };
  });
  const scorePm =
    stats.length === 0 ? 1000 : Math.floor(stats.reduce((sum, entry) => sum + entry.pm, 0) / stats.length);
  return { stats, scorePm };
}

/** 전투 닳기 규칙(설정 칸): 이겨도 chancePm 확률로 amount, 지면 lossChancePm 확률로 lossAmount를 더 */
export interface WearRules {
  readonly chancePm: number;
  readonly amount: number;
  readonly lossChancePm: number;
  readonly lossAmount: number;
}

/** 확률 한 번(‰). 0 이하면 늘 거짓, 1000 이상이면 늘 참이지만 난수는 늘 하나 뽑는다(같은 시드 = 같은 흐름) */
function chance(rng: Rng, pm: number): boolean {
  return rng.nextInt(1000) < pm;
}

/**
 * 전투 하나에서 유닛 하나가 끝난 모양(닳기에 드는 것): 이긴 편(won), 진 편(lost), 퇴각(retreated — 이긴 편이든 진 편이든 가장자리로
 * 빠짐, D-190·D-205). 퇴각은 닳음이 아예 없다(D-514 352 — D-190 "퇴각하면 장비 내구도를 잃지 않는다", 전투 기본 닳음도 없음)
 */
export type WearOutcome = "won" | "lost" | "retreated";

/**
 * 장비 하나가 전투 하나에서 닳는 양. 난수는 늘 두 번 뽑는다(이겨도·퇴각해도 굴림을 버린다 — 같은 시드면 끝난 모양과 상관없이 같은
 * 흐름). 패배 닳음은 진 편(lost)만, 퇴각(retreated)은 0(D-514 352)
 */
export function battleWearAmount(outcome: WearOutcome, rules: WearRules, rng: Rng): number {
  const base = chance(rng, rules.chancePm) ? Math.max(0, rules.amount) : 0;
  const extra = chance(rng, rules.lossChancePm) && outcome === "lost" ? Math.max(0, rules.lossAmount) : 0;
  return outcome === "retreated" ? 0 : base + extra;
}

/** 닳게 한다(0에서 멈춘다). 양이 0이거나 이미 0이면 같은 객체 */
export function wearDurable<T extends Durable>(item: T, amount: number): T {
  if (amount <= 0 || item.durability <= 0) return item;
  return { ...item, durability: Math.max(0, item.durability - amount) };
}

/** 전투 종료 후 아머 회복 내구도 차감 대상 방어구 칸 */
export const ARMOR_EQUIP_SLOTS: ReadonlySet<string> = new Set(["head", "body", "hands", "feet"]);

/** 전투 후 아머 회복 시 내구도 차감 후보 방어구 하나 */
export interface ArmorDurabilityPiece {
  readonly id: number;
  readonly durability: number;
}

/** 전투 종료 후 아머 자동 회복과 착용 방어구 무작위 내구도 차감 계산 결과 */
export interface ArmorRestorePlan {
  /** 실제로 회복된 아머 HP */
  readonly restored: number;
  /** 실제로 차감한 총 방어구 내구도 */
  readonly spent: number;
  /** 방어구 ID별 내구도 차감량(ID 오름차순, 0인 항목 제외) */
  readonly losses: readonly { readonly id: number; readonly amount: number }[];
}

/**
 * 전투 종료 후 아머 HP 자동 회복 + 방어구 내구도 차감(사용자 결정 2026-11-25, 승·패·퇴각 무관):
 * - 내구도 > 0인 착용 방어구가 하나도 없으면 아머 HP를 회복하지 않는다(restored = 0).
 * - 있으면 잃은 아머 HP를 기준값(armorPerDurability, 기본 10)으로 나눠 반올림(1~4 → 0, 5~14 → 1 …)한 만큼
 *   내구도 > 0 방어구 가운데 시드 난수로 1씩 무작위 차감한다.
 * - 총 남은 방어구 내구도가 모자라면 남은 내구도 × 기준값만큼만 회복하고 모든 방어구 내구도를 0으로 만든다.
 */
export function planArmorRestoreWear(
  missingArmor: number,
  armors: readonly ArmorDurabilityPiece[],
  armorPerDurability: number,
  rng: Rng,
): ArmorRestorePlan {
  const pool = armors
    .filter((entry) => entry.durability > 0)
    .toSorted((a, b) => a.id - b.id)
    .map((entry) => ({ id: entry.id, left: Math.floor(entry.durability), lost: 0 }));
  const missing = Math.max(0, Math.floor(missingArmor));
  if (pool.length === 0 || missing <= 0) return { restored: 0, spent: 0, losses: [] };

  const per = Math.max(1, Math.floor(armorPerDurability));
  const needed = Math.floor((missing + Math.floor(per / 2)) / per);
  const totalDur = pool.reduce((sum, entry) => sum + entry.left, 0);
  const restored = needed <= totalDur ? missing : Math.min(missing, totalDur * per);
  const spend = Math.min(needed, totalDur);

  const live = [...pool];
  for (let i = 0; i < spend && live.length > 0; i++) {
    const pick = rng.nextInt(live.length);
    const chosen = live[pick];
    if (!chosen) break;
    chosen.left -= 1;
    chosen.lost += 1;
    if (chosen.left <= 0) live.splice(pick, 1);
  }

  const losses = pool
    .filter((entry) => entry.lost > 0)
    .map((entry) => ({ id: entry.id, amount: entry.lost }));
  return { restored, spent: spend, losses };
}

/** 입을 수 있나(내구도가 있는 물건은 0이면 못 입는다, N49 286 흐름) */
export function wearable(item: { readonly durability: number | null }): boolean {
  return item.durability === null || item.durability > 0;
}

/** 수리 재료 하나의 양(옛 enhancement_routes.js): max(1, ⌈기본 양 × 티어 × 잃은 ÷ 최대⌉), 티어 0은 1. 잃은 것이 없으면 0 */
export function repairMaterialQty(
  baseQty: number,
  tier: number,
  lost: number,
  maxDurability: number,
): number {
  if (lost <= 0 || maxDurability <= 0 || baseQty <= 0) return 0;
  const t = Math.max(1, tier);
  return Math.max(1, Math.ceil((baseQty * t * lost) / maxDurability));
}

/** 탄약 보충 한 번의 결과(D-509) */
export interface AmmoRefill<T extends Durable> {
  readonly item: T;
  readonly destroyed: boolean;
  readonly maxLoss: number;
  readonly restored: number;
}

/**
 * 탄약 보충(D-509 "재료로 내구도 회복. 최대내구도 점차 감소", 수리 D-5031과 같은 모양): 줄어드는 최대 = ⌈최대 × 감소‰ ÷ 1000⌉,
 * 새 최대가 파괴 문턱(F12) 이하면 파괴(내구도 0), 아니면 남은 탄 = 새 최대. 쓴 탄이 없으면 그대로(재료도 들지 않는다).
 * 재료 양은 repairMaterialQty(기본 양, 티어, 잃은 양, 최대)로 보충 전에 셈한다
 */
export function refillAmmo<T extends Durable>(item: T, lossPm: number, destroyAtMax: number): AmmoRefill<T> {
  if (item.durability >= item.maxDurability) return { item, destroyed: false, maxLoss: 0, restored: 0 };
  const maxLoss = Math.floor((item.maxDurability * Math.max(0, lossPm) + 999) / 1000);
  const maxDurability = Math.max(0, item.maxDurability - maxLoss);
  if (maxDurability <= destroyAtMax)
    return { item: { ...item, durability: 0, maxDurability }, destroyed: true, maxLoss, restored: 0 };
  return {
    item: { ...item, durability: maxDurability, maxDurability },
    destroyed: false,
    maxLoss,
    restored: Math.max(0, maxDurability - item.durability),
  };
}

// ── 신선도 ──────────────────────────────────────────

/** 숙성 상태: atMs 시각까지 쌓인 숙성 ms(실제 시간 ÷ 보존 배율의 합) */
export interface AgeState {
  readonly agedMs: number;
  readonly atMs: number;
}

/** 보존 배율 ‰(1000 = 그대로, 2000 = 유통기한 두 배 = 숙성이 반 속도). 0 = 멈춤(냉동·거래소 포장 D-289) */
export type PreservePm = number;

/**
 * 보관 곳(D-512 322 "보관 곳(시설)마다 편집기 값"): 유닛이 듦(unit)·창고(storage, 보존 시설 없음)·냉장(fridge)·절임(pickle)·통조림(can)·
 * 냉동(freezer)·거래소(exchange, 포장 D-289). 훈제는 보관 곳이 아니라 다른 아이템으로 바뀌는 가공이다(옛 문서 1865, 레시피 몫)
 */
export const STORAGE_PLACES = ["unit", "storage", "fridge", "pickle", "can", "freezer", "exchange"] as const;
export type StoragePlace = (typeof STORAGE_PLACES)[number];

/** 보관 곳마다 보존 배율(‰, 설정 칸 N49 — 계수표 consumables.preservePm) */
export type PreserveTable = { readonly [P in StoragePlace]: PreservePm };

/** 보관 곳의 보존 배율(음수는 0 = 멈춤으로 친다) */
export function preservePmOf(place: StoragePlace, table: PreserveTable): PreservePm {
  return Math.max(0, table[place]);
}

/** 보유 칸 자리 → 보관 곳 기본값: 음수(−유닛 ID) = 유닛이 듦, 그 밖 = 창고(창고 종류·냉장 시설은 서버에 아직 없다) */
export function storagePlaceOfLocation(location: number): StoragePlace {
  return location < 0 ? "unit" : "storage";
}

/** nowMs의 숙성 ms(되돌아가지 않는다) */
export function agedAt(state: AgeState, nowMs: number, preservePm: PreservePm): number {
  if (nowMs <= state.atMs || preservePm <= 0) return state.agedMs;
  return state.agedMs + Math.floor(((nowMs - state.atMs) * 1000) / preservePm);
}

/** 숙성 상태를 nowMs로 옮긴다(보관 곳이 바뀌기 전에 부른다) */
export function settleAge(state: AgeState, nowMs: number, preservePm: PreservePm): AgeState {
  return { agedMs: agedAt(state, nowMs, preservePm), atMs: Math.max(state.atMs, nowMs) };
}

/** 신선도(‰) = max(0, 1 − 숙성 ÷ 유통기한), 내림 */
export function freshnessPm(agedMs: number, shelfLifeMs: number): number {
  if (shelfLifeMs <= 0) return 0;
  const left = shelfLifeMs - agedMs;
  if (left <= 0) return 0;
  return Math.min(1000, Math.floor((left * 1000) / shelfLifeMs));
}

/** 신선도가 0이 되는 시각(그 보관 곳에 그대로 있을 때). 멈춤이면 null. 이미 0이면 atMs */
export function spoilAtMs(state: AgeState, shelfLifeMs: number, preservePm: PreservePm): number | null {
  const left = shelfLifeMs - state.agedMs;
  if (left <= 0) return state.atMs;
  if (preservePm <= 0) return null;
  return state.atMs + Math.ceil((left * preservePm) / 1000);
}

/** 썩는 사슬에서 읽는 아이템 칸 */
export interface SpoilDef {
  readonly enabled: boolean;
  readonly perish?: { readonly shelfLifeMs: number; readonly spoilsTo: string } | undefined;
}

export type SpoilOutcome =
  /** 그대로(신선도가 남았거나 신선도가 없는 아이템): 숙성 상태만 nowMs로 */
  | { readonly kind: "same"; readonly age: AgeState }
  /** 다른 아이템으로 바뀜(사슬을 따라 바뀐 마지막 아이템, 그 아이템의 숙성 상태) */
  | { readonly kind: "changed"; readonly item: string; readonly age: AgeState; readonly atMs: number }
  /** 바뀔 아이템이 꺼졌거나 없어 버림(옛 "자동 폐기") */
  | { readonly kind: "disposed"; readonly atMs: number };

/** 사슬 길이 상한(팩 검사가 돌고 도는 사슬을 막는다. 여기서는 끝없이 돌지 않게만) */
const SPOIL_STEPS = 16;

/**
 * 묶음 하나를 nowMs까지 썩힌다. 바뀐 아이템도 신선도가 있으면 바뀐 시각부터 숙성한다(같은 보관 곳 = 같은 배율).
 * 정의는 그때그때의 실효 값(유통기한·바뀌는 아이템, 285 해석)
 */
export function settleSpoilage(
  lot: { readonly item: string; readonly age: AgeState },
  nowMs: number,
  preservePm: PreservePm,
  defOf: (id: string) => SpoilDef | undefined,
): SpoilOutcome {
  let item = lot.item;
  let age = lot.age;
  let changedAt: number | null = null;
  for (let step = 0; step < SPOIL_STEPS; step++) {
    const perish = defOf(item)?.perish;
    const at = perish ? spoilAtMs(age, perish.shelfLifeMs, preservePm) : null;
    if (!perish || at === null || at > nowMs) break;
    const target = defOf(perish.spoilsTo);
    if (!target?.enabled) return { kind: "disposed", atMs: at };
    item = perish.spoilsTo;
    age = { agedMs: 0, atMs: at };
    changedAt = at;
  }
  const settled = settleAge(age, nowMs, preservePm);
  return changedAt === null
    ? { kind: "same", age: settled }
    : { kind: "changed", item, age: settled, atMs: changedAt };
}

// ── 자동 물약(D-510) ────────────────────────────────

/** HP가 문턱(‰) 아래인가(최대 HP가 0 이하면 거짓). 문턱은 유닛 AI 전술 설정(D-5039), 출발값은 설정 칸 */
export function belowPotionThreshold(hp: number, maxHp: number, thresholdPm: number): boolean {
  if (maxHp <= 0) return false;
  return hp * 1000 < maxHp * thresholdPm;
}

/**
 * 모자란 HP를 가장 덜 넘치게 채우는 물약(D-510 "HP 문턱 + 알맞은 물약"): 모자란 만큼 이상 채우는 것 가운데 가장 작은 것, 없으면 가장 많이
 * 채우는 것. 같으면 앞 후보(부르는 쪽 차례 — 서버는 칸 ID 차례). 채우는 양이 0 이하인 후보는 빼고, 없으면 null
 */
export function pickPotion<T extends { readonly heal: number }>(
  missing: number,
  candidates: readonly T[],
): T | null {
  let covering: T | null = null;
  let largest: T | null = null;
  for (const candidate of candidates) {
    if (candidate.heal <= 0) continue;
    if (candidate.heal >= missing && (covering === null || candidate.heal < covering.heal))
      covering = candidate;
    if (largest === null || candidate.heal > largest.heal) largest = candidate;
  }
  return covering ?? largest;
}

// ── 소모품 효과(D-501) ──────────────────────────────

/** 유닛에 걸린 효과 하나(실제 시간으로 끝난다) */
export interface ItemBuff {
  readonly effect: string;
  readonly value: number;
  readonly untilMs: number;
  /** 배타 묶음(효과 사전 exclusive). 없으면 null */
  readonly group: string | null;
  /** 건 아이템 */
  readonly item: string;
}

/** 쓰려는 효과 줄 하나(효과량을 굴린 뒤) */
export interface IncomingEffect {
  readonly effect: string;
  readonly value: number;
  readonly untilMs: number;
  readonly group: string | null;
}

export type EffectPlan =
  | {
      readonly ok: true;
      /** 쓴 뒤 걸린 효과(끝난 것은 빠진다) */
      readonly next: readonly ItemBuff[];
      /** 확인 뒤 사라진 다른 효과 */
      readonly replaced: readonly string[];
      /** 지금 것이 더 높아 그대로 둔 줄(효과 ID) */
      readonly kept: readonly string[];
    }
  /** not_better = 바뀌는 것이 없음(낭비 막기), confirm_replace = 같은 묶음의 다른 효과가 사라짐(확인 창, effects = 사라질 효과) */
  | {
      readonly ok: false;
      readonly code: "not_better" | "confirm_replace";
      readonly effects: readonly string[];
    };

/**
 * D-501: 같은 효과는 높은 값만(새 값이 더 높을 때만 바꾼다), 같은 배타 묶음의 다른 효과는 확인 뒤 새 것으로. 바뀌는 줄이 하나도 없으면
 * 쓰지 않는다. auto(자동 사용)는 다른 효과를 바꾸지 않는다(판단식은 기획 287) — 그 줄은 바뀌지 않는 줄로 친다
 */
export function planEffects(
  active: readonly ItemBuff[],
  incoming: readonly IncomingEffect[],
  item: string,
  nowMs: number,
  options: { readonly confirm: boolean; readonly auto: boolean },
): EffectPlan {
  let next = active.filter((entry) => entry.untilMs > nowMs);
  const replaced: string[] = [];
  const kept: string[] = [];
  const needsConfirm: string[] = [];
  let improved = 0;
  for (const line of incoming) {
    const same = next.find((entry) => entry.effect === line.effect);
    if (same && same.value >= line.value) {
      kept.push(line.effect);
      continue;
    }
    const rivals =
      line.group === null
        ? []
        : next.filter((entry) => entry.group === line.group && entry.effect !== line.effect);
    if (rivals.length > 0) {
      if (options.auto) {
        kept.push(line.effect);
        continue;
      }
      if (!options.confirm) {
        needsConfirm.push(...rivals.map((entry) => entry.effect));
        continue;
      }
      replaced.push(...rivals.map((entry) => entry.effect));
      next = next.filter((entry) => !rivals.includes(entry));
    }
    next = [
      ...next.filter((entry) => entry.effect !== line.effect),
      { effect: line.effect, value: line.value, untilMs: line.untilMs, group: line.group, item },
    ];
    improved += 1;
  }
  if (needsConfirm.length > 0)
    return { ok: false, code: "confirm_replace", effects: [...new Set(needsConfirm)].toSorted() };
  if (improved === 0) return { ok: false, code: "not_better", effects: kept };
  return {
    ok: true,
    next: next.toSorted((a, b) => (a.effect < b.effect ? -1 : a.effect > b.effect ? 1 : 0)),
    replaced,
    kept,
  };
}
