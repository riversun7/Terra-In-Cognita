// 거래 직무 자리 값(기획 대조 2204 — NPC 거래소도 자리를 낸다, D-555 1509·D-212): 주인이 낸 값 먼저, 줄이 없는 NPC 거래소는 적정가 × ‰
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { hourlyFair } from "../business/fairPrice.ts";
import { deskRentOf, npcDeskRent, npcDeskRentOf, workerHourly } from "./deskRent.ts";
import { wageRulesOf } from "./rules.ts";

const row = (ownerId: number, rentPerHour: bigint) => ({
  buildingId: 1,
  ownerId,
  asset: "credit",
  rentPerHour,
  updatedAtMs: 0,
});

const npc = (): bigint => 77n;

describe("거래 직무 자리 값", () => {
  it("주인이 낸 값이 있으면 그 값(0 = 내지 않음), 줄이 없을 때만 NPC 셈", () => {
    expect(deskRentOf(row(5, 30n), 5, npc)).toBe(30n);
    expect(deskRentOf(row(5, 0n), 5, npc)).toBeNull();
    expect(deskRentOf(undefined, 5, npc)).toBe(77n);
    // 주인이 바뀐 옛 줄은 없는 것과 같다
    expect(deskRentOf(row(4, 30n), 5, npc)).toBe(77n);
    expect(deskRentOf(undefined, null, npc)).toBeNull();
    expect(deskRentOf(undefined, 5, undefined)).toBeNull();
  });

  it("NPC 자리 값 = 일꾼 한 명 시간당 인건비 + 수수료(적정가) × ‰, 0‰면 자리를 내지 않는다", () => {
    expect(workerHourly(100n, 1_800_000, 3_600_000)).toBe(200n);
    expect(workerHourly(1n, 7_200_000, 3_600_000)).toBe(1n);
    const fair = hourlyFair(200n, { feePm: 200, taxBp: 0 }).price;
    expect(npcDeskRent(200n, 200, 1000)).toBe(fair);
    expect(npcDeskRent(200n, 200, 500)).toBe(fair / 2n);
    expect(npcDeskRent(200n, 200, 0)).toBeNull();
    const rules = wageRulesOf(TEST_SOCIETY_COEFFICIENTS);
    expect(npcDeskRentOf(rules, undefined)).toBeNull();
    expect(npcDeskRentOf(rules, 1000)).toBeGreaterThan(0n);
  });
});
