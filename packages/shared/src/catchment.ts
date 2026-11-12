// 도시 배후지(자원 점유 영역)와 1차 생산 여섯 원자재의 땅 — docs/adr/2026-11-11-city-catchment.md.
// 사용자 지적(2026-11-11, 원문) "npc세력의 도시 배치를 어느정도 벌려야 한다. 너무 가까우면 도시를 유지하기 위한 주변 지형자원의 점유 영역이 겹쳐
// 도시간의 자원경쟁으로 서로 발전하지 못한다. … 6가지 원자재의 획득방식 구현이 중요하다."
// - 1차맵 칸(= 2차맵 하나)의 행성 값으로 그 칸에 여섯 원자재가 있는지 본다(있음/없음 비트). 문턱은 NPC 시작 도시 채집 시설 고르기와 같은 설정 칸
//   (npc_seed_lumber_forest_pct·npc_seed_mine_height_m·npc_seed_farm_temp_c·npc_seed_farm_rain_mm — 새 수치를 만들지 않는다).
//   바뀜 (2026-11-12, 기획 D-533): 광석은 있음/없음 대신 고도 몫(oreSharePm), 자리 점수는 몫으로 센다(cellSharesPm·shareCoveragePm, 질문 1027 다).
// - 도시 배후지 = 도시 2차맵에서 반경 R(1차맵 칸, 설정 칸 city_catchment_radius_cells) 안의 칸들. 배후지 덮임(‰) = 원자재마다 "배후지 칸 가운데
//   그 원자재가 있는 칸 몫"을 그 도시가 쓰는 시설 수로 가중 평균한 값이다. 세계 배치(서버 world/citySites.ts)와 화면(/dev/world-layout 덮개)이
//   같은 함수를 쓴다.
// - 겹친 배후지(다툼): 한 칸은 그 칸에서 가장 가까운 도시 하나의 것이다(같으면 작은 ID). 겹친 도시들은 칸을 나눠 가져 덮임이 준다.
// 정수만 쓴다(판정 코드 규칙). 다른 내부 패키지를 가져오지 않는다.

/** 여섯 원자재(1차 생산 여섯 가지의 차례 — docs/adr/2026-11-11-production-six.md 표) */
export const CATCHMENT_MATERIALS = ["ore", "wood", "herb", "crop", "livestock", "fish"] as const;
export type CatchmentMaterial = (typeof CATCHMENT_MATERIALS)[number];

/** 원자재 → 그 원자재를 맡는 채집 시설(팩 시설 ID) */
export const MATERIAL_FACILITY: Readonly<Record<CatchmentMaterial, string>> = {
  ore: "mine",
  wood: "lumber_camp",
  herb: "herb_field",
  crop: "farm",
  livestock: "ranch",
  fish: "fishing_spot",
};

/** 시설 ID → 원자재(채집 시설이 아니면 undefined) */
export function materialOfFacility(facility: string): CatchmentMaterial | undefined {
  return CATCHMENT_MATERIALS.find((material) => MATERIAL_FACILITY[material] === facility);
}

/** 원자재 비트(cellMaterials의 값) */
export const MATERIAL_BIT: Readonly<Record<CatchmentMaterial, number>> = {
  ore: 1,
  wood: 2,
  herb: 4,
  crop: 8,
  livestock: 16,
  fish: 32,
};

/** 원자재를 보는 칸 값(행성 값 PlanetCellValues의 일부) */
export interface CatchmentLand {
  /** 숲 밀도 0 ~ 255 */
  readonly forest: number;
  readonly elevationM: number;
  readonly temperatureC: number;
  readonly precipitationMm: number;
  /** 물 비트(바다 1·호수 2·강 4·해안 8) */
  readonly water: number;
}

/** 문턱(설정 칸 worldSeed — NPC 시작 도시 채집 시설 고르기와 같은 칸) */
export interface CatchmentThresholds {
  readonly lumberMinForestPct: number;
  readonly mineMinHeightM: number;
  readonly farmMinTempC: number;
  readonly farmMinRainMm: number;
}

/** 바다·호수 비트(그 칸 땅이 물에 잠긴 칸 — 농사·목축·채광·벌목은 없다) */
const DEEP_WATER = 1 | 2;

/**
 * 칸 하나에 있는 원자재 비트:
 * - 목재: 숲 % ≥ 벌목장 문턱(물 잠긴 칸 아님). 광석: 칸 고도 ≥ 산지 고도(산지 광석 — 높은 티어가 나오는 칸. 하위 광석의 몫은 oreSharePm).
 *   작물: 기온·강수가 농장 문턱 이상(물 잠긴 칸 아님).
 * - 약초: 숲이나 농사지을 땅(NPC 씨앗의 약초원 규칙과 같다). 축산물: 농사지을 땅(목장 규칙과 같다). 어류: 물 비트가 하나라도 있는 칸.
 */
export function cellMaterials(land: CatchmentLand | undefined, t: CatchmentThresholds): number {
  if (!land) return 0;
  const drowned = (land.water & DEEP_WATER) !== 0;
  let bits = 0;
  const wood = !drowned && land.forest * 100 >= t.lumberMinForestPct * 255;
  const crop = !drowned && land.temperatureC >= t.farmMinTempC && land.precipitationMm >= t.farmMinRainMm;
  if (!drowned && land.elevationM >= t.mineMinHeightM) bits |= MATERIAL_BIT.ore;
  if (wood) bits |= MATERIAL_BIT.wood;
  if (wood || crop) bits |= MATERIAL_BIT.herb;
  if (crop) bits |= MATERIAL_BIT.crop | MATERIAL_BIT.livestock;
  if (land.water !== 0) bits |= MATERIAL_BIT.fish;
  return bits;
}

// ── 광석 고도 몫(기획 D-533 — 질문 1020·1064 "석재·구리는 어디서나 조금(고도에 따른 몫), 높은 티어 광석은 산지", D-507 "하위 광석은 건축 재료") ──
// - 낮은 땅도 광석(잡석·석재·구리 = 하위 티어)을 조금 캔다. 몫(‰) = 고도의 꺾은선: 0m 이하 = oreShareLowPm, 언덕 고도(oreShareHillM) =
//   oreShareHillPm, 산지 고도(mineMinHeightM, 옛 광산 문턱) 이상 = 1000. 사이는 곧게 잇는다(내림). 바다·호수에 잠긴 칸은 0.
// - 높은 티어 광석(oreLowTierMax 위 — 철부터)은 산지 칸에서만 나온다(highOrePm). 광석 비트(MATERIAL_BIT.ore)는 이제 "산지 광석"이다.
// - 2차맵 생성기 판은 올리지 않는다(질문 1064 나): 1차맵 칸 몫만 바꾸고 2차맵 오브젝트는 그대로다.

/** 광석 고도 몫 규칙(세계 씨앗 설정 칸 ore_share_* [임시] + 산지 고도 npc_seed_mine_height_m) */
export interface OreShareRules {
  /** 0m 이하(해수면 땅)의 광석 몫(‰) */
  readonly oreShareLowPm: number;
  /** 언덕 고도(m) */
  readonly oreShareHillM: number;
  /** 언덕 고도의 광석 몫(‰) */
  readonly oreShareHillPm: number;
  /** 산지 고도(m) — 이 이상이면 몫 1000이고 높은 티어 광석이 나온다(옛 NPC 광산 문턱 칸) */
  readonly mineMinHeightM: number;
}

/** 칸 원자재 판정 규칙(문턱 + 광석 고도 몫) — 세계 씨앗 계수표가 그대로 맞는다 */
export type CatchmentLandRules = CatchmentThresholds & OreShareRules;

/** 두 점 (x0, y0)·(x1, y1)을 곧게 이은 선의 x 값(내림). x1 ≤ x0이면 y1 */
function lerpDown(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 <= x0) return y1;
  return y0 + Math.floor(((y1 - y0) * (x - x0)) / (x1 - x0));
}

/** 0 ~ 1000으로 자른 정수 */
const clampPm = (value: number): number => Math.min(1000, Math.max(0, Math.trunc(value)));

/** 칸의 광석 몫(‰, 0 ~ 1000): 고도 꺾은선(위 머리 주석). 칸이 없거나 바다·호수에 잠긴 칸은 0 */
export function oreSharePm(land: CatchmentLand | undefined, rules: OreShareRules): number {
  if (!land || (land.water & DEEP_WATER) !== 0) return 0;
  const low = clampPm(rules.oreShareLowPm);
  const mountainM = Math.trunc(rules.mineMinHeightM);
  const hillM = Math.min(mountainM, Math.max(0, Math.trunc(rules.oreShareHillM)));
  const hill = Math.max(low, clampPm(rules.oreShareHillPm));
  const elevation = Math.trunc(land.elevationM);
  if (elevation >= mountainM) return 1000;
  if (elevation <= 0) return low;
  if (elevation <= hillM) return clampPm(lerpDown(elevation, 0, low, hillM, hill));
  return clampPm(lerpDown(elevation, hillM, hill, mountainM, 1000));
}

/** 칸 광석 가운데 높은 티어가 나오는 몫(‰): 산지 칸(광석 비트)이면 1000, 아니면 0 */
export function highOrePm(land: CatchmentLand | undefined, rules: CatchmentThresholds): number {
  return (cellMaterials(land, rules) & MATERIAL_BIT.ore) === 0 ? 0 : 1000;
}

/** 원자재마다 칸 몫(‰) */
export type MaterialShares = Readonly<Record<CatchmentMaterial, number>>;

/**
 * 칸 하나의 원자재 몫(‰):
 * - supply(채집 다툼의 칸 재고 상한): 광석 = 고도 몫, 나머지 = 비트(있으면 1000).
 * - site(시작 도시 자리 점수 — 질문 1027 다 "있음/없음 대신 몫"): supply에 더해 목재 = 숲 밀도 그대로(0~255 → ‰), 약초 = max(목재 몫, 작물 비트).
 */
export function cellSharesPm(
  land: CatchmentLand | undefined,
  rules: CatchmentLandRules,
  mode: "supply" | "site",
): MaterialShares {
  const bits = cellMaterials(land, rules);
  const bit = (material: CatchmentMaterial) => ((bits & MATERIAL_BIT[material]) === 0 ? 0 : 1000);
  const drowned = !land || (land.water & DEEP_WATER) !== 0;
  const wood =
    mode === "site"
      ? drowned
        ? 0
        : Math.min(1000, Math.floor((Math.max(0, Math.trunc(land.forest)) * 1000) / 255))
      : bit("wood");
  return {
    ore: oreSharePm(land, rules),
    wood,
    herb: mode === "site" ? Math.max(wood, bit("crop")) : bit("herb"),
    crop: bit("crop"),
    livestock: bit("livestock"),
    fish: bit("fish"),
  };
}

/** 칸 몫 목록 → 원자재마다 몫 합(‰ × 칸) */
export function sumShares(list: readonly MaterialShares[]): MaterialShares {
  const out = { ore: 0, wood: 0, herb: 0, crop: 0, livestock: 0, fish: 0 };
  for (const shares of list) for (const material of CATCHMENT_MATERIALS) out[material] += shares[material];
  return out;
}

/**
 * 몫으로 센 배후지 덮임(0 ~ 1000‰): 원자재마다 (몫 합 ÷ 배후지 칸 수)를 가중치로 평균한다(내림). 비트 셈(coveragePm)과 같은 꼴이다 —
 * 몫이 모두 0·1000이면 같은 값이다
 */
export function shareCoveragePm(sums: MaterialShares, cells: number, weights: MaterialWeights): number {
  if (cells <= 0) return 0;
  let sum = 0;
  let weightSum = 0;
  for (const material of CATCHMENT_MATERIALS) {
    const weight = Math.max(0, Math.trunc(weights[material] ?? 0));
    if (weight === 0) continue;
    weightSum += weight;
    sum += weight * Math.min(1000, Math.floor(Math.max(0, sums[material]) / cells));
  }
  return weightSum === 0 ? 0 : Math.floor(sum / weightSum);
}

/** 원자재마다 칸 수 */
export type MaterialCounts = Readonly<Record<CatchmentMaterial, number>>;

/** 비트 목록 → 원자재마다 칸 수 */
export function countMaterials(bitsList: readonly number[]): MaterialCounts {
  const out = { ore: 0, wood: 0, herb: 0, crop: 0, livestock: 0, fish: 0 };
  for (const bits of bitsList)
    for (const material of CATCHMENT_MATERIALS) if ((bits & MATERIAL_BIT[material]) !== 0) out[material] += 1;
  return out;
}

/** 원자재마다 가중치(그 도시가 쓰는 채집 시설 수). 0이면 보지 않는다 */
export type MaterialWeights = Readonly<Partial<Record<CatchmentMaterial, number>>>;

/** 시설 ID → 수(국가 시작 값 facilities) → 원자재 가중치. 채집 시설이 하나도 없으면 농장·벌목장·광산 1씩(옛 씨앗 기본) */
export function weightsOfFacilities(facilities: Readonly<Record<string, number>>): MaterialWeights {
  const out: Partial<Record<CatchmentMaterial, number>> = {};
  let any = false;
  for (const material of CATCHMENT_MATERIALS) {
    const count = Math.max(0, Math.trunc(facilities[MATERIAL_FACILITY[material]] ?? 0));
    if (count > 0) {
      out[material] = count;
      any = true;
    }
  }
  return any ? out : { crop: 1, wood: 1, ore: 1 };
}

/**
 * 배후지 덮임(0 ~ 1000‰): 원자재마다 (그 원자재 칸 수 × 1000 ÷ 배후지 칸 수)를 가중치로 평균한다(내림). 칸이 없거나 가중치가 모두 0이면 0
 */
export function coveragePm(counts: MaterialCounts, cells: number, weights: MaterialWeights): number {
  if (cells <= 0) return 0;
  let sum = 0;
  let weightSum = 0;
  for (const material of CATCHMENT_MATERIALS) {
    const weight = Math.max(0, Math.trunc(weights[material] ?? 0));
    if (weight === 0) continue;
    weightSum += weight;
    sum += weight * Math.floor((Math.min(cells, counts[material]) * 1000) / cells);
  }
  return weightSum === 0 ? 0 : Math.floor(sum / weightSum);
}

/** 배후지 설정 칸(세계 씨앗 계수표 worldSeed — docs/adr/2026-11-11-city-catchment.md) */
export interface CatchmentRules {
  /** 배후지 반경(1차맵 칸). 0이면 배후지 규칙을 쓰지 않는다(옛 배치 — 수도 둘레 고리 × 걸음) */
  readonly radiusCells: number;
  /** 같은 국가 도시 사이 가장 짧은 거리 = 배후지 지름(2R) × 이 천분율(1000 = 가장자리가 닿아도 됨) */
  readonly sameGapPm: number;
  /** 다른 국가 도시 사이 가장 짧은 거리 = 2R × 이 천분율 */
  readonly foreignGapPm: number;
  /** 지방 도시 자리를 찾는 반경(수도에서 1차맵 칸) */
  readonly searchCells: number;
  /** 수도에서 배후지 지름 하나만큼 멀어질 때마다 점수에서 빼는 덮임(‰) — 나라가 흩어지지 않게 */
  readonly compactPm: number;
}

/** 두 도시 사이 가장 짧은 거리(1/1000칸): 같은 국가 = 2R × sameGapPm, 다른 국가 = 2R × foreignGapPm */
export function cityGapMilli(rules: CatchmentRules, sameNation: boolean): number {
  const pm = sameNation ? rules.sameGapPm : rules.foreignGapPm;
  return Math.max(0, Math.trunc(rules.radiusCells)) * 2 * Math.max(0, Math.trunc(pm));
}

/**
 * 자리 점수 = 덮임 − compactPm × ⌊수도까지 거리 ÷ 배후지 지름⌋(반경 0이면 덮임 그대로). 지름 한 칸 띠 안에서는 거리가 점수를 바꾸지 않는다
 * (같은 땅이 이어지면 가장 가까운 고리에 줄 서지 않고 띠 안에서 고르게 흩어진다)
 */
export function siteScore(
  cover: number,
  fromHomeMilli: number,
  rules: CatchmentRules,
  radiusMilli = Math.max(0, Math.trunc(rules.radiusCells)) * 1000,
): number {
  // 도시마다 반경이 다르면(도시 크기 — "바뀜 (2026-11-12)") 그 도시 배후지 지름을 띠로 쓴다
  const diameter = Math.max(0, Math.trunc(radiusMilli)) * 2;
  if (diameter === 0) return cover;
  return cover - Math.max(0, Math.trunc(rules.compactPm)) * Math.floor(Math.max(0, fromHomeMilli) / diameter);
}

// ── 도시 크기에 따라 넓어지는 배후지(docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)") ──
// 사용자 지적(2026-11-11, 원문) "도시는 주변 영역에서 자원을 채집하여 유지해야하는데 인구와 도시등급이 높을 수록 높은자원과 기술을 요구하여
// 요구 영토범위가 넓어지고, 인근 도시와 인접영토를 경쟁하면 두 도시 모두 자원고갈 문제라고."
// - 요구 넓이(칸) = 인구 × (사람 100명 칸 ÷ 100) × 요구 배율(‰). 요구 배율 = 도시 등급(발전도 → 1~6, 기획 D-137·42 §2.3) 기본 + 걸음 ×
//   (등급 − 1) + 기술 단계 × 기술 몫. 반경 = √(넓이 ÷ π), 아래·위 끝 안. 시뮬·서버 배치·서버 도시 경제·화면이 같은 함수를 쓴다.
// - 두 도시 사이 가장 짧은 거리 = (두 반경 합) × 천분율(같은 국가·다른 국가). 반경이 도시마다 다르니 간격도 다르다(바둑판이 되지 않는다).
// - 채집 다툼과 고갈: 칸마다 원자재마다 재고가 있고 하루마다 로지스틱으로 다시 자란다(재고가 반일 때 가장 많이 자람 = 한 칸이 버티는 양).
//   도시는 요구 넓이에서 칸마다 "버티는 양 × drawPm"을 캐려 한다(혼자면 남는다). 배후지가 겹친 칸은 두 도시가 함께 캐서 버티는 양을 넘고,
//   재고가 줄어 다시 자람도 줄어 두 도시 모두 받는 몫이 떨어진다(고갈). 받은 몫(‰)이 시설 생산 빠르기와 인구 늘리기(구인)를 정한다.

/** 원주율 근사(1000분율) — 넓이 ↔ 반경. 정수 셈만 쓴다 */
const PI_MILLI = 3142;

/** 정수 제곱근(내림). Math.sqrt는 명세가 정확히 정한 값이라 결정적이다 */
export function isqrt(value: number): number {
  if (!(value > 0)) return 0;
  let root = Math.floor(Math.sqrt(value));
  while (root * root > value) root -= 1;
  while ((root + 1) * (root + 1) <= value) root += 1;
  return root;
}

/** 도시 크기 → 요구 배후지 규칙(세계 씨앗 설정 칸 city_catchment_* [임시]) */
export interface CatchmentGrowthRules {
  /** 사람 100명이 요구 배율 1000‰일 때 쓰는 1차맵 칸 수 */
  readonly cellsPerHundred: number;
  /** 도시 등급 1의 요구 배율(‰) */
  readonly gradeNeedBasePm: number;
  /** 도시 등급이 하나 오를 때마다 더하는 요구 배율(‰) — 높은 등급은 높은 티어 자원을 요구한다 */
  readonly gradeNeedStepPm: number;
  /** 기술 단계 하나마다 더하는 요구 배율(‰) */
  readonly techNeedPm: number;
  /** 반경 아래 끝·위 끝(1000분율 칸) */
  readonly minRadiusMilli: number;
  readonly maxRadiusMilli: number;
}

/** 도시 하나의 크기(요구 배후지를 정한다) */
export interface CatchmentCitySize {
  /** 사는 휴먼 수(경비대 포함) */
  readonly population: number;
  /** 도시 등급 1~6(마을~거대도시, @terra/shared/territory cityGrade) */
  readonly grade: number;
  /** 주인 세력 기술 단계 */
  readonly tech: number;
}

/** 요구 배율(‰) = 등급 기본 + 걸음 × (등급 − 1) + 기술 × 기술 몫 */
export function catchmentNeedPm(
  size: Pick<CatchmentCitySize, "grade" | "tech">,
  rules: CatchmentGrowthRules,
): number {
  const grade = Math.min(6, Math.max(1, Math.trunc(size.grade)));
  const tech = Math.max(0, Math.trunc(size.tech));
  return Math.max(
    0,
    Math.trunc(rules.gradeNeedBasePm) +
      Math.trunc(rules.gradeNeedStepPm) * (grade - 1) +
      Math.trunc(rules.techNeedPm) * tech,
  );
}

/** 요구 넓이(1000분율 칸) = 인구 × 사람 100명 칸 × 요구 배율 ÷ 100 */
export function catchmentAreaMilli(size: CatchmentCitySize, rules: CatchmentGrowthRules): number {
  const population = Math.max(0, Math.trunc(size.population));
  return Math.floor(
    (population * Math.max(0, Math.trunc(rules.cellsPerHundred)) * catchmentNeedPm(size, rules)) / 100,
  );
}

/** 요구 반경(1000분율 칸) = √(넓이 ÷ π), 아래 끝 ~ 위 끝 */
export function catchmentRadiusMilli(size: CatchmentCitySize, rules: CatchmentGrowthRules): number {
  const area = catchmentAreaMilli(size, rules);
  // 반경(1000분율) = 1000 × √(넓이칸 ÷ π) = √(넓이(1000분율) × 1000 × 1000 ÷ 3142)
  const radius = isqrt(Math.floor((area * 1_000_000) / PI_MILLI));
  const low = Math.max(0, Math.trunc(rules.minRadiusMilli));
  return Math.min(Math.max(low, Math.trunc(rules.maxRadiusMilli)), Math.max(low, radius));
}

/** 두 도시 사이 가장 짧은 거리(1/1000칸) = (두 반경 합) × 천분율(같은 국가 sameGapPm, 다른 국가 foreignGapPm) */
export function cityPairGapMilli(
  aRadiusMilli: number,
  bRadiusMilli: number,
  sameNation: boolean,
  rules: Pick<CatchmentRules, "sameGapPm" | "foreignGapPm">,
): number {
  const pm = Math.max(0, Math.trunc(sameNation ? rules.sameGapPm : rules.foreignGapPm));
  return Math.floor(((Math.max(0, aRadiusMilli) + Math.max(0, bRadiusMilli)) * pm) / 1000);
}

/** 원자재 재고·다시 자람 규칙(세계 씨앗 설정 칸 city_catchment_* [임시]) */
export interface CatchmentSupplyRules {
  /** 원자재가 있는 칸(100%) 하나의 재고 상한 */
  readonly stockPerCell: number;
  /** 하루 다시 자람 ‰(로지스틱 r: 재고 S → r × S × (상한 − S) ÷ 상한) */
  readonly regrowPm: number;
  /** 재고 0에서도 하루 다시 자라는 양(100% 칸 기준 — 씨가 남는다) */
  readonly regrowFloor: number;
  /** 도시가 요구 넓이에서 칸마다 캐려는 양 = 한 칸이 버티는 양 × 이 천분율(1000 미만이면 혼자서는 남는다) */
  readonly drawPm: number;
}

/** 칸 하나의 재고 상한(그 칸 원자재 몫 ‰) */
export function cellStockCap(capacityPm: number, rules: CatchmentSupplyRules): number {
  return Math.floor(
    (Math.max(0, Math.trunc(rules.stockPerCell)) * Math.min(1000, Math.max(0, capacityPm))) / 1000,
  );
}

/** 하루 다시 자람: 로지스틱 + 바닥(상한 몫만큼). 상한이 0이면 0 */
export function cellRegrow(stock: number, cap: number, rules: CatchmentSupplyRules): number {
  if (cap <= 0) return 0;
  const s = Math.min(cap, Math.max(0, stock));
  const logistic = Math.floor((Math.max(0, Math.trunc(rules.regrowPm)) * s * (cap - s)) / (1000 * cap));
  const floor = Math.floor(
    (Math.max(0, Math.trunc(rules.regrowFloor)) * cap) / Math.max(1, rules.stockPerCell),
  );
  return logistic + floor;
}

/** 100% 칸 하나가 버티는 양(하루, 재고 반일 때 다시 자람 = r × 상한 ÷ 4 + 바닥) */
export function sustainablePerCell(rules: CatchmentSupplyRules): number {
  const cap = Math.max(0, Math.trunc(rules.stockPerCell));
  return cellRegrow(cap >> 1, cap, rules);
}

/**
 * 도시 하나가 원자재 하나를 하루에 캐려는 양 = 요구 넓이(칸) × 버티는 양 × drawPm × (그 원자재 가중치 ÷ 가장 큰 가중치).
 * 가장 많이 쓰는 원자재는 요구 넓이 칸마다 버티는 양의 drawPm만큼 캐고, 덜 쓰는 원자재는 그 비율만큼 덜 캔다
 */
export function materialDemand(
  areaMilli: number,
  weight: number,
  maxWeight: number,
  rules: CatchmentSupplyRules,
): number {
  if (weight <= 0 || maxWeight <= 0) return 0;
  const perCell = sustainablePerCell(rules);
  return Math.floor(
    (Math.max(0, areaMilli) * perCell * Math.max(0, Math.trunc(rules.drawPm)) * Math.min(weight, maxWeight)) /
      (1_000_000 * maxWeight),
  );
}

/** 하루 채집 다툼에 드는 도시 하나 */
export interface SupplyCity {
  readonly id: number;
  /** 배후지 칸(키, 같은 키는 한 번) */
  readonly cells: readonly number[];
  /** 원자재마다 하루에 캐려는 양 */
  readonly demand: Readonly<Partial<Record<CatchmentMaterial, number>>>;
}

/** 도시 하나가 하루에 받은 것 */
export interface SupplyResult {
  /** 원자재마다 받은 양 */
  readonly got: Readonly<Record<CatchmentMaterial, number>>;
  /** 원자재마다 받은 몫(‰, 캐려는 양이 0이면 1000) */
  readonly supplyPm: Readonly<Record<CatchmentMaterial, number>>;
  /** 모든 원자재를 합한 받은 몫(‰, 캐려는 양 합이 0이면 1000) */
  readonly totalPm: number;
  /** 다른 도시 배후지와 겹친 칸 수 */
  readonly sharedCells: number;
}

/** 칸 재고 저장소: 칸 키 → 원자재 여섯의 재고(CATCHMENT_MATERIALS 차례). 처음 보는 칸은 상한으로 채운다 */
export type SupplyStock = Map<number, number[]>;

const emptyMaterials = (fill: number): Record<CatchmentMaterial, number> => ({
  ore: fill,
  wood: fill,
  herb: fill,
  crop: fill,
  livestock: fill,
  fish: fill,
});

/**
 * 하루 채집 다툼(재고를 바꾼다): 원자재마다 도시는 캐려는 양을 제 배후지 칸 가운데 그 원자재가 있는 칸에 재고 상한 비례로 나눠 캔다
 * (칸마다 ⌈양 × 칸 상한 ÷ 상한 합⌉ — 상한이 같으면 ⌈양 ÷ 칸 수⌉).
 * 한 칸을 여러 도시가 캐면 그 칸 재고 안에서 캐려는 양 비율로 나눈다(내림). 캔 뒤 칸마다 다시 자란다. 차례는 원자재 → 칸 키 → 도시 ID라
 * 같은 입력이면 같은 결과다. capacityPm(칸, 원자재) = 그 칸의 원자재 몫(0이면 없음)
 */
export function stepCatchmentSupply(
  cities: readonly SupplyCity[],
  stock: SupplyStock,
  capacityPm: (cell: number, material: CatchmentMaterial) => number,
  rules: CatchmentSupplyRules,
): Map<number, SupplyResult> {
  const sorted = cities.toSorted((a, b) => a.id - b.id);
  const got = new Map<number, Record<CatchmentMaterial, number>>();
  const claimants = new Map<number, number>();
  for (const city of sorted) {
    got.set(city.id, emptyMaterials(0));
    for (const cell of new Set(city.cells)) claimants.set(cell, (claimants.get(cell) ?? 0) + 1);
  }
  const touched = [...claimants.keys()].toSorted((a, b) => a - b);
  const capOf = (cell: number, index: number): number => {
    const material = CATCHMENT_MATERIALS[index];
    return material ? cellStockCap(capacityPm(cell, material), rules) : 0;
  };
  for (const cell of touched)
    if (!stock.has(cell))
      stock.set(
        cell,
        CATCHMENT_MATERIALS.map((_, index) => capOf(cell, index)),
      );
  CATCHMENT_MATERIALS.forEach((material, index) => {
    // 칸 → 도시마다 캐려는 양
    const wants = new Map<number, { city: number; want: number }[]>();
    for (const city of sorted) {
      const demand = Math.max(0, Math.trunc(city.demand[material] ?? 0));
      if (demand === 0) continue;
      const own = [...new Set(city.cells)].filter((cell) => capOf(cell, index) > 0);
      if (own.length === 0) continue;
      // 칸 재고 상한에 비례해 나눠 캔다(광석 고도 몫 — 산지 칸에서 더, 낮은 땅에서 덜). 상한이 모두 같으면 ⌈양 ÷ 칸 수⌉(옛 셈과 같다)
      const capSum = own.reduce((sum, cell) => sum + capOf(cell, index), 0);
      for (const cell of own) {
        const list = wants.get(cell) ?? [];
        list.push({ city: city.id, want: Math.ceil((demand * capOf(cell, index)) / capSum) });
        wants.set(cell, list);
      }
    }
    for (const [cell, list] of [...wants].toSorted((a, b) => a[0] - b[0])) {
      const row = stock.get(cell);
      if (!row) continue;
      const total = list.reduce((sum, entry) => sum + entry.want, 0);
      let left = Math.min(capOf(cell, index), Math.max(0, row[index] ?? 0));
      const take = Math.min(total, left);
      for (const entry of list) {
        const share = Math.floor((take * entry.want) / total);
        const bag = got.get(entry.city);
        if (bag) bag[material] += share;
        left -= share;
      }
      row[index] = left;
    }
    // 캔 뒤 다시 자람(오늘 아무도 캐지 않은 칸도 — 배후지가 줄어든 도시의 옛 칸)
    for (const [cell, row] of stock) {
      const cap = capOf(cell, index);
      const left = Math.min(cap, Math.max(0, row[index] ?? 0));
      row[index] = Math.min(cap, left + cellRegrow(left, cap, rules));
    }
  });
  const out = new Map<number, SupplyResult>();
  for (const city of sorted) {
    const bag = got.get(city.id) ?? emptyMaterials(0);
    const supplyPm = emptyMaterials(1000);
    let wantSum = 0;
    let gotSum = 0;
    for (const material of CATCHMENT_MATERIALS) {
      const demand = Math.max(0, Math.trunc(city.demand[material] ?? 0));
      if (demand === 0) continue;
      const received = Math.min(demand, bag[material]);
      supplyPm[material] = Math.floor((received * 1000) / demand);
      wantSum += demand;
      gotSum += received;
    }
    let sharedCells = 0;
    for (const cell of new Set(city.cells)) if ((claimants.get(cell) ?? 0) > 1) sharedCells += 1;
    out.set(city.id, {
      got: bag,
      supplyPm,
      totalPm: wantSum === 0 ? 1000 : Math.floor((gotSum * 1000) / wantSum),
      sharedCells,
    });
  }
  return out;
}
