// 플레이어(건물 서비스) 낚시터의 물 종류 — 기획 D-542(질문 1365 나 "낚시터 일꾼도 그 자리 물 종류의 티어 범위로"), @terra/shared/fishWater.
// - 건물이 선 2차맵(1차맵 칸)의 물 종류(바다 수심 등급·바이옴·물 비트). 그 칸에 물 표시가 없으면(물이 옆 칸에서 섞여 들어온 2차맵) 둘레 한 칸
//   (영토 거리 1.5칸 안) 가운데 낚시터가 설 땅 칸에서 가장 많은 종류(같으면 더 깊은 쪽, 땅 칸이 없으면 모든 칸 — spotFishWater). 둘레에도 물이
//   없으면 민물(작은 못 — [임시], 질문 1412). 행성 값이 없는 2차맵(임시 지형)은 undefined(접지 않는다 — 광산 티어 막기와 같다).
import { cellLevel, isCellKey } from "@terra/planet";
import {
  type FishWater,
  type FishWaterLand,
  fishWaterCellOf,
  fishWaterOfLand,
  spotFishWater,
} from "@terra/shared/fishWater";
import { catchmentCellsMilli } from "../world/citySites.ts";

/** 둘레를 볼 때 반경(1000분율 칸 — 대각선 이웃까지) */
const AROUND_MILLI = 1500;

/** 2차맵 → 낚시터 물 종류(머리 주석) */
export function spotWaterOfMap(
  mapKey: number,
  cellValues: (mapKey: number) => FishWaterLand | undefined,
): FishWater | undefined {
  const own = cellValues(mapKey);
  if (!own) return undefined;
  const water = fishWaterOfLand(own);
  if (water !== undefined || !isCellKey(mapKey)) return water ?? "fresh";
  const around = catchmentCellsMilli(mapKey, AROUND_MILLI, cellLevel(mapKey));
  return spotFishWater(around.map((key) => fishWaterCellOf(cellValues(key)))) ?? "fresh";
}
