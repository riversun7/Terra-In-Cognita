// 숙소 회복·채집소 옮김 셈(logistics.ts) 시험 — 질문 1047 다·1050 가(D-533)
import { describe, expect, it } from "vitest";
import { TEST_SOCIETY_COEFFICIENTS } from "./coefficients.ts";
import {
  haulMs,
  haulTimeMs,
  haulTrips,
  lodgingBeds,
  restDutyPm,
  restRecoveryPm,
  walkMsPerCell,
  workSharePm,
} from "./logistics.ts";

const c = TEST_SOCIETY_COEFFICIENTS;

describe("숙소 회복", () => {
  it("숙소 레벨이 주거 등급 배율(N24)을 따르고, 집은 기본·노숙은 S25", () => {
    expect(restRecoveryPm({ kind: "lodging", level: 1 }, c)).toBe(1500);
    expect(restRecoveryPm({ kind: "lodging", level: 3 }, c)).toBe(3000);
    expect(restRecoveryPm({ kind: "home" }, c)).toBe(1000);
    expect(restRecoveryPm({ kind: "homeless" }, c)).toBe(100);
  });

  it("일한 몫 = 일 ÷ (일 + 쉼 + 오감): 집 25%, 숙소 Lv1 33%, Lv3 50%", () => {
    expect(workSharePm(1000, 0, c)).toBe(250);
    expect(workSharePm(1500, 0, c)).toBe(333);
    expect(workSharePm(3000, 0, c)).toBe(500);
    // 오감 20칸(왕복 40칸 × 걷기)이 쉼 바퀴에 붙는다
    expect(walkMsPerCell()).toBe(2344);
    expect(workSharePm(1500, 20, c)).toBe(331);
  });

  it("셈 배율은 집(오감 0)에 견준다. 길 위 숙소 > 먼 숙소 > 집 > 노숙", () => {
    const onRoute = restDutyPm({ kind: "lodging", level: 1 }, 2, c);
    const offRoute = restDutyPm({ kind: "lodging", level: 1 }, 40, c);
    expect(restDutyPm({ kind: "home" }, 0, c)).toBe(1000);
    expect(onRoute).toBeGreaterThan(offRoute);
    expect(offRoute).toBeGreaterThan(1000);
    expect(restDutyPm({ kind: "homeless" }, 0, c)).toBeLessThan(200);
  });

  it("숙소 회복을 끄면 1000", () => {
    const off = { ...c, logistics: { ...c.logistics, lodgingMode: 0 } };
    expect(restDutyPm({ kind: "lodging", level: 3 }, 0, off)).toBe(1000);
  });

  it("침대 = 레벨 × 칸", () => {
    expect(lodgingBeds(2, c)).toBe(20);
    expect(lodgingBeds(0, c)).toBe(0);
  });
});

describe("채집소 → 창고 옮김", () => {
  it("횟수는 화물 상한으로 올림", () => {
    expect(haulTrips(0n, 80_000)).toBe(0);
    expect(haulTrips(1n, 80_000)).toBe(1);
    expect(haulTrips(160_001n, 80_000)).toBe(3);
  });

  it("시간 = 횟수 × 왕복 ÷ 나르는 사람(올림), 칸 0이면 0", () => {
    expect(haulTimeMs(20_000n, 10, 1, 80_000)).toBe(2 * 10 * 2344);
    expect(haulTimeMs(240_000n, 10, 2, 80_000)).toBe(Math.ceil((3 * 2 * 10 * 2344) / 2));
    expect(haulTimeMs(20_000n, 0, 1, 80_000)).toBe(0);
  });

  it("설정 칸 화물 상한을 쓰고, 끄면 0", () => {
    expect(haulMs(80_001n, 5, 1, c)).toBe(2 * 2 * 5 * 2344);
    const off = { ...c, logistics: { ...c.logistics, haulMode: 0 } };
    expect(haulMs(80_001n, 5, 1, off)).toBe(0);
  });
});
