// NPC 도시 경제 배후지의 행성 칸 자리 — docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)".
// 시뮬 배후지 채집 다툼(@terra/sim catchmentRun.ts)에 서버 세계의 칸 자리를 준다: 도시 배후지 = 도시 2차맵에서 영토 거리 반경 안의 1차맵 칸
// (world/citySites.ts catchmentCellsMilli — 세계 배치·화면 덮개와 같은 셈), 칸의 원자재 몫 = 원자재 비트(@terra/shared/catchment cellMaterials,
// 문턱 = 설정 칸 npc_seed_*)가 있으면 1000‰, 없으면 0. 바뀜 (2026-11-12, 기획 D-533): 광석은 고도 몫(oreSharePm — 설정 칸 ore_share_*),
// 산지 칸(고도 ≥ npc_seed_mine_height_m)만 높은 티어 광석을 낸다(highOrePm). 바뀜 (2026-11-12, 기획 D-535): 산지 = 고도 ≥ ore_high_min_m,
// 산지 밖 마른 땅은 높은 티어 몫 ore_flat_high_pm(같은 highOrePm).
// 바뀜 (2026-11-14, 기획 D-542 질문 1365 나): 칸의 낚시터 물 종류(@terra/shared/fishWater fishWaterCellOf — 수심 등급·바이옴·물 비트)를 준다.
// 바뀜 (2026-11-15, 기획 D-566 1722): 칸의 바이옴 ID를 준다(지형별 특수 자리가 NPC 채집 묶음에 든다 — @terra/shared/npcGatherTiers).
import { cellLevel, isCellKey } from "@terra/planet";
import { CATCHMENT_MATERIALS, type CatchmentLand, cellSharesPm, highOrePm } from "@terra/shared/catchment";
import { type FishWaterCell, fishWaterCellOf } from "@terra/shared/fishWater";
import type { CatchmentGeometry, SocietyCoefficients } from "@terra/sim";
import { catchmentCellsMilli } from "../world/citySites.ts";

/** 행성 값 → 배후지 칸 자리(칸 비트·도시 칸 목록은 반경마다 붙잡는다 — 도시가 자라면 새로 센다). 면 레벨 = 도시 2차맵 칸 키의 레벨 */
export function planetCatchmentGeometry(
  land: (mapKey: number) => CatchmentLand | undefined,
  cityMapOf: (cityId: number) => number | undefined,
  rules: () => SocietyCoefficients,
): CatchmentGeometry {
  // 칸 → [원자재 여섯 몫(CATCHMENT_MATERIALS 차례), 산지 몫]. 설정 칸을 바꾸면 다음 켤 때부터(붙잡는다)
  const shares = new Map<number, number[]>();
  const sharesOf = (cell: number): number[] => {
    let row = shares.get(cell);
    if (row === undefined) {
      const seed = rules().worldSeed;
      const value = land(cell);
      const supply = cellSharesPm(value, seed, "supply");
      row = [...CATCHMENT_MATERIALS.map((material) => supply[material]), highOrePm(value, seed)];
      shares.set(cell, row);
    }
    return row;
  };
  // 칸 → 낚시터 물 종류(행성 값이라 바뀌지 않는다)
  const fishWaters = new Map<number, FishWaterCell>();
  const cellsByCity = new Map<number, { mapKey: number; radiusMilli: number; cells: readonly number[] }>();
  return {
    cellsOf(cityId, radiusMilli) {
      const mapKey = cityMapOf(cityId);
      if (mapKey === undefined || !isCellKey(mapKey)) return [];
      const known = cellsByCity.get(cityId);
      if (known && known.mapKey === mapKey && known.radiusMilli === radiusMilli) return known.cells;
      const cells = catchmentCellsMilli(mapKey, radiusMilli, cellLevel(mapKey));
      cellsByCity.set(cityId, { mapKey, radiusMilli, cells });
      return cells;
    },
    capacityPm(cell, material) {
      return sharesOf(cell)[CATCHMENT_MATERIALS.indexOf(material)] ?? 0;
    },
    highOrePm(cell) {
      return sharesOf(cell)[CATCHMENT_MATERIALS.length] ?? 0;
    },
    biomeOf(cell) {
      const biome = land(cell)?.biomeId;
      return typeof biome === "string" && biome !== "" ? biome : undefined;
    },
    fishWaterOf(cell) {
      let known = fishWaters.get(cell);
      if (known === undefined) {
        known = fishWaterCellOf(land(cell));
        fishWaters.set(cell, known);
      }
      return known;
    },
  };
}
