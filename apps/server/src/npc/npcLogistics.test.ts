// NPC 물류센터 시험(house-10, 기획 대조 2301 — D-555 1505·1509·D-554): 운반꾼 세우기(시설 일꾼 다음 일 없는 휴먼), 성향 가중 증축 판단, 운반 길 일꾼 줄
import { TEST_SOCIETY_COEFFICIENTS, npcBaseDailyWage } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  LOGISTICS_WORK_BASE,
  assignCenterStaff,
  createNpcLogistics,
  npcCenterHourly,
  wantsCenter,
  withNpcStaff,
} from "./npcLogistics.ts";

describe("NPC 물류센터 운반꾼", () => {
  it("assignCenterStaff: 건물 ID 차례로 자리 수만큼 앞에서부터, 사람이 모자라면 뒤 물류센터는 빈다", () => {
    const staff = assignCenterStaff(
      [11, 12, 13, 14, 15],
      [
        { buildingId: 9, slots: 4 },
        { buildingId: 3, slots: 2 },
      ],
    );
    expect([...staff]).toEqual([
      [3, [11, 12]],
      [9, [13, 14, 15]],
    ]);
    expect([...assignCenterStaff([], [{ buildingId: 1, slots: 2 }])]).toEqual([[1, []]]);
  });

  it("도시 경제 시설 일꾼 다음 일 없는 휴먼(경비대 빼고)이 그 나라 물류센터 운반꾼 — 남의 물류센터·레벨 0·다른 시설은 빼고, 보이는 일터는 맨 뒤", () => {
    const units = new Map(
      [1, 2, 3, 4, 5, 6].map((id) => [id, { id, city: 7, owner: 50, guard: id === 6 ? true : undefined }]),
    );
    let now = 1_000;
    const logistics = createNpcLogistics({
      world: { cities: new Map([[7, { owner: 50 }]]), units },
      // 도시 경제 시설 하나가 일꾼 둘(휴먼 1·2)
      economy: { facilities: new Map([[100, { id: 100, city: 7, workers: 2 }]]) },
      facilitiesIn: () => [
        { buildingId: 40, facility: "logistics_center", level: 1, ownerId: 50 },
        { buildingId: 41, facility: "logistics_center", level: 1, ownerId: 99 },
        { buildingId: 42, facility: "logistics_center", level: 0, ownerId: 50 },
        { buildingId: 43, facility: "farm", level: 1, ownerId: 50 },
      ],
      defOf: (id) =>
        id === "logistics_center" ? { logistics: true, slotsPerLevel: 2 } : { slotsPerLevel: 3 },
      cityOf: (buildingId) => (buildingId >= 40 ? 7 : undefined),
      now: () => now,
    });
    expect(logistics.staffAt(40)).toEqual([3, 4]);
    expect(logistics.staffAt(41)).toEqual([]);
    expect(logistics.staffAt(99)).toEqual([]);
    expect(logistics.workFacilities(7)).toEqual([
      { id: LOGISTICS_WORK_BASE + 40, buildingId: 40, workers: 2 },
    ]);
    // 1초 안에는 같은 표, 지나면 다시 센다(휴먼이 줄면 운반꾼도 준다)
    units.delete(4);
    expect(logistics.staffAt(40)).toEqual([3, 4]);
    now += 1_000;
    expect(logistics.staffAt(40)).toEqual([3, 5]);
  });

  it("withNpcStaff: 노동 계약 일꾼이 있으면 그대로, 없으면 NPC 운반꾼(주인 모르는 유닛은 뺀다)", () => {
    const hired = [{ unitId: 8, workerOwnerId: 2, via: "wage" as const }];
    expect(withNpcStaff(hired, [3], () => 50)).toBe(hired);
    expect(withNpcStaff([], [3, 4], (unitId) => (unitId === 3 ? 50 : undefined))).toEqual([
      { unitId: 3, workerOwnerId: 50, via: "npc" },
    ]);
    expect(withNpcStaff([], undefined, () => 50)).toEqual([]);
  });

  it("적정가 인건비: 운반꾼 수 × NPC 기준 임금 ÷ 24", () => {
    const daily = npcBaseDailyWage(TEST_SOCIETY_COEFFICIENTS);
    expect(npcCenterHourly(3, TEST_SOCIETY_COEFFICIENTS)).toBe((3n * daily) / 24n);
    expect(npcCenterHourly(0, TEST_SOCIETY_COEFFICIENTS)).toBe(0n);
  });
});

describe("NPC 물류센터 증축 판단(성향 가중)", () => {
  const rule = { traitMin: 0, traitMax: 1000, npcBuildWaits: 3, npcBuildHumans: 30 };

  it("기다리는 일 × 상업 성향 배율 ≥ 문턱, 휴먼이 모자라면 짓지 않는다", () => {
    // 가운데 성향(1000‰): 3개면 짓는다, 2개면 안 짓는다
    expect(wantsCenter({ waiting: 3, humans: 40, commerce: 500 }, rule)).toBe(true);
    expect(wantsCenter({ waiting: 2, humans: 40, commerce: 500 }, rule)).toBe(false);
    // 상업 성향 가장 높음(1500‰): 2개로도 짓는다, 가장 낮음(500‰): 6개가 있어야
    expect(wantsCenter({ waiting: 2, humans: 40, commerce: 1000 }, rule)).toBe(true);
    expect(wantsCenter({ waiting: 5, humans: 40, commerce: 0 }, rule)).toBe(false);
    expect(wantsCenter({ waiting: 6, humans: 40, commerce: 0 }, rule)).toBe(true);
    // 휴먼 하한
    expect(wantsCenter({ waiting: 9, humans: 29, commerce: 1000 }, rule)).toBe(false);
  });
});
