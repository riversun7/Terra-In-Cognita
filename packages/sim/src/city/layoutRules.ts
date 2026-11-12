// 도시 배치 설정 칸·몫·시드 — docs/adr/2026-11-11-city-building-layout.md. 서버 씨앗·다시 놓기와 시뮬레이터 도시 공성 전투맵(citySiege.ts)이
// 같은 값을 쓰도록 판정 꾸러미에 둔다(질문 1068 가, 2026-11-12 서버 facilities/cityLayoutGround.ts에서 옮김).
import type { WorldSeedCoefficients } from "../society/worldSeed.ts";
import type { CityLayoutRules, LayoutRole } from "./cityLayout.ts";

/** 정수로 자르고 범위 안으로 */
const int = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(value)));

/** 시설 단계 → 배치 몫 */
export function layoutRoleOf(stage: string | undefined): LayoutRole {
  switch (stage) {
    case "government":
      return "core";
    case "gather":
      return "gather";
    case "storage":
      return "storage";
    case "living":
      return "living";
    default:
      return "other";
  }
}

/** 세계 씨앗 계수표 → 배치 설정 칸 */
export function cityLayoutRulesOf(seed: WorldSeedCoefficients): CityLayoutRules {
  const gatherMin = int(seed.cityLayoutGatherMinCells, 4, 120);
  return {
    plazaCells: int(seed.cityLayoutPlazaCells, 0, 16),
    innerCells: int(seed.cityLayoutInnerCells, 2, 64),
    gatherMinCells: gatherMin,
    gatherMaxCells: int(seed.cityLayoutGatherMaxCells, gatherMin, 120),
    gatherReachCells: int(seed.cityLayoutGatherReachCells, 1, 64),
    storeRoutePm: int(seed.cityLayoutStoreRoutePm, 0, 1000),
    lodgeRoutePm: int(seed.cityLayoutLodgeRoutePm, 0, 1000),
    jitterCells: int(seed.cityLayoutJitterCells, 0, 8),
  };
}

/** 도시 배치 시드: (2차맵 키, 도시 ID) — 같은 도시는 늘 같은 모양, 도시마다 다르다 */
export function cityLayoutSeed(mapKey: number, cityId: number): number {
  // 2차맵 키(셀 키)는 32비트를 넘을 수 있어 위 자리도 섞는다
  const high = Math.floor(mapKey / 4_294_967_296) >>> 0;
  let x =
    (Math.imul(mapKey >>> 0, 0x9e37_79b1) ^
      Math.imul(high + 1, 0xc2b2_ae35) ^
      Math.imul(cityId + 1, 0x85eb_ca6b)) >>>
    0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb_352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846c_a68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** 전략 배치를 쓰나(설정 칸 city_layout_mode — 칸이 없는 옛 계수표는 옛 배치) */
export function strategicLayout(seed: WorldSeedCoefficients): boolean {
  return Math.trunc(seed.cityLayoutMode) === 1;
}
