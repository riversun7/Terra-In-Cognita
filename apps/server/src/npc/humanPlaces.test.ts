// NPC 휴먼 집·일터 나누기 시험 — 기획 답 740 나, docs/adr/2026-11-07-play-flow.md "WP-NPC2". 도시 경제 일꾼 수 → 휴먼(유닛 ID 차례).
import type { BuildingPlacement } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { BotHome } from "../world/bots.ts";
import { WORK_MARGIN_CELLS, assignHumanPlaces, createHumanPlaces, workAreaOf } from "./humanPlaces.ts";

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
});
