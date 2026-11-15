// D-559 셈 시험(rules.ts·@terra/shared/harbor·@terra/shared/naval) — 모듈 자리(1521), 도크 장기 보관료(1523), 연료·오버히트(1529·1540), 보직·갑판병 수리(1533)
import { modulesValid, shipyardModuleSlots } from "@terra/shared/harbor";
import { postSeats } from "@terra/shared/naval";
import { START_BOATS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  boatSpeedPm,
  deckRepairPpm,
  fuelBurnMilli,
  fuelTankMilli,
  overheatWearPpm,
  overlapMs,
  storageDue,
  wearPerDayPm,
} from "./rules.ts";

describe("D-559 배 셈", () => {
  it("모듈 자리(1521): 레벨 2부터 레벨마다 하나, 도크 늘림은 겹치고 특화는 하나씩", () => {
    expect(shipyardModuleSlots(1)).toBe(0);
    expect(shipyardModuleSlots(2)).toBe(1);
    expect(shipyardModuleSlots(3)).toBe(2);
    expect(modulesValid(["docks", "docks"], 3)).toBe(true);
    expect(modulesValid(["build", "repair"], 3)).toBe(true);
    expect(modulesValid(["build", "build"], 3)).toBe(false);
    expect(modulesValid(["docks", "build"], 2)).toBe(false);
    expect(modulesValid([], 1)).toBe(true);
  });

  it("장기 보관료(1523): 보관료 없는 시간 뒤 하루(올림)마다, 고치는 중이면 0", () => {
    const free = START_BOATS.storageFreeHours * HOUR_MS;
    expect(storageDue(null, 10 * DAY_MS, 20, START_BOATS)).toBe(0n);
    expect(storageDue(0, free, 20, START_BOATS)).toBe(0n);
    expect(storageDue(0, free + 1, 20, START_BOATS)).toBe(20n);
    expect(storageDue(0, free + DAY_MS + 1, 20, START_BOATS)).toBe(40n);
    expect(storageDue(0, free + DAY_MS + 1, 0, START_BOATS)).toBe(0n);
  });

  it("도크에 든 배는 닳지 않는다", () => {
    expect(wearPerDayPm("docked", START_BOATS)).toBe(0);
  });

  it("연료(1529·1540): 움직인 시간 × 한 시간 연료, 오버히트면 더, 종류 칸이 없으면 설정 칸", () => {
    expect(fuelTankMilli(undefined, START_BOATS)).toBe(START_BOATS.fuelCapacity * 1000);
    expect(fuelTankMilli({ fuelCapacity: 600 }, START_BOATS)).toBe(600_000);
    expect(fuelBurnMilli({ fuelPerHour: 60 }, HOUR_MS, false, START_BOATS)).toBe(60_000);
    expect(fuelBurnMilli({ fuelPerHour: 60 }, HOUR_MS / 2, true, START_BOATS)).toBe(60_000);
    expect(fuelBurnMilli(undefined, 0, true, START_BOATS)).toBe(0);
    expect(overlapMs(0, 100, 50, 200)).toBe(50);
    expect(overlapMs(0, 100, 150, 200)).toBe(0);
  });

  it("빠르기: 내구도 0 × 연료 없음은 겹치고, 오버히트는 연료가 있을 때만", () => {
    expect(boatSpeedPm({ speedPm: 1000 }, 1, START_BOATS, { empty: false, overheat: true })).toBe(1300);
    expect(boatSpeedPm({ speedPm: 1000 }, 1, START_BOATS, { empty: true, overheat: true })).toBe(200);
    expect(boatSpeedPm({ speedPm: 1000 }, 0, START_BOATS, { empty: true, overheat: false })).toBe(50);
  });

  it("오버히트 닳음은 엔진실이 줄이고, 갑판병은 상한까지 고친다(1533)", () => {
    expect(overheatWearPpm(HOUR_MS, 0, START_BOATS)).toBe(20_000);
    expect(overheatWearPpm(HOUR_MS, 2, START_BOATS)).toBe(10_000);
    expect(overheatWearPpm(HOUR_MS, 9, START_BOATS)).toBe(0);
    expect(deckRepairPpm(100_000, 2, HOUR_MS, START_BOATS)).toBe(10_000);
    expect(deckRepairPpm(498_000, 2, HOUR_MS, START_BOATS)).toBe(2_000);
    expect(deckRepairPpm(600_000, 2, HOUR_MS, START_BOATS)).toBe(0);
    expect(deckRepairPpm(100_000, 0, HOUR_MS, START_BOATS)).toBe(0);
  });

  it("보직 자리(1533): 함장 1, 함선 칸이 없으면 갑판병 1, 조종사는 격납고가 있을 때만", () => {
    expect(postSeats(undefined, "captain")).toBe(1);
    expect(postSeats(undefined, "deck")).toBe(1);
    expect(postSeats(undefined, "gunner")).toBe(0);
    expect(postSeats({ crew: { gunner: 2 }, hangar: 0 }, "gunner")).toBe(2);
    expect(postSeats({ crew: { pilot: 3 }, hangar: 0 }, "pilot")).toBe(0);
    expect(postSeats({ crew: { pilot: 3 }, hangar: 2 }, "pilot")).toBe(3);
  });
});
