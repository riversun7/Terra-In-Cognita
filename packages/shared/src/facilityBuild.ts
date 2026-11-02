// 시설 짓기·레벨 올림의 재료·시간·유지비 — 기획 49 M14·D-508, 옛 seeds/building_seed.js(buildCost·buildTime·buildMaintenance).
// 콘텐츠 팩 facilities.build(레벨 구간별 재료)와 설정 칸 M14(시간·유지비)로 셈한다. 팩 형식 검사(@terra/content), 서버, 건물 편집기
// 화면(/dev/buildings, docs/adr/2026-11-02-building-editor.md)이 같은 함수를 쓴다. 정수(BigInt)로만 셈한다(실수 없음).
// - 재료: 레벨 L에는 from ≤ L인 마지막 구간의 재료를 쓴다(D-508: 처음 레벨은 1차 원자재, 그 위는 가공품). 줄마다
//   round(qty × L² × mulPm ÷ 1000)(옛 Base × Tier² × 분류 배율, 옛 "티어" = 새 시설 레벨로 읽은 것은 기술 해석 ⏳).
// - 시간: round(Σ 재료 한 단위 무게(kg) × qty × L² × mulPm ÷ 1000 × M14 kg당 ms × 레벨 계수‰ ÷ 1000)(옛 무게 합 × 10초 × 티어 계수.
//   옛 식처럼 줄마다 반올림하기 전 수량으로 셈한다). 무게가 없는 아이템은 0으로 셈하고 알린다.
// - 유지비: max(최소, round(Σ qty × L² × mulPm ÷ 1000 × M14 ‰ ÷ 1000))(옛 하루 비용 단위 합의 1%, 최소 1). 무엇으로 내는지는 정하지 않았다.
// 지금 시설을 짓거나 레벨을 올리는 곳은 없다(시설은 시나리오 처음부터 있다). 이 식은 편집기 미리 보기와 앞으로의 짓기가 쓴다.

/** 시설 레벨 상한(D-5001: 시설 Lv1~5) */
export const FACILITY_LEVEL_MAX = 5;

/** 건설 칸 범위(팩 스키마와 같다, @terra/content가 이 값을 쓴다) */
export const FACILITY_BUILD_LIMITS = {
  qty: { min: 1, max: 1_000_000 },
  mulPm: { min: 0, max: 100_000 },
  /** 구간 하나의 재료 줄 수 */
  materials: 16,
  /** 구간 수(레벨마다 하나까지) */
  levels: FACILITY_LEVEL_MAX,
} as const;

/** 재료 한 줄(아이템 ID + 묶음 수량. 레시피와 같은 묶음 단위) */
export interface BuildStackJson {
  readonly item: string;
  readonly qty: number;
}

/** 레벨 구간 하나: from 레벨부터(다음 구간 앞까지) 이 재료를 쓴다 */
export interface BuildLevelJson {
  readonly from: number;
  readonly materials: readonly BuildStackJson[];
}

/** 팩 facilities.build 한 칸(JSON 모양) */
export interface FacilityBuildJson {
  /** 옛 분류 배율(‰, PRIMARY 0.8 → 800, SECONDARY 1.2 → 1200) */
  readonly mulPm: number;
  readonly levels: readonly BuildLevelJson[];
}

/** 설정 칸 M14의 시간·유지비 규칙(세력·사회 계수표 facilityBuild 칸) */
export interface FacilityBuildRules {
  /** 재료 1kg당 건설 시간(ms). 옛 10초 */
  readonly msPerKg: number;
  /** 레벨 계수(‰, 번호 = 레벨 − 1). 옛 티어 계수 T1 1.0·T2 1.5·T3 2.5 */
  readonly timeFactorPm: readonly number[];
  /** 하루 유지비 = 비용 단위 합의 ‰. 옛 1% = 10 */
  readonly upkeepPm: number;
  /** 하루 유지비 최소. 옛 1 */
  readonly upkeepMin: number;
}

/**
 * 옛 값(49 M14 출발값). L4·L5 계수는 옛 표에 없어(옛 건물은 T3까지, 옛 코드는 없는 티어를 1.0으로 셈) L3 값을 그대로 둔 [임시]이다
 */
export const OLD_FACILITY_BUILD_RULES: FacilityBuildRules = {
  msPerKg: 10_000,
  timeFactorPm: [1000, 1500, 2500, 2500, 2500],
  upkeepPm: 10,
  upkeepMin: 1,
};

/** 레벨 L에 쓰는 구간(from ≤ L인 마지막 구간). 구간이 없으면 undefined */
export function buildLevelAt(build: FacilityBuildJson, level: number): BuildLevelJson | undefined {
  let found: BuildLevelJson | undefined;
  for (const band of build.levels) if (band.from <= level) found = band;
  return found;
}

/** n ÷ d 반올림(0 이상, 반은 올림 — 옛 Math.round와 같다) */
const roundDiv = (n: bigint, d: bigint): bigint => (2n * n + d) / (2n * d);

/** 정수 칸을 BigInt로(정수가 아니거나 음수면 0: 검사를 통과한 자료라 오지 않는다) */
const big = (value: number): bigint => (Number.isSafeInteger(value) && value > 0 ? BigInt(value) : 0n);

/** 레벨 L(짓기 = 1, 올림 = 올라갈 레벨)의 재료. 줄마다 round(qty × L² × mulPm ÷ 1000) */
export function buildCostAt(build: FacilityBuildJson, level: number): BuildStackJson[] {
  const band = buildLevelAt(build, level);
  if (!band) return [];
  const scale = big(level) * big(level) * big(build.mulPm);
  return band.materials.map((stack) => ({
    item: stack.item,
    qty: Number(roundDiv(big(stack.qty) * scale, 1000n)),
  }));
}

/** 재료 한 단위(묶음)의 무게(g). 모르면 undefined */
export type BuildWeightOf = (item: string) => number | undefined;

/** 레벨 L의 건설 시간(ms)과 무게를 몰라 0으로 셈한 아이템 */
export function buildTimeAt(
  build: FacilityBuildJson,
  level: number,
  weightOf: BuildWeightOf,
  rules: FacilityBuildRules,
): { readonly ms: number; readonly unknownWeight: readonly string[] } {
  const band = buildLevelAt(build, level);
  if (!band) return { ms: 0, unknownWeight: [] };
  const unknown: string[] = [];
  let grams = 0n;
  for (const stack of band.materials) {
    const weight = weightOf(stack.item);
    if (weight === undefined) {
      if (!unknown.includes(stack.item)) unknown.push(stack.item);
      continue;
    }
    grams += big(weight) * big(stack.qty);
  }
  const factor = big(rules.timeFactorPm[level - 1] ?? rules.timeFactorPm.at(-1) ?? 0);
  // g × L² × mulPm(‰) × ms/kg × 계수(‰) ÷ (1000 × 1000 g/kg × 1000)
  const total = grams * big(level) * big(level) * big(build.mulPm) * big(rules.msPerKg) * factor;
  return { ms: Number(roundDiv(total, 1_000_000_000n)), unknownWeight: unknown };
}

/** 레벨 L의 하루 유지비(비용 단위). max(최소, round(Σ qty × L² × mulPm ÷ 1000 × ‰ ÷ 1000)) */
export function buildUpkeepAt(build: FacilityBuildJson, level: number, rules: FacilityBuildRules): number {
  const band = buildLevelAt(build, level);
  if (!band) return 0;
  let units = 0n;
  for (const stack of band.materials) units += big(stack.qty);
  const value = Number(
    roundDiv(units * big(level) * big(level) * big(build.mulPm) * big(rules.upkeepPm), 1_000_000n),
  );
  return Math.max(rules.upkeepMin, value);
}
