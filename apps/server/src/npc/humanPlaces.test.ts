// NPC 휴먼 집·일터 나누기 시험 — 기획 답 740 나, docs/adr/2026-11-07-play-flow.md "WP-NPC2". 도시 경제 일꾼 수 → 휴먼(유닛 ID 차례).
// 일하는 때(770 나, "WP-NPC4"): 일터를 받은 휴먼은 그 2차맵 경도·설정 칸 시각을 함께 받는다.
import type { BuildingPlacement } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { BotHome } from "../world/bots.ts";
import { cellKey } from "@terra/planet";
import { DEFAULT_WORK_SHIFT } from "../world/bots.ts";
import {
  HAUL_DROP_RADIUS_CELLS,
  WORK_MARGIN_CELLS,
  assignHumanPlaces,
  createHumanPlaces,
  mapLongitudeDeg,
  workAreaOf,
} from "./humanPlaces.ts";

const home = { x: 128, y: 128 };

describe("workAreaOf", () => {
  it("건물 가운데 칸 둘레, 반 폭 + 여백(돌린 건물은 가로·세로가 바뀐다)", () => {
    expect(workAreaOf({ x: 100, y: 50, width: 4, height: 2, rotation: 0 })).toEqual({
      x: 102,
      y: 51,
      radius: 2 + WORK_MARGIN_CELLS,
    });
    expect(workAreaOf({ x: 100, y: 50, width: 4, height: 2, rotation: 90 })).toEqual({
      x: 101,
      y: 52,
      radius: 2 + WORK_MARGIN_CELLS,
    });
  });
});

describe("assignHumanPlaces", () => {
  const farm = { x: 90, y: 90, radius: 5 };
  const camp = { x: 160, y: 100, radius: 5 };
  const areas = new Map([
    [10, farm],
    [11, camp],
  ]);

  it("시설 ID 차례로 일꾼 수만큼 유닛 ID 차례의 휴먼을 채운다. 도시 직무·남은 휴먼은 집만", () => {
    const homes = assignHumanPlaces({
      humans: [305, 301, 304, 302, 303, 306],
      home,
      facilities: [
        { id: 1_000_000_000_016, buildingId: null, workers: 1 },
        { id: 11, buildingId: 11, workers: 2 },
        { id: 10, buildingId: 10, workers: 2 },
      ],
      areas,
    });
    expect(homes.get(301)?.work).toEqual(farm);
    expect(homes.get(302)?.work).toEqual(farm);
    expect(homes.get(303)?.work).toEqual(camp);
    expect(homes.get(304)?.work).toEqual(camp);
    // 도시 직무(건물 없음)와 일이 없는 휴먼은 집 둘레만
    expect(homes.get(305)).toEqual(home);
    expect(homes.get(306)).toEqual(home);
    expect(homes.size).toBe(6);
  });

  it("일꾼 수가 휴먼보다 많으면 앞 시설부터 채우고 끝난다. 2차맵에 없는 건물은 일터 없이", () => {
    const homes = assignHumanPlaces({
      humans: [1, 2],
      home,
      facilities: [
        { id: 10, buildingId: 10, workers: 5 },
        { id: 12, buildingId: 12, workers: 5 },
      ],
      areas,
    });
    expect([...homes.values()].every((entry) => entry.work === farm)).toBe(true);
    const missing = assignHumanPlaces({
      humans: [1],
      home,
      facilities: [{ id: 12, buildingId: 12, workers: 1 }],
      areas,
    });
    expect(missing.get(1)).toEqual(home);
  });
});

describe("createHumanPlaces", () => {
  it("숙소가 있으면 일꾼의 집은 일터에서 가장 가까운 숙소 둘레(그 숙소 반경), 일 없는 휴먼·경비대는 시청 칸 둘레", () => {
    const east = { x: 160, y: 128, radius: 5 };
    const west = { x: 100, y: 128, radius: 5 };
    const lodgeEast = { x: 145, y: 128, radius: 4 };
    const lodgeWest = { x: 112, y: 130, radius: 4 };
    const homes = assignHumanPlaces({
      humans: [1, 2, 3],
      guards: [9],
      home,
      facilities: [
        { id: 10, buildingId: 10, workers: 1 },
        { id: 11, buildingId: 11, workers: 1 },
      ],
      areas: new Map([
        [10, east],
        [11, west],
      ]),
      lodgings: [lodgeWest, lodgeEast],
    });
    expect(homes.get(1)).toMatchObject({ x: 145, y: 128, homeRadius: 4, work: east });
    expect(homes.get(2)).toMatchObject({ x: 112, y: 130, homeRadius: 4, work: west });
    expect(homes.get(3)).toEqual(home);
    expect(homes.get(9)).toEqual(home);
    // 숙소가 없으면 예전처럼 시청 칸
    const none = assignHumanPlaces({
      humans: [1],
      home,
      facilities: [{ id: 10, buildingId: 10, workers: 1 }],
      areas: new Map([[10, east]]),
    });
    expect(none.get(1)).toMatchObject({ x: 128, y: 128, work: east });
    expect(none.get(1)?.homeRadius).toBeUndefined();
    // 쉼터 계획(질문 1047 다)이 있으면 그 차례대로: 첫 일꾼은 서쪽 숙소, 둘째는 침대가 없어 시청 칸
    const planned = assignHumanPlaces({
      humans: [1, 2],
      home,
      facilities: [{ id: 10, buildingId: 10, workers: 2 }],
      areas: new Map([[10, east]]),
      lodgings: [lodgeWest, lodgeEast],
      rests: [lodgeWest, undefined],
    });
    expect(planned.get(1)).toMatchObject({ x: 112, y: 130, homeRadius: 4, work: east });
    expect(planned.get(2)).toMatchObject({ x: 128, y: 128, work: east });
    // 피로 바퀴(질문 1095 가): 같은 차례의 바퀴가 일하는 때에 얹힌다
    const cycle = { workMs: 7_200_000, periodMs: 21_600_000 };
    const cycled = assignHumanPlaces({
      humans: [1, 2],
      home,
      facilities: [{ id: 10, buildingId: 10, workers: 2 }],
      areas: new Map([[10, east]]),
      rests: [lodgeWest, undefined],
      cycles: [cycle, undefined],
    });
    expect(cycled.get(1)?.shift?.cycle).toEqual(cycle);
    expect(cycled.get(2)?.shift?.cycle).toBeUndefined();
  });

  it("도시 2차맵에 선 휴먼만, 바뀐 휴먼만 2차맵에 넣는다", () => {
    const set = new Map<number, BotHome | null>();
    const onMap = new Set([1, 2, 3]);
    const placement: BuildingPlacement = { x: 88, y: 88, width: 4, height: 4, rotation: 0 };
    const map = {
      forEachBuilding: (visit: (building: { id: number; placement: BuildingPlacement }) => void) =>
        visit({ id: 10, placement }),
      unitInfo: (unitId: number) => (onMap.has(unitId) ? {} : undefined),
      setHome: (unitId: number, value: BotHome | null) => {
        set.set(unitId, value);
        return true;
      },
    };
    const units = new Map([
      [1, { id: 1, city: 7 }],
      [2, { id: 2, city: 7 }],
      [3, { id: 3, city: 7 }],
      // 다른 2차맵 도시로 옮겨 간 휴먼(이 2차맵에 없다)
      [4, { id: 4, city: 7 }],
    ]);
    const places = new Map([[7, { mapKey: 99, cellX: 128, cellY: 128 }]]);
    let workers = 1;
    const input = {
      units,
      places,
      maps: new Map([[99, map]]),
      facilitiesOf: () => [{ id: 10, buildingId: 10, workers }],
    };
    const people = createHumanPlaces();
    expect(people.sync(input)).toBe(3);
    expect(set.get(1)?.work).toEqual(workAreaOf(placement));
    expect(set.get(2)).toEqual(home);
    expect(set.has(4)).toBe(false);
    // 그대로면 다시 넣지 않는다
    expect(people.sync(input)).toBe(0);
    // 일꾼이 늘면 그 휴먼만
    workers = 2;
    expect(people.sync(input)).toBe(1);
    expect(set.get(2)?.work).toEqual(workAreaOf(placement));
  });

  it("일터를 받은 휴먼은 그 2차맵 경도·일하는 시각을 받고, 설정 칸이 바뀌면 일꾼 모두를 다시 넣는다(770 나)", () => {
    const set = new Map<number, BotHome | null>();
    const placement: BuildingPlacement = { x: 88, y: 88, width: 4, height: 4, rotation: 0 };
    const mapKey = cellKey(2, 9, 100, 200);
    const map = {
      forEachBuilding: (visit: (building: { id: number; placement: BuildingPlacement }) => void) =>
        visit({ id: 10, placement }),
      unitInfo: () => ({}),
      setHome: (unitId: number, value: BotHome | null) => {
        set.set(unitId, value);
        return true;
      },
    };
    const input = {
      units: new Map([
        [1, { id: 1, city: 7 }],
        [2, { id: 2, city: 7 }],
        [3, { id: 3, city: 7 }],
      ]),
      places: new Map([[7, { mapKey, cellX: 128, cellY: 128 }]]),
      maps: new Map([[mapKey, map]]),
      facilitiesOf: () => [{ id: 10, buildingId: 10, workers: 2 }],
      workHours: { startPm: 250, endPm: 750 },
    };
    const people = createHumanPlaces();
    expect(people.sync(input)).toBe(3);
    expect(set.get(1)?.shift).toEqual({ lonDeg: mapLongitudeDeg(mapKey), startPm: 250, endPm: 750 });
    // 일터 없는 휴먼은 일하는 때가 없다(집 둘레만)
    expect(set.get(3)).toEqual(home);
    // 개발자 패널에서 일하는 시각을 바꾸면(늘 일터) 일꾼만 다시 넣는다
    expect(people.sync({ ...input, workHours: { startPm: 0, endPm: 1000 } })).toBe(2);
    expect(set.get(2)?.shift?.endPm).toBe(1000);
    // 시각을 주지 않으면 기본(06:00~18:00)
    expect(people.sync({ ...input, workHours: undefined })).toBe(2);
    expect(set.get(1)?.shift?.startPm).toBe(DEFAULT_WORK_SHIFT.startPm);
  });
});

describe("보이는 운반꾼(D-570 1886)", () => {
  const placement: BuildingPlacement = { x: 88, y: 88, width: 4, height: 4, rotation: 0 };
  const haul = { x: 140, y: 120, fromMs: 1_000, untilMs: 61_000 };

  it("옮김이 있는 건물 시설은 첫 일꾼만 창고 둘레 운반 일정을 받는다", () => {
    const homes = assignHumanPlaces({
      humans: [1, 2],
      home,
      facilities: [{ id: 10, buildingId: 10, workers: 2, haul }],
      areas: new Map([[10, workAreaOf(placement)]]),
    });
    expect(homes.get(1)?.haul).toEqual({
      area: { x: 140, y: 120, radius: HAUL_DROP_RADIUS_CELLS },
      fromMs: 1_000,
      untilMs: 61_000,
    });
    expect(homes.get(2)?.haul).toBeUndefined();
  });

  it("보는 사람이 있는 2차맵에만 붙인다(보지 않는 2차맵은 시간 셈만)", () => {
    const set = new Map<number, BotHome | null>();
    const stream = { subscriberCount: 0 };
    const map = {
      forEachBuilding: (visit: (building: { id: number; placement: BuildingPlacement }) => void) =>
        visit({ id: 10, placement }),
      unitInfo: () => ({}),
      setHome: (unitId: number, value: BotHome | null) => {
        set.set(unitId, value);
        return true;
      },
      stream,
    };
    const input = {
      units: new Map([[1, { id: 1, city: 7 }]]),
      places: new Map([[7, { mapKey: 99, cellX: 128, cellY: 128 }]]),
      maps: new Map([[99, map]]),
      facilitiesOf: () => [{ id: 10, buildingId: 10, workers: 1, haul }],
    };
    const people = createHumanPlaces();
    people.sync(input);
    expect(set.get(1)?.haul).toBeUndefined();
    stream.subscriberCount = 1;
    expect(people.sync(input)).toBe(1);
    expect(set.get(1)?.haul?.untilMs).toBe(61_000);
  });
});

describe("mapLongitudeDeg", () => {
  it("셀 키 → 칸 가운데 방향의 경도(−180 초과 180 이하), 셀 키가 아니면 0", () => {
    for (const key of [cellKey(0, 9, 256, 256), cellKey(1, 9, 10, 500), cellKey(4, 9, 300, 40)]) {
      const lon = mapLongitudeDeg(key);
      expect(lon).toBeGreaterThan(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
    // 면 0 가운데 = 경도 0 근처(+x)
    expect(Math.abs(mapLongitudeDeg(cellKey(0, 9, 255, 255)))).toBeLessThan(1);
    expect(mapLongitudeDeg(-1)).toBe(0);
  });
});
