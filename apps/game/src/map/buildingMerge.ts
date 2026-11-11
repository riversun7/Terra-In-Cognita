// 지금 2차맵 건물 + 옆 2차맵 건물을 엔진 하나에 — 사용자 지적 2026-11-11 "완전히 자연스럽게 연결될순 없는지"
// (docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-11)"). 붙여 둔 이웃 흐름(mapFeedPool.ts)의 건물 바닥을 놓는 자리(90° 배수 돌림 +
// 옮김)로 지금 2차맵 틀로 옮겨 지금 2차맵 건물 뒤에 붙여 넣는다 — 넘는 순간 건물이 사라졌다 나타나지 않는다.
// - 그림만이다: 옆 2차맵 건물은 누를 수 없고(채집 상태·건물 판은 지금 2차맵 건물만 안다) 겉모습은 받아 둔 것이 있으면 붙인다(buildingLooks.ts).
// - 바닥 옮기기: 차지한 칸 네모의 두 구석을 옮겨 새 기준 칸(왼쪽 위)을 잡고, 앞면 방향을 돌려 새 회전을 고른다. 돌리기 전 크기는 그대로다.
import type { BuildingFootprint, NeighbourPlacement, QuarterTurns } from "@terra/engine";
import { directionThroughPlacement, pointThroughPlacement } from "./unitBlend.ts";

/** 앞면이 보는 방향(@terra/engine buildings/footprint.ts frontDirection과 같은 표: 0 남쪽, 1 서쪽, 2 북쪽, 3 동쪽) */
const FRONTS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
];
const TURNS: readonly QuarterTurns[] = [0, 1, 2, 3];

/** 옆 틀의 건물 바닥을 지금 2차맵 틀로(배치 칸, 2차맵 밖 좌표가 된다) */
export function footprintThroughPlacement(
  footprint: BuildingFootprint,
  placement: NeighbourPlacement,
): BuildingFootprint {
  const odd = footprint.rotation % 2 === 1;
  const w = odd ? footprint.depth : footprint.width;
  const d = odd ? footprint.width : footprint.depth;
  const a = pointThroughPlacement({ x: footprint.cellX, y: footprint.cellY }, placement);
  const b = pointThroughPlacement({ x: footprint.cellX + w, y: footprint.cellY + d }, placement);
  const front = directionThroughPlacement(FRONTS[footprint.rotation] ?? { x: 0, y: 1 }, placement);
  const rotation =
    TURNS.find(
      (turn) => FRONTS[turn]?.x === Math.round(front.x) && FRONTS[turn]?.y === Math.round(front.y),
    ) ?? footprint.rotation;
  return {
    ...footprint,
    cellX: Math.round(Math.min(a.x, b.x)),
    cellY: Math.round(Math.min(a.y, b.y)),
    rotation,
  };
}

export interface BuildingMerger {
  /** 지금 2차맵 건물(겉모습이 붙은 것) */
  setMain(list: readonly BuildingFootprint[]): void;
  /** 옆 2차맵 건물(그 틀의 바닥 — 놓는 자리로 옮겨 넣는다) */
  setNeighbour(mapKey: number, placement: NeighbourPlacement, list: readonly BuildingFootprint[]): void;
  /** 옆 2차맵 건물을 지운다(그 흐름을 닫았다) */
  clearNeighbour(mapKey: number): void;
}

/** push = 엔진에 건물 목록을 통째로 넣는다(지금 2차맵 건물 먼저) */
export function createBuildingMerger(push: (list: BuildingFootprint[]) => void): BuildingMerger {
  let main: readonly BuildingFootprint[] = [];
  const neighbours = new Map<number, BuildingFootprint[]>();
  const flush = (): void => {
    const seen = new Set(main.map((building) => building.id));
    const all = [...main];
    for (const list of neighbours.values()) {
      for (const building of list) {
        if (seen.has(building.id)) continue;
        seen.add(building.id);
        all.push(building);
      }
    }
    push(all);
  };
  return {
    setMain(list) {
      main = list;
      flush();
    },
    setNeighbour(mapKey, placement, list) {
      if (list.length === 0 && !neighbours.has(mapKey)) return;
      neighbours.set(
        mapKey,
        list.map((building) => footprintThroughPlacement(building, placement)),
      );
      flush();
    },
    clearNeighbour(mapKey) {
      if (neighbours.delete(mapKey)) flush();
    },
  };
}
