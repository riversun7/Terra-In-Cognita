// 2차맵 바닥 종류(지표)와 바이옴마다 섞는 비중 — ADR 46 3·4절, 기획 질문 124 기술 기본안(10종 + 얕은 물).
// [임시] 기획 답(질문 124)과 Step 5 설정값이 오기 전의 기술 출발값이다. 값을 바꾸면 SECOND_MAP_GENERATOR_VERSION을 올린다.
// 번호는 지형 파일(TCTR, packages/protocol TERRAIN_SURFACE)·서버 지형 비용·엔진 색이 함께 쓴다. 0~3은 S1 임시 지형과 같은 뜻이다.
// 한 번 쓴 번호는 다른 뜻으로 다시 쓰지 않는다(저장된 고정본 2차맵이 가리킨다).

export const SM_SURFACE = {
  water: 0,
  grass: 1,
  dirt: 2,
  rock: 3,
  sand: 4,
  gravel: 5,
  snow: 6,
  ice: 7,
  mud: 8,
  ash: 9,
  shallowWater: 10,
} as const;

export type SmSurface = (typeof SM_SURFACE)[keyof typeof SM_SURFACE];

/** 바이옴 하나의 바닥 비중(합은 아무 수, 0은 없음) */
export type SurfaceMix = readonly (readonly [SmSurface, number])[];

const S = SM_SURFACE;

/** 바이옴 ID → 바닥 비중. 표에 없는 바이옴(새 콘텐츠)은 DEFAULT_MIX */
export const BIOME_SURFACES: Readonly<Record<string, SurfaceMix>> = {
  ocean_deep: [
    [S.sand, 60],
    [S.mud, 40],
  ],
  ocean_shelf: [
    [S.sand, 60],
    [S.mud, 40],
  ],
  ocean_coastal: [
    [S.sand, 80],
    [S.gravel, 20],
  ],
  lake: [
    [S.mud, 50],
    [S.sand, 50],
  ],
  ice_sheet: [
    [S.ice, 65],
    [S.snow, 35],
  ],
  alpine: [
    [S.rock, 45],
    [S.gravel, 35],
    [S.snow, 20],
  ],
  wetland: [
    [S.mud, 45],
    [S.grass, 55],
  ],
  tundra: [
    [S.grass, 40],
    [S.gravel, 30],
    [S.dirt, 20],
    [S.snow, 10],
  ],
  taiga: [
    [S.grass, 50],
    [S.dirt, 35],
    [S.gravel, 15],
  ],
  temperate_forest: [
    [S.grass, 65],
    [S.dirt, 35],
  ],
  grassland: [
    [S.grass, 80],
    [S.dirt, 20],
  ],
  desert: [
    [S.sand, 70],
    [S.gravel, 25],
    [S.dirt, 5],
  ],
  savanna: [
    [S.grass, 55],
    [S.dirt, 35],
    [S.sand, 10],
  ],
  tropical_rainforest: [
    [S.grass, 55],
    [S.mud, 25],
    [S.dirt, 20],
  ],
};

export const DEFAULT_MIX: SurfaceMix = [
  [S.grass, 70],
  [S.dirt, 30],
];

/**
 * 바이옴마다 잔기복 세기 배율(천분율). 1차맵 칸 둘레 높이 차로 정한 세기에 곱한다.
 * 고산은 거칠고, 습지·빙상은 평평하다.
 */
export const BIOME_ROUGHNESS: Readonly<Record<string, number>> = {
  alpine: 1400,
  ice_sheet: 600,
  wetland: 400,
  desert: 900,
  lake: 700,
};

/** 비중표에서 0 ~ 65535 값 u로 하나를 고른다(누적 비중) */
export function pickSurface(mix: SurfaceMix, u: number): SmSurface {
  let total = 0;
  for (const [, weight] of mix) total += weight;
  let target = Math.floor((u * total) / 65536);
  for (const [surface, weight] of mix) {
    if (target < weight) return surface;
    target -= weight;
  }
  return mix[mix.length - 1]?.[0] ?? S.grass;
}
