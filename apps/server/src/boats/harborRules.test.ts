// 배 체계 셈 시험(rules.ts — 기획 D-547 1483·1484·1485·1487·1488·1494·1495·1500, docs/adr/2026-11-15-shipyard-harbor.md)
import { HULL_FULL } from "@terra/shared/harbor";
import { START_BOATS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { BoatTypeDef, FacilityDef } from "../facilities/catalog.ts";
import { OPERATOR_SPEED_FACTOR } from "../world/operatorPace.ts";
import {
  DAY_MS,
  berthCapacity,
  boatBuildMs,
  boatCost,
  boatSpeedPm,
  boatTypesOf,
  dueDays,
  harborOpen,
  moduleUnlocked,
  repairPlan,
  shipyardDocks,
  tradeSlots,
  wearPerDayPm,
  wornHull,
} from "./rules.ts";

const ROW: BoatTypeDef = {
  id: "rowboat",
  name: { ko: "작은 배", en: "Rowboat" },
  materials: [
    { item: "pine_log", qty: 14 },
    { item: "stone", qty: 4 },
  ],
  buildMs: 600_000,
  speedPm: 1000,
  capacity: 4,
};

/* oxlint-disable typescript/no-unsafe-type-assertion -- 시험: 역할·배 종류만 쓰는 가짜 시설 정의 */
const yard = (id: string, boats: BoatTypeDef[]) =>
  ({ id, harbor: "shipyard", boats }) as unknown as FacilityDef;
const berthDef = { id: "dock", harbor: "berth" } as unknown as FacilityDef;
/* oxlint-enable typescript/no-unsafe-type-assertion */

describe("배 체계 셈", () => {
  it("배 종류 표: 조선소 차례로, 같은 ID는 처음 것", () => {
    const types = boatTypesOf({
      facilities: [
        yard("a", [ROW]),
        yard("b", [
          { ...ROW, capacity: 9 },
          { ...ROW, id: "cargo_boat" },
        ]),
        berthDef,
      ],
    });
    expect([...types.keys()]).toEqual(["rowboat", "cargo_boat"]);
    expect(types.get("rowboat")?.capacity).toBe(4);
  });

  it("값·시간(1484): 종류 재료 × ‰, 종류 시간 × ‰, 건조 특화, 운영자 빠르기", () => {
    expect(boatCost(ROW, 500)).toEqual([
      { item: "pine_log", qty: 7 },
      { item: "stone", qty: 2 },
    ]);
    expect(boatCost(ROW, 0)).toEqual([]);
    expect(boatBuildMs(ROW, START_BOATS, [], false)).toBe(600_000);
    expect(boatBuildMs(ROW, START_BOATS, ["build"], false)).toBe(420_000);
    expect(boatBuildMs(ROW, START_BOATS, [], true)).toBe(600_000 / OPERATOR_SPEED_FACTOR);
    expect(boatBuildMs(ROW, { ...START_BOATS, buildTimePm: 0 }, [], false)).toBe(0);
  });

  it("도크(1483·D-559 1521 — 모듈 하나마다)·정박 자리(1487)·임시 자리(1488)", () => {
    expect(shipyardDocks(0, [], START_BOATS)).toBe(0);
    expect(shipyardDocks(3, [], START_BOATS)).toBe(1);
    expect(shipyardDocks(3, ["build"], START_BOATS)).toBe(1);
    expect(shipyardDocks(3, ["docks"], START_BOATS)).toBe(2);
    expect(shipyardDocks(3, ["docks", "docks"], START_BOATS)).toBe(3);
    // 자리 수(레벨 2 = 하나)를 넘는 모듈은 세지 않는다
    expect(shipyardDocks(2, ["docks", "docks"], START_BOATS)).toBe(2);
    expect(moduleUnlocked(1)).toBe(false);
    expect(moduleUnlocked(2)).toBe(true);
    expect(berthCapacity(3, START_BOATS)).toBe(6);
    expect(tradeSlots(2, START_BOATS)).toBe(8);
  });

  it("닳음(1485): 정박 중 < 밖 < 집 없음, 수리 중은 닳지 않는다, 0 아래로 가지 않는다", () => {
    expect(wearPerDayPm("berthed", START_BOATS)).toBe(2);
    expect(wearPerDayPm("away", START_BOATS)).toBe(10);
    expect(wearPerDayPm("homeless", START_BOATS)).toBe(40);
    expect(wearPerDayPm("repair", START_BOATS)).toBe(0);
    expect(wornHull(HULL_FULL, 0, DAY_MS, "away", START_BOATS)).toBe(HULL_FULL - 10_000);
    expect(wornHull(HULL_FULL, 0, DAY_MS / 2, "berthed", START_BOATS)).toBe(HULL_FULL - 1_000);
    expect(wornHull(5_000, 0, DAY_MS, "homeless", START_BOATS)).toBe(0);
    expect(wornHull(HULL_FULL, DAY_MS, 0, "away", START_BOATS)).toBe(HULL_FULL);
  });

  it("빠르기(1495): 종류 ‰, 내구도 0이면 × 아주 느리게", () => {
    expect(boatSpeedPm(ROW, HULL_FULL, START_BOATS)).toBe(1000);
    expect(boatSpeedPm({ speedPm: 600 }, 1, START_BOATS)).toBe(600);
    expect(boatSpeedPm({ speedPm: 600 }, 0, START_BOATS)).toBe(150);
    expect(boatSpeedPm(undefined, 0, START_BOATS)).toBe(250);
  });

  it("수리(1494): 잃은 몫만큼 재료(올림)·시간, 수리 특화, 가득이면 없음", () => {
    expect(repairPlan(ROW, HULL_FULL, START_BOATS, [], false)).toBeNull();
    const half = repairPlan(ROW, HULL_FULL / 2, START_BOATS, [], false);
    // 14 × ½ × 500‰ = 3.5 → 4, 4 × ½ × 500‰ = 1
    expect(half?.materials).toEqual([
      { item: "pine_log", qty: 4 },
      { item: "stone", qty: 1 },
    ]);
    expect(half?.ms).toBe(90_000);
    const spec = repairPlan(ROW, HULL_FULL / 2, START_BOATS, ["repair"], false);
    expect(spec?.ms).toBe(54_000);
    expect(repairPlan(ROW, 0, START_BOATS, [], true)?.materials).toEqual([]);
  });

  it("운행 정지(1500)·정박료 날 수", () => {
    // D-559 1527 "정지 기준 30%"
    expect(harborOpen(300_000, START_BOATS)).toBe(true);
    expect(harborOpen(299_999, START_BOATS)).toBe(false);
    expect(dueDays(0, DAY_MS - 1)).toBe(0);
    expect(dueDays(0, 3 * DAY_MS + 5)).toBe(3);
  });
});
