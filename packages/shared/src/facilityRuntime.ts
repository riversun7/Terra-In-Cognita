// 건물 짓기·레벨업·노화·수리 셈 — 기획 49 N50·M14·M15·N54, D-171·D-508·D-509·D-514(351), docs/adr/2026-11-07-buildings-runtime.md.
// 서버(apps/server/src/facilities/)와 경제 화면(미리 셈)이 같은 함수를 쓴다. 정수로만 셈한다(√는 명세가 정확히 정한 Math.sqrt).
// - 상태(옛 경제 문서 ✅, N50): 70% 미만 손상, 30% 미만 기능 정지, 0% 폐허. 상태 값은 백만분율(ppm) 정수다: 분마다 조금씩 닳아
//   ‰로 적으면 한 번의 닳음이 0으로 버려진다.
// - 노화(D-509): 쓰지 않아도 가득에서 30%까지 idleDecayMs에 걸쳐 고르게 닳고 30%에서 멈춘다. 쓰면(일하는 계약·수리 작업) 하루
//   useWearPmPerDay씩 더 닳고, 이 닳음은 30% 아래로도 내려간다(작동 불가).
// - 짓기·레벨업(N50·M14): 재료·시간은 @terra/shared/facilityBuild(buildCostAt·buildTimeAt). 일꾼(건축가) 하나당 builderCutPm 단축,
//   최대 builderCutMaxPm(옛 ConstructionEngine.accelerate 일꾼당 20% + 옛 경제 문서 "최대 50%").
// - 수리(N50·D-171, 옛 building_core_routes.js /repair): 한 번에 최대 HP의 repairStepPm까지, 재료 = 지금 레벨 건설 재료 × (고친 양 ÷ 최대)
//   올림(옛 Math.ceil(amount × ratio)), 노동 필요. 시간 = 지금 레벨 건설 시간 × (고친 양 ÷ 최대), 일꾼 단축은 짓기와 같다 [임시].
// - 장비 수리 시간(D-514 351): 기준 × 티어 × (잃은 ÷ 최대) × 장인 보정, 장인 보정 = clamp(10 ÷ (평균 제작 점수 × √유닛 수), 0.3, 2.0)
//   (N50 옛 제작 시간 보정의 모양).
// - 최대 내구도·창고 용량: 기본 × (1 + (레벨 − 1) × 단계)(옛 utils/item/inventory.js 창고 무게 = 기본 × (1 + (레벨 − 1) × 0.2)).

/** 상태 값 단위(가득 = 1,000,000 ppm) */
export const CONDITION_FULL = 1_000_000;

const DAY_MS = 86_400_000;

/** 설정 칸 N50·M15·N54의 규칙(세력·사회 계수표 facilityRuntime 칸) */
export interface FacilityRuntimeRules {
  /** 이보다 낮으면 손상(‰, 옛 경제 문서 70%) */
  readonly damagedPm: number;
  /** 이보다 낮으면 기능 정지(‰, 옛 경제 문서 30%) */
  readonly disabledPm: number;
  /** 쓰지 않을 때 노화가 멈추는 곳(‰, D-509 30%) */
  readonly idleFloorPm: number;
  /** 가득에서 멈추는 곳까지 걸리는 시간(ms, D-509 "1~2주") */
  readonly idleDecayMs: number;
  /** 쓸 때 하루에 더 닳는 양(‰/일, D-509 "사용 시 추가 소모") */
  readonly useWearPmPerDay: number;
  /** 수리 한 번의 최대 회복(‰, N50 "한 번에 최대 HP 10%") */
  readonly repairStepPm: number;
  /** 일꾼(건축가) 하나당 시간 단축(‰) */
  readonly builderCutPm: number;
  /** 일꾼 단축 상한(‰, N50 "최대 50%") */
  readonly builderCutMaxPm: number;
  /** 레벨 하나당 최대 내구도 증가(‰, M15 레벨별 내구도) */
  readonly durabilityLevelStepPm: number;
  /** 레벨 하나당 창고 용량 증가(‰, N50) */
  readonly storageLevelStepPm: number;
  /** 장비 수리 기준 시간(ms, D-514 351 · N54 수리 장인 시간) */
  readonly equipRepairBaseMs: number;
  /** 장인 보정의 분자(N50 "10 ÷ (평균 스탯 × √유닛 수)"의 10) */
  readonly craftTimeScale: number;
  /** 장인 보정 하한·상한(‰, N50 clamp 0.3·2.0) */
  readonly craftTimeMinPm: number;
  readonly craftTimeMaxPm: number;
}

/**
 * 출발값. 문턱·단축·용량·장인 보정은 옛 값이고, 노화 기간(1~2주의 가운데 10일)·사용 닳음·레벨별 내구도 단계·장비 수리 기준 시간은 [임시]
 * (설정 칸에서 고친다)
 */
export const OLD_FACILITY_RUNTIME_RULES: FacilityRuntimeRules = {
  damagedPm: 700,
  disabledPm: 300,
  idleFloorPm: 300,
  idleDecayMs: 10 * DAY_MS,
  useWearPmPerDay: 70,
  repairStepPm: 100,
  builderCutPm: 200,
  builderCutMaxPm: 500,
  durabilityLevelStepPm: 200,
  storageLevelStepPm: 200,
  equipRepairBaseMs: 600_000,
  craftTimeScale: 10,
  craftTimeMinPm: 300,
  craftTimeMaxPm: 2000,
};

/** 팩 시설 칸 범위(@terra/content 스키마가 이 값을 쓴다) */
export const FACILITY_RUNTIME_LIMITS = {
  /** 2차맵 배치 칸 수(가로·세로) */
  footprint: { min: 1, max: 32 },
  /** 레벨 1 최대 내구도(M15) */
  durability: { min: 1, max: 1_000_000 },
  /** 레벨 1 창고 용량(kg, N50) */
  storageKg: { min: 1, max: 10_000_000 },
} as const;

/** 상태 이름(옛 경제 문서 문턱) */
export type ConditionState = "ok" | "damaged" | "disabled" | "ruin";

const pmToPpm = (pm: number): number => Math.max(0, Math.min(1000, Math.floor(pm))) * 1000;

export function conditionStateOf(ppm: number, rules: FacilityRuntimeRules): ConditionState {
  if (ppm <= 0) return "ruin";
  if (ppm < pmToPpm(rules.disabledPm)) return "disabled";
  if (ppm < pmToPpm(rules.damagedPm)) return "damaged";
  return "ok";
}

/** 기능하나(30% 이상) */
export function conditionWorks(ppm: number, rules: FacilityRuntimeRules): boolean {
  return ppm >= pmToPpm(rules.disabledPm) && ppm > 0;
}

/** 0 이상 정수 ms(틀린 값은 0) */
const span = (ms: number): bigint => (Number.isSafeInteger(ms) && ms > 0 ? BigInt(ms) : 0n);

/**
 * 시각이 흐른 뒤의 상태(ppm): 노화(멈추는 곳 위에서만) → 사용 닳음(멈추지 않음, 0까지). 짧게 나눠 부르면(서버는 분마다) 차례 차이가 무시된다
 */
export function advanceCondition(
  ppm: number,
  elapsedMs: number,
  inUse: boolean,
  rules: FacilityRuntimeRules,
): number {
  const elapsed = span(elapsedMs);
  if (elapsed === 0n || ppm <= 0) return Math.max(0, ppm);
  let value = BigInt(Math.min(CONDITION_FULL, Math.floor(ppm)));
  const floor = BigInt(pmToPpm(rules.idleFloorPm));
  const decayMs = span(rules.idleDecayMs);
  if (value > floor && decayMs > 0n) {
    const idle = ((BigInt(CONDITION_FULL) - floor) * elapsed) / decayMs;
    value = value - idle < floor ? floor : value - idle;
  }
  if (inUse) {
    const use = (BigInt(pmToPpm(rules.useWearPmPerDay)) * elapsed) / BigInt(DAY_MS);
    value = value - use < 0n ? 0n : value - use;
  }
  return Number(value);
}

/** 상태 값이 그 문턱(‰)에 닿는 데 걸리는 쓰지 않은 시간(ms). 이미 아래거나 노화가 거기까지 가지 않으면 null(화면 안내) */
export function idleMsUntil(ppm: number, targetPm: number, rules: FacilityRuntimeRules): number | null {
  const target = pmToPpm(targetPm);
  const floor = pmToPpm(rules.idleFloorPm);
  if (ppm <= target || target < floor || rules.idleDecayMs <= 0) return null;
  const perMs = (CONDITION_FULL - floor) / rules.idleDecayMs;
  return Math.ceil((ppm - target) / perMs);
}

/** 기본 × (1 + (레벨 − 1) × 단계‰ ÷ 1000), 내림 */
function levelScaled(base: number, level: number, stepPm: number): number {
  if (!Number.isSafeInteger(base) || base <= 0) return 0;
  const lv = Math.max(1, Math.floor(level));
  return Number((BigInt(base) * BigInt(1000 + (lv - 1) * Math.max(0, Math.floor(stepPm)))) / 1000n);
}

/** 레벨 L의 최대 내구도(M15) */
export function maxDurabilityAt(base: number, level: number, rules: FacilityRuntimeRules): number {
  return levelScaled(base, level, rules.durabilityLevelStepPm);
}

/** 레벨 L의 창고 용량(kg, N50) */
export function storageCapacityAt(baseKg: number, level: number, rules: FacilityRuntimeRules): number {
  return levelScaled(baseKg, level, rules.storageLevelStepPm);
}

/** 상태 값 → 내구도 점(내림) */
export function durabilityPoints(ppm: number, max: number): number {
  if (max <= 0 || ppm <= 0) return 0;
  return Number((BigInt(Math.floor(ppm)) * BigInt(max)) / BigInt(CONDITION_FULL));
}

/** 일꾼 수로 줄어드는 몫(‰) */
export function builderCutPm(units: number, rules: FacilityRuntimeRules): number {
  const n = Math.max(0, Math.floor(units));
  return Math.min(Math.max(0, rules.builderCutMaxPm), n * Math.max(0, rules.builderCutPm));
}

/** 일꾼 단축을 넣은 시간(ms, 반올림) */
export function withBuilders(ms: number, units: number, rules: FacilityRuntimeRules): number {
  const base = span(ms);
  const keep = BigInt(1000 - builderCutPm(units, rules));
  return Number((2n * base * keep + 1000n) / 2000n);
}

/** 수리 한 번(steps 번 이어서)으로 고칠 양(ppm). 가득이면 0 */
export function repairRestorePpm(ppm: number, steps: number, rules: FacilityRuntimeRules): number {
  const missing = Math.max(0, CONDITION_FULL - Math.max(0, Math.floor(ppm)));
  const step = pmToPpm(rules.repairStepPm);
  return Math.min(missing, Math.max(0, Math.floor(steps)) * step);
}

/** 재료 한 줄(아이템 ID·묶음 수량) */
export interface RuntimeStack {
  readonly item: string;
  readonly qty: number;
}

/** 수리 재료: 줄마다 ⌈수량 × 고친 양 ÷ 가득⌉(옛 Math.ceil(amount × ratio)), 0인 줄은 뺀다 */
export function repairMaterialsFor(cost: readonly RuntimeStack[], restorePpm: number): RuntimeStack[] {
  const restore = BigInt(Math.max(0, Math.min(CONDITION_FULL, Math.floor(restorePpm))));
  const full = BigInt(CONDITION_FULL);
  return cost
    .map((stack) => ({
      item: stack.item,
      qty: Number((BigInt(Math.max(0, Math.floor(stack.qty))) * restore + full - 1n) / full),
    }))
    .filter((stack) => stack.qty > 0);
}

/** 수리 시간: 건설 시간 × 고친 양 ÷ 가득(반올림) → 일꾼 단축 */
export function repairTimeMs(
  buildMs: number,
  restorePpm: number,
  units: number,
  rules: FacilityRuntimeRules,
): number {
  const restore = BigInt(Math.max(0, Math.min(CONDITION_FULL, Math.floor(restorePpm))));
  const full = BigInt(CONDITION_FULL);
  const raw = Number((2n * span(buildMs) * restore + full) / (2n * full));
  return withBuilders(raw, units, rules);
}

/** 장인 보정(‰) = clamp(눈금 × 1000 ÷ (평균 제작 점수 × √유닛 수), 하한, 상한). 점수가 0이면 상한 */
export function craftTimePm(avgScore: number, units: number, rules: FacilityRuntimeRules): number {
  const n = Math.max(1, Math.floor(units));
  if (!(avgScore > 0)) return rules.craftTimeMaxPm;
  const raw = Math.round((rules.craftTimeScale * 1000) / (avgScore * Math.sqrt(n)));
  return Math.min(rules.craftTimeMaxPm, Math.max(rules.craftTimeMinPm, raw));
}

/** 장비 수리 시간(ms) = 기준 × max(1, 티어) × 잃은 ÷ 최대 × 장인 보정‰ ÷ 1000(반올림). 잃은 것이 없으면 0 */
export function equipmentRepairMs(
  input: {
    readonly tier: number;
    readonly lost: number;
    readonly maxDurability: number;
    readonly avgScore: number;
    readonly units: number;
  },
  rules: FacilityRuntimeRules,
): number {
  if (input.lost <= 0 || input.maxDurability <= 0) return 0;
  const tier = BigInt(Math.max(1, Math.floor(input.tier)));
  const lost = BigInt(Math.min(Math.floor(input.lost), Math.floor(input.maxDurability)));
  const correction = BigInt(craftTimePm(input.avgScore, input.units, rules));
  const den = BigInt(Math.floor(input.maxDurability)) * 1000n;
  return Number((2n * span(rules.equipRepairBaseMs) * tier * lost * correction + den) / (2n * den));
}
