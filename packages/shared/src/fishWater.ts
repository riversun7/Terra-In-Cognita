// 낚시터 물 종류와 티어 범위 — 기획 D-542(질문 1365 나 "낚시터 일꾼도 그 자리 물 종류의 티어 범위로 — 깊은 바다일수록 큰 고기,
// 호숫가 낚시터에서 바닷고기가 나오지 않게"), D-541 1307 나(어군 종류마다 티어 범위). docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-14)".
// - 1차맵 칸 하나(= 2차맵 하나)의 물 종류: 바다 칸(물 비트 1)은 수심 등급 비트(@terra/planet tiles/fields WATER_DEPTH_SHIFT — 연안 1·대륙붕 2·
//   심해 3)로, 등급이 없으면 바이옴(ocean_deep·ocean_shelf·ocean_coastal)으로 깊이를 정한다. 그 밖은 바다 바이옴이면 그 깊이, 해안(8) 비트면
//   연안, 호수(2)·강(4)이면 민물, 바이옴이 호수·습지면 민물. 물이 없으면 없음.
// - 여러 칸에서 하나 고르기(spotFishWater): 낚시터가 설 수 있는 칸(물에 잠기지 않은 땅 — 해안·강가)의 물 종류를 먼저 보고, 그런 칸이 없으면
//   모든 칸(바다·호수 칸)을 본다. 가장 많은 종류, 같으면 더 깊은 쪽.
// - 범위는 추첨으로 뽑은 티어를 접는다(아래는 min으로 올리고 위는 max로 내린다 — @terra/sim rollGatherOutputs tierRange, 어군 직접 채집
//   foldTierRange와 같은 꼴). 바뀜 (기획 D-562 1562): 범위는 설정 칸 fish_tier_*가 아니라 팩 오브젝트 범위에서 끌어낸다(npcGatherTiers.ts).
// 정수만 쓴다(판정 코드 규칙). 다른 내부 패키지를 가져오지 않는다.

/** 물 종류(얕은 것부터 — 차례가 깊이다) */
export const FISH_WATERS = ["fresh", "coast", "shelf", "deep"] as const;
export type FishWater = (typeof FISH_WATERS)[number];

/** 티어 범위(아래 ≤ 위, T0 ~ T9) */
export interface FishTierRange {
  readonly min: number;
  readonly max: number;
}

/** 물 종류마다 티어 범위(팩 오브젝트에서 끌어냄 — npcGatherTiers.ts npcFishRanges) */
export type FishTierRanges = Readonly<Record<FishWater, FishTierRange>>;

/** 물 종류를 보는 칸 값(행성 값 PlanetCellValues·@terra/shared/catchment CatchmentLand의 일부) */
export interface FishWaterLand {
  /** 물 비트(바다 1·호수 2·강 4·해안 8) */
  readonly water: number;
  readonly biomeId?: string | null | undefined;
}

const SEA_BIT = 1;
const LAKE_BIT = 2;
const RIVER_BIT = 4;
const COAST_BIT = 8;
/** 바다 수심 등급 비트(@terra/planet tiles/fields WATER_DEPTH_SHIFT·DEPTH_* — 다른 내부 패키지를 가져오지 않아 값을 옮겨 둔다) */
const DEPTH_SHIFT = 4;
const DEPTH_MASK = 3;
const DEPTH_CLASS: readonly (FishWater | undefined)[] = [undefined, "coast", "shelf", "deep"];

/** 바다 바이옴 → 깊이 */
const OCEAN_BIOME: Readonly<Record<string, FishWater>> = {
  ocean_deep: "deep",
  ocean_shelf: "shelf",
  ocean_coastal: "coast",
};

/** 민물 바이옴 */
const FRESH_BIOMES: ReadonlySet<string> = new Set(["lake", "wetland"]);

/** 바이옴 하나의 물 종류(바다 바이옴이면 그 깊이, 호수·습지면 민물, 그 밖은 undefined — 어군 오브젝트의 집 물, 기획 D-562 1562) */
export function fishWaterOfBiome(biomeId: string): FishWater | undefined {
  return OCEAN_BIOME[biomeId] ?? (FRESH_BIOMES.has(biomeId) ? "fresh" : undefined);
}

/** 칸 하나의 물 종류(머리 주석). 물이 없거나 값이 없으면 undefined */
export function fishWaterOfLand(land: FishWaterLand | undefined): FishWater | undefined {
  if (!land) return undefined;
  const biome = land.biomeId ?? "";
  if ((land.water & SEA_BIT) !== 0) {
    const depth = DEPTH_CLASS[(land.water >> DEPTH_SHIFT) & DEPTH_MASK];
    if (depth !== undefined) return depth;
  }
  const ocean = OCEAN_BIOME[biome];
  if (ocean !== undefined) return ocean;
  if ((land.water & (SEA_BIT | COAST_BIT)) !== 0) return "coast";
  if ((land.water & (LAKE_BIT | RIVER_BIT)) !== 0) return "fresh";
  if (FRESH_BIOMES.has(biome)) return "fresh";
  return undefined;
}

/** 낚시터가 설 수 있는 칸인가(물에 잠기지 않은 땅 — 바다·호수 비트가 없고 바다 바이옴이 아님) */
export function isShoreLand(land: FishWaterLand | undefined): boolean {
  if (!land) return false;
  return (land.water & (SEA_BIT | LAKE_BIT)) === 0 && OCEAN_BIOME[land.biomeId ?? ""] === undefined;
}

/** 칸 하나의 물 종류와 땅 여부(여러 칸에서 고를 때) */
export interface FishWaterCell {
  readonly water: FishWater | undefined;
  /** 낚시터가 설 수 있는 땅 칸(isShoreLand) */
  readonly shore: boolean;
}

export function fishWaterCellOf(land: FishWaterLand | undefined): FishWaterCell {
  return { water: fishWaterOfLand(land), shore: isShoreLand(land) };
}

/** 가장 많은 종류(같으면 더 깊은 쪽). 하나도 없으면 undefined */
function mostCommon(counts: readonly number[]): FishWater | undefined {
  let best = -1;
  let bestCount = 0;
  counts.forEach((count, index) => {
    if (count > 0 && count >= bestCount) {
      best = index;
      bestCount = count;
    }
  });
  return best < 0 ? undefined : FISH_WATERS[best];
}

/** 여러 칸에서 낚시터 물 종류 하나(머리 주석): 땅 칸 먼저, 없으면 모든 칸. 가장 많은 종류, 같으면 더 깊은 쪽 */
export function spotFishWater(cells: Iterable<FishWaterCell>): FishWater | undefined {
  const shore = [0, 0, 0, 0];
  const all = [0, 0, 0, 0];
  for (const cell of cells) {
    if (cell.water === undefined) continue;
    const index = FISH_WATERS.indexOf(cell.water);
    all[index] = (all[index] ?? 0) + 1;
    if (cell.shore) shore[index] = (shore[index] ?? 0) + 1;
  }
  return mostCommon(shore) ?? mostCommon(all);
}

/** 범위를 T0 ~ maxTier, 아래 ≤ 위로 다듬는다(설정 칸이 어긋나도 — 아래가 위보다 크면 위를 아래에 맞춘다) */
export function normalizeFishRange(range: FishTierRange, maxTier = 9): FishTierRange {
  const top = Math.max(0, Math.trunc(maxTier));
  const min = Math.min(top, Math.max(0, Math.trunc(range.min)));
  const max = Math.min(top, Math.max(min, Math.trunc(range.max)));
  return { min, max };
}

/** 물 종류의 티어 범위(물 종류를 모르면 undefined — 접지 않는다) */
export function fishTierRangeOf(
  ranges: FishTierRanges,
  water: FishWater | undefined,
): FishTierRange | undefined {
  return water === undefined ? undefined : normalizeFishRange(ranges[water]);
}

/** 뽑은 티어를 범위 안으로 접는다(범위가 없으면 그대로) */
export function foldFishTier(tier: number, range: FishTierRange | undefined): number {
  if (!range) return tier;
  return Math.min(Math.max(tier, range.min), range.max);
}

/** 물 종류 하나의 범위(화면 표 — 물 종류 차례) */
export interface FishWaterRangeView {
  readonly water: FishWater;
  readonly min: number;
  readonly max: number;
}

/** 물 종류마다 다듬은 범위(얕은 것부터) */
export function fishWaterRangeViews(ranges: FishTierRanges): FishWaterRangeView[] {
  return FISH_WATERS.map((water) => ({ water, ...normalizeFishRange(ranges[water]) }));
}

/** 티어별 확률(‰)을 범위로 접는다: 아래 끝 밑은 아래 끝으로, 위 끝 위는 위 끝으로 모은다(합은 그대로) */
export function foldTierPm(tierPm: readonly number[], range: FishTierRange | undefined): number[] {
  const out = tierPm.map((pm) => Math.max(0, pm));
  if (!range) return out;
  const folded = out.map(() => 0);
  out.forEach((pm, tier) => {
    const at = Math.min(out.length - 1, foldFishTier(tier, range));
    folded[at] = (folded[at] ?? 0) + pm;
  });
  return folded;
}
