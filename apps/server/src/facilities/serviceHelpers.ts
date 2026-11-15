// 건물 서비스 도우미(배치 결과 코드 대응·장비 수리 장인 셈) — facilities/service.ts에서 옮겼다(파일 크기 상한)
import type { FacilityResultCode } from "@terra/protocol";
import type { Primaries } from "@terra/sim";

/** 1차 스탯 평균(내림) — 여러 장인이 함께 고칠 때 한 사람으로 친다 */
export function averagePrimaries(list: readonly Primaries[]): Primaries {
  const n = Math.max(1, list.length);
  const sum = (key: keyof Primaries) => Math.floor(list.reduce((total, p) => total + p[key], 0) / n);
  return {
    str: sum("str"),
    dex: sum("dex"),
    agi: sum("agi"),
    vit: sum("vit"),
    int: sum("int"),
    wis: sum("wis"),
  };
}

/** 2차맵 배치 결과 코드 → 건물 결과 코드 */
export const PLACE_CODES: Readonly<Record<string, FacilityResultCode>> = {
  out_of_bounds: "out_of_bounds",
  overlaps_building: "overlaps_building",
  overlaps_road: "overlaps_road",
  blocked_terrain: "blocked_terrain",
  overlaps_unit: "overlaps_unit",
  building_limit: "building_limit",
};
