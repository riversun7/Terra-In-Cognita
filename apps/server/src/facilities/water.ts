// 물가 조건(질문 947 나, 옛 water_adjacent·낚시 반경 5칸) — docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)".
// 팩 needsWaterWithin이 있는 시설(낚시터)은 회전한 건물 칸을 사방으로 그만큼 넓힌 네모 안에 물 칸이 있어야 한다(@terra/shared/waterNearby).
// 플레이어 짓기(service.ts build → needs_water)와 NPC 씨앗(npcSeed.ts 자리 고르기)이 이 함수 하나를 쓴다.
import { hasWaterNear, rotatedRect } from "@terra/shared/waterNearby";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityDef } from "./catalog.ts";

/** 물가 조건을 채우나. 시설에 needsWaterWithin이 없으면(또는 칸 크기가 없으면) 늘 true */
export function waterOk(
  map: Pick<SecondMap, "waterMask">,
  def: Pick<FacilityDef, "needsWaterWithin" | "footprint">,
  x: number,
  y: number,
  rotation: number,
): boolean {
  if (def.needsWaterWithin === undefined || !def.footprint) return true;
  return hasWaterNear(map.waterMask(), rotatedRect(x, y, def.footprint, rotation), def.needsWaterWithin);
}
