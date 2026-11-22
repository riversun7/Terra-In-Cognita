// NPC 집주인 시험(npcLandlord.ts — 기획 검토 2735, fixes-1117j). 가짜 세계·집세 표(메모리)로 본다.
import { describe, expect, it } from "vitest";
import type { ResidenceWorld } from "./book.ts";
import { createNpcLandlord, npcLandlordRent, npcLandlordSharePm } from "./npcLandlord.ts";
import { createRentTable } from "./rent.ts";

type Facts = NonNullable<ReturnType<ResidenceWorld["building"]>>;

const facts = (over: Partial<Facts>): Facts => ({
  cityId: 1,
  level: 1,
  living: true,
  ownerId: 500,
  capacity: 4,
  rent: null,
  ...over,
});

describe("NPC 집주인 집세 규칙식", () => {
  it("몫 = 1000 + (상업 − 500) × 무게 ÷ 500, 집세 = 숙박비 × 몫 ÷ 1000 올림", () => {
    const rules = { npcLandlordFactorPm: 1000, npcLandlordTemperPm: 500 };
    expect(npcLandlordSharePm(500, rules)).toBe(1000);
    expect(npcLandlordSharePm(1000, rules)).toBe(1500);
    expect(npcLandlordSharePm(0, rules)).toBe(500);
    expect(npcLandlordRent(10n, 1000, rules)).toBe(15n);
    expect(npcLandlordRent(3n, 0, rules)).toBe(2n);
    expect(npcLandlordRent(0n, 1000, rules)).toBe(0n);
  });
});

/** 훑기 시험 세계: NPC 나라(500) 숙소·플레이어 집·생활 단계 아님·덜 지음 */
const setup = (mode: number) => {
  const buildings = new Map<number, Facts>([
    // NPC 나라(500) 숙소 레벨 2
    [10, facts({ level: 2 })],
    // 플레이어 집(700) — 건드리지 않는다
    [11, facts({ ownerId: 700 })],
    // NPC 나라 숙소가 아닌 건물(생활 단계 아님)
    [12, facts({ living: false })],
    // 아직 다 짓지 않은 NPC 숙소
    [13, facts({ level: 0 })],
  ]);
  const rents = createRentTable();
  const world = { building: (id: number) => buildings.get(id) };
  const npc = {
    isNpcOwner: (owner: number) => owner === 500,
    commerceOf: () => 1000,
    lodgingPeriodFee: (level: number) => BigInt(level * 10),
  };
  const rules = { npcLandlordMode: mode, npcLandlordFactorPm: 1000, npcLandlordTemperPm: 500 };
  const landlord = createNpcLandlord({
    buildingIds: () => buildings.keys(),
    world,
    rents,
    npc: () => npc,
    rules: () => rules,
    periodMs: () => 86_400_000,
  });
  return { landlord, rents, rules };
};

describe("NPC 집주인 훑기", () => {
  it("NPC 나라의 다 지은 숙소에만 집세를 정하고, 같으면 다시 쓰지 않는다", async () => {
    const { landlord, rents } = setup(1);
    expect(await landlord.sweep(1000)).toEqual({ set: 1, cleared: 0 });
    // 숙박비 20(레벨 2) × 1500‰ = 30
    expect(rents.rowOf(10)).toEqual({ buildingId: 10, ownerId: 500, rent: 30n, setAtMs: 1000 });
    expect(rents.rowOf(11)).toBeUndefined();
    expect(rents.rowOf(12)).toBeUndefined();
    expect(rents.rowOf(13)).toBeUndefined();
    expect(await landlord.sweep(2000)).toEqual({ set: 0, cleared: 0 });
  });

  it("끄면 NPC가 정한 집세만 거둬들인다(플레이어가 정한 줄은 그대로)", async () => {
    const { landlord, rents, rules } = setup(1);
    rents.put({ buildingId: 11, ownerId: 700, rent: 5n, setAtMs: 0 });
    await landlord.sweep(1000);
    const off = { ...rules, npcLandlordMode: 0 };
    const offLandlord = createNpcLandlord({
      buildingIds: () => [10, 11],
      world: { building: (id) => (id === 10 ? facts({ level: 2 }) : facts({ ownerId: 700 })) },
      rents,
      npc: () => ({
        isNpcOwner: (owner) => owner === 500,
        commerceOf: () => 500,
        lodgingPeriodFee: () => 1n,
      }),
      rules: () => off,
      periodMs: () => 86_400_000,
    });
    expect(await offLandlord.sweep(3000)).toEqual({ set: 0, cleared: 1 });
    expect(rents.rowOf(10)).toBeUndefined();
    expect(rents.rowOf(11)?.rent).toBe(5n);
  });
});
