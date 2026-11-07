// 2차맵 지형 → 오브젝트 자리 층(소품 그림·지표) — docs/adr/2026-11-07-gather-objects.md 2절.
// 2차맵이 든 지형 파일(TCTR, 고정본·캐시·생성기 어디서 왔든 같은 내용)을 풀어 읽는다. 오브젝트 목록은 지형 판 표지마다 한 번만 만든다(service.ts가 기억).
import { decodeTerrain } from "@terra/protocol";
import type { SecondMap } from "../world/secondMap.ts";
import type { ObjectLayers } from "./objects.ts";

export function mapLayers(map: Pick<SecondMap, "mapKey" | "terrainFile">): ObjectLayers {
  const data = decodeTerrain(map.terrainFile().raw);
  return { mapKey: map.mapKey, art: data.art, surface: data.surface };
}
