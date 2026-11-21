import type { PlanetProjector } from "@terra/engine/planet";
import type { WorldMyUnit, WorldPosition, WorldTravel } from "@terra/shared/worldMap";
import { describe, expect, it } from "vitest";
import { mergeMyUnits, placeMyUnits, projectMyRoutes } from "./unitOverlay.ts";

function flatProjector(): PlanetProjector {
  const viewport = { width: 800, height: 600 };
  return {
    viewport,
    distanceM: 1,
    radiusM: 1,
    project: (latDeg, lonDeg) => ({
      x: viewport.width / 2 + lonDeg * 40,
      y: viewport.height / 2 - latDeg * 40,
      visible: true,
    }),
  };
}

const ME: WorldPosition = {
  planetId: "p1",
  mapKey: 100,
  face: 0,
  i: 1,
  j: 1,
  cellX: 128,
  cellY: 128,
  latDeg: 0,
  lonDeg: 0,
  unitId: 10,
  name: "DevCyborg",
  startCityId: 1,
  hidden: false,
};

describe("1차맵 내 본캐·유닛 위치 및 이동 경로", () => {
  it("mergeMyUnits: 서버 units·parked·내 사이보그·이동 중 좌표를 중복 없이 합친다", () => {
    const serverUnits: WorldMyUnit[] = [
      {
        unitId: 10,
        kind: "cyborg",
        mapKey: 100,
        cellX: 128,
        cellY: 128,
        latDeg: 0,
        lonDeg: 0,
        loaded: true,
        moving: false,
      },
      {
        unitId: 20,
        kind: "human",
        mapKey: 100,
        cellX: 130,
        cellY: 130,
        latDeg: 0,
        lonDeg: 0,
        loaded: true,
        moving: false,
        working: true,
      },
    ];
    const travel: WorldTravel = {
      unitId: 20,
      kind: "move",
      route: [100, 101],
      leg: 0,
      mapKey: 101,
      cellX: 50,
      cellY: 50,
      latDeg: 2,
      lonDeg: 3,
      targetX: 60,
      targetY: 60,
      startedAt: 0,
      arriveAt: 60_000,
      state: "going",
      stop: null,
      returning: false,
      scoutedMapKey: null,
      hidden: false,
      routePoints: [
        [2, 3],
        [4, 5],
      ],
    };
    const merged = mergeMyUnits(serverUnits, [], ME, [travel]);
    expect(merged).toHaveLength(2);
    // 사이보그 본체 이름이 보완되고, 이동 중 유닛은 최신 좌표·moving=true로 갱신된다
    expect(merged.find((u) => u.unitId === 10)?.name).toBe("DevCyborg");
    expect(merged.find((u) => u.unitId === 20)).toMatchObject({ latDeg: 2, lonDeg: 3, moving: true });
  });

  it("projectMyRoutes: 본캐 경로와 일반 유닛 경로·목적지 표적을 나눠 투영한다", () => {
    const travels: WorldTravel[] = [
      {
        unitId: 10,
        kind: "move",
        route: [100, 102],
        leg: 0,
        mapKey: 100,
        cellX: 10,
        cellY: 10,
        latDeg: 0,
        lonDeg: 0,
        targetX: 128,
        targetY: 128,
        startedAt: 0,
        arriveAt: 60_000,
        state: "going",
        stop: null,
        returning: false,
        scoutedMapKey: null,
        hidden: false,
        routePoints: [
          [0, 0],
          [1, 2],
        ],
      },
      {
        unitId: 30,
        kind: "scout",
        route: [100, 103],
        leg: 0,
        mapKey: 100,
        cellX: 10,
        cellY: 10,
        latDeg: -1,
        lonDeg: -1,
        targetX: 128,
        targetY: 128,
        startedAt: 0,
        arriveAt: 60_000,
        state: "going",
        stop: null,
        returning: false,
        scoutedMapKey: null,
        hidden: false,
        routePoints: [
          [-1, -1],
          [-2, 1],
        ],
      },
    ];
    const routes = projectMyRoutes(flatProjector(), travels, 10);
    expect(routes.cyborgRoute).toMatch(/^M.*L/);
    expect(routes.unitRoute).toMatch(/^M.*L/);
    expect(routes.targets).toHaveLength(2);
    expect(routes.targets.find((t) => t.unitId === 10)?.cyborg).toBe(true);
    expect(routes.targets.find((t) => t.unitId === 30)?.cyborg).toBe(false);
  });

  it("placeMyUnits: 본캐와 같은 자리 유닛은 옆으로 비켜 놓고, 같은 자리 여러 유닛은 하나로 묶는다", () => {
    const units: WorldMyUnit[] = [
      {
        unitId: 10,
        kind: "cyborg",
        mapKey: 100,
        cellX: 1,
        cellY: 1,
        latDeg: 0,
        lonDeg: 0,
        loaded: true,
        moving: false,
      },
      {
        unitId: 21,
        kind: "human",
        mapKey: 100,
        cellX: 1,
        cellY: 1,
        latDeg: 0,
        lonDeg: 0,
        loaded: true,
        moving: false,
      },
      {
        unitId: 22,
        kind: "human",
        mapKey: 100,
        cellX: 1,
        cellY: 1,
        latDeg: 0,
        lonDeg: 0,
        loaded: true,
        moving: false,
      },
      {
        unitId: 23,
        kind: "boat",
        mapKey: 101,
        cellX: 1,
        cellY: 1,
        latDeg: 2,
        lonDeg: 3,
        loaded: true,
        moving: false,
      },
    ];
    const placed = placeMyUnits(flatProjector(), units, { x: 400, y: 300, visible: true }, null);
    expect(placed).toHaveLength(2);
    const squad = placed.find((p) => p.count === 2);
    expect(squad).toBeDefined();
    // 본캐(400, 300)에서 비켜 서야 한다
    expect(Math.hypot((squad?.x ?? 0) - 400, (squad?.y ?? 0) - 300)).toBeGreaterThan(20);
    expect(placed.find((p) => p.unit.kind === "boat")?.count).toBe(1);
  });
});
