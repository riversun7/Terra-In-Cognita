// 지형 층(꼭짓점 높이·지표·엄폐) → 배치 칸 지형 비용 — ADR 46 5절(지형 비용은 서버가 sim 코드로), ADR 35 "엄폐 값".
// 임시 지형(tempTerrain.ts)과 행성 값에서 만든 2차맵(@terra/planet/secondMap, 서버가 넘긴다)이 같은 함수를 쓴다.
// - 지표 비용(천분율, 0 = 막힘): 번호는 protocol TERRAIN_SURFACE(= planet SM_SURFACE)와 같다. 0 ~ 3은 S1 임시값 그대로,
//   4 ~ 10은 기획 질문 124·126 기술 기본안의 [임시] 출발값(Step 5 설정값 전): 얕은 물(하천 등급 1 ~ 2)은 걸어서 건너되 비싸다.
// - 지형 칸 네 꼭짓점 높이 차가 CLIFF_RELIEF_CM 이상이면 벼랑(막힘). 엄폐 값 2(차폐: 빽빽한 숲·큰 바위)는 막힘(D-227 ①·D-234).
//   planet secondMap SM_CLIFF_RELIEF_CM과 같다(서버 시험이 본다).
// - 숲 들어가기(docs/adr/2026-11-07-gather-objects.md, 사용자 지적 2026-11-07 "숲이나 건물로 진입 등의 상호작용 불가", SIM_VERSION 19):
//   소품 그림 층(art)을 함께 주면 나무 그림(활엽수·침엽수·야자수)이 선 차폐 칸은 막지 않고 그 칸 지표 비용 × FOREST_COST_PM ÷ 1000으로
//   지나간다(시야는 그대로 막는다 — 엄폐 값은 바꾸지 않는다). 큰 바위 등 다른 차폐는 그대로 막힘. art가 없으면(전투장·옛 호출) 예전 그대로.
// - 느려짐 소품(기획 D-540 — 질문 1223 나 "소품마다 느림 배율 칸", 42 §5 눈더미·모래언덕·늪 웅덩이, SIM_VERSION 37): 그림 층과 함께
//   그림 번호 → 느림 배율(천분율) 표(slowByArt, 팩 map_props slowPm에서 서버가 만든다)를 주면 그 그림이 선 지나갈 수 있는 칸은
//   지표 비용 × 배율 ÷ 1000이다(숲 비용과 같은 꼴, 같은 칸에 겹치지 않는다 — 칸마다 그림은 하나). 길 고르기(A*)만 바꾼다: 걷는 빠르기는
//   경로 전체가 같다(motion.ts "S1 단순화" — 숲 지나가기와 같다). 표가 없으면 예전 그대로.
// - 지형 칸 하나 = 배치 칸 2×2. 엄폐는 배치 칸마다다.
import {
  PLACEMENT_CELLS,
  PLACEMENT_PER_TERRAIN,
  PLACEMENT_SIZE,
  TERRAIN_SIZE,
  TERRAIN_VERTEX_SIZE,
} from "../units.ts";

/** 지표 종류 → 배치 칸 비용(천분율, 0 = 막힘). 물·풀·흙·바위·모래·자갈·눈·얼음·진흙·화산재·얕은 물 */
export const SURFACE_COST: Readonly<Uint16Array> = Uint16Array.of(
  0,
  1000,
  1050,
  1300,
  1150,
  1100,
  1300,
  1350,
  1400,
  1100,
  2500,
);

/** 이 이상이면 가파른 비탈이라 지나갈 수 없다(지형 칸 약 11.7m에 약 6.5m) */
export const CLIFF_RELIEF_CM = 650;

/** 차폐 엄폐 값(지나갈 수 없다) */
export const COVER_BLOCKING = 2;

/** [임시] 숲(나무가 선 차폐 칸) 지나는 비용 배율(천분율). 기획 수치 없음 → 확인 대기(질문 667) */
export const FOREST_COST_PM = 1800;

/** 느림 배율 표의 길이(그림 번호는 1바이트) */
export const SLOW_TABLE_SIZE = 256;

/** 느림 배율 없음(천분율) */
export const SLOW_NONE_PM = 1000;

/** 나무 그림 번호(@terra/shared MAP_PROP_ARTS: tree_broadleaf 1·tree_conifer 2·tree_palm 3). sim은 shared 표를 가져오지 않아 번호로 둔다 */
const TREE_ART_MIN = 1;
const TREE_ART_MAX = 3;

/** 그 소품 그림 번호가 나무인가 */
export const isTreeArt = (art: number): boolean => art >= TREE_ART_MIN && art <= TREE_ART_MAX;

/** 비용을 만들 지형 층 */
export interface TerrainLayers {
  /** 꼭짓점 높이(cm) 129², 행 우선 */
  readonly heights: Int32Array;
  /** 지형 칸 지표 종류 128², 행 우선 */
  readonly surface: Uint8Array;
  /** 배치 칸 엄폐 값(0 · 1 · 2) 256². 없으면 엄폐 없음 */
  readonly cover?: Uint8Array | undefined;
  /** 배치 칸 소품 그림 번호 256²(@terra/shared MAP_PROP_ARTS). 있으면 나무가 선 차폐 칸을 숲 비용으로 지나간다 */
  readonly art?: Uint8Array | undefined;
  /**
   * 그림 번호 → 느림 배율(천분율, SLOW_TABLE_SIZE칸, 0·1000 = 없음). art와 함께 주면 그 그림이 선 지나갈 수 있는 칸의 비용을 늘린다.
   * 서버가 팩 map_props slowPm에서 만든다(apps/server/src/world/mapProps.ts)
   */
  readonly slowByArt?: Readonly<Uint16Array> | undefined;
}

/** 지형 칸 (tx, ty) 꼭짓점 4개의 높이 차(cm) */
export function cellRelief(heights: Int32Array, tx: number, ty: number): number {
  const top = ty * TERRAIN_VERTEX_SIZE + tx;
  const bottom = top + TERRAIN_VERTEX_SIZE;
  const a = heights[top] ?? 0;
  const b = heights[top + 1] ?? 0;
  const c = heights[bottom] ?? 0;
  const d = heights[bottom + 1] ?? 0;
  return Math.max(a, b, c, d) - Math.min(a, b, c, d);
}

/** 비용 × 배율(천분율, u16 상한). 막힘(0)은 막힘 그대로 */
function scaledCost(cost: number, pm: number): number {
  if (cost === 0) return 0;
  return Math.min(0xffff, Math.floor((cost * pm) / 1000));
}

/** 배치 칸 65,536개의 지형 비용(천분율, 0 = 막힘). createPlacementGrid에 넣는다. 모르는 지표 번호는 막힘 */
export function placementCostsFromLayers(layers: TerrainLayers): Uint16Array {
  const { heights, surface, cover, art, slowByArt } = layers;
  if (
    heights.length !== TERRAIN_VERTEX_SIZE * TERRAIN_VERTEX_SIZE ||
    surface.length !== TERRAIN_SIZE * TERRAIN_SIZE
  ) {
    throw new RangeError("terrain layers do not match the second map size");
  }
  if (cover && cover.length !== PLACEMENT_CELLS)
    throw new RangeError("cover does not match the placement size");
  if (art && art.length !== PLACEMENT_CELLS) throw new RangeError("art does not match the placement size");
  if (slowByArt && slowByArt.length !== SLOW_TABLE_SIZE)
    throw new RangeError("slow table does not match the art code range");
  // 느림 표는 그림 층이 있을 때만 쓴다
  const slow = art ? slowByArt : undefined;
  const costs = new Uint16Array(PLACEMENT_CELLS);
  for (let ty = 0; ty < TERRAIN_SIZE; ty++) {
    for (let tx = 0; tx < TERRAIN_SIZE; tx++) {
      const kind = surface[ty * TERRAIN_SIZE + tx] ?? 0;
      const cost = cellRelief(heights, tx, ty) >= CLIFF_RELIEF_CM ? 0 : (SURFACE_COST[kind] ?? 0);
      for (let dy = 0; dy < PLACEMENT_PER_TERRAIN; dy++) {
        const row = (ty * PLACEMENT_PER_TERRAIN + dy) * PLACEMENT_SIZE + tx * PLACEMENT_PER_TERRAIN;
        for (let dx = 0; dx < PLACEMENT_PER_TERRAIN; dx++) {
          const cell = row + dx;
          if (!cover || cover[cell] !== COVER_BLOCKING) {
            const pm = slow ? (slow[art?.[cell] ?? 0] ?? 0) : 0;
            costs[cell] = pm > SLOW_NONE_PM ? scaledCost(cost, pm) : cost;
          } else if (art && isTreeArt(art[cell] ?? 0)) costs[cell] = scaledCost(cost, FOREST_COST_PM);
          else costs[cell] = 0;
        }
      }
    }
  }
  return costs;
}
