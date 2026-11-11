// 도시 배후지(자원 점유 영역)와 1차 생산 여섯 원자재의 땅 — docs/adr/2026-11-11-city-catchment.md.
// 사용자 지적(2026-11-11, 원문) "npc세력의 도시 배치를 어느정도 벌려야 한다. 너무 가까우면 도시를 유지하기 위한 주변 지형자원의 점유 영역이 겹쳐
// 도시간의 자원경쟁으로 서로 발전하지 못한다. … 6가지 원자재의 획득방식 구현이 중요하다."
// - 1차맵 칸(= 2차맵 하나)의 행성 값으로 그 칸에 여섯 원자재가 있는지 본다(있음/없음 비트). 문턱은 NPC 시작 도시 채집 시설 고르기와 같은 설정 칸
//   (npc_seed_lumber_forest_pct·npc_seed_mine_height_m·npc_seed_farm_temp_c·npc_seed_farm_rain_mm — 새 수치를 만들지 않는다).
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
 * - 목재: 숲 % ≥ 벌목장 문턱(물 잠긴 칸 아님). 광석: 칸 고도 ≥ 광산 문턱. 작물: 기온·강수가 농장 문턱 이상(물 잠긴 칸 아님).
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
export function siteScore(cover: number, fromHomeMilli: number, rules: CatchmentRules): number {
  const diameter = Math.max(0, Math.trunc(rules.radiusCells)) * 2000;
  if (diameter === 0) return cover;
  return cover - Math.max(0, Math.trunc(rules.compactPm)) * Math.floor(Math.max(0, fromHomeMilli) / diameter);
}
