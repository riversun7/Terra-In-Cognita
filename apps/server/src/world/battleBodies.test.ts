// 랭킹 전투력 몸 시험(house-9, 기획 D-576·D-7022 "버프 없는 기본 수치") — battleBodies.ts basePower: 걸린 효과·부상을 빼고, 기본 몸은 한 값을 다시 쓴다
import { DEFAULT_CHARACTER_LOOK } from "@terra/shared/characterLook";
import { zeroElements } from "@terra/shared/cyborg";
import { describe, expect, it } from "vitest";
import type { CyborgRecord } from "../cyborg/state.ts";
import { testRosterCatalog } from "../roster/catalog.ts";
import { type GearEffect, type UnitGear, combatSpecOf } from "../roster/unitBody.ts";
import { clashPower } from "../travel/clashDecide.ts";
import { createBattleBodies } from "./battleBodies.ts";

const NOW = 1_798_000_000_000;
const catalog = testRosterCatalog();

const record: CyborgRecord = {
  userId: "u-1",
  name: "새싹",
  nameKey: "새싹",
  temperament: "balanced",
  initial: { str: 20, dex: 10, agi: 10, vit: 20, int: 10, wis: 10 },
  kPm: { str: 1000, dex: 1000, agi: 1000, vit: 1000, int: 1000, wis: 1000 },
  look: DEFAULT_CHARACTER_LOOK,
  lookAuto: false,
  factionId: 1,
  startCityId: 1,
  unitId: 1,
  level: 5,
  exp: 0,
  rebirths: 0,
  faith: 0,
  createdAtMs: NOW,
  elements: zeroElements(),
  religion: null,
  faithPoints: 0,
  startGrant: null,
  nationChangedAtMs: null,
  standings: new Map(),
};

const strBuff: GearEffect = {
  effect: "test_str",
  value: 30,
  untilMs: NOW + 3_600_000,
  kind: "buff",
  stat: "str",
  valueMode: "flat",
};

function bodies(gearOf: (unitId: number) => UnitGear, withCatalog = true) {
  return createBattleBodies({
    maps: new Map(),
    cyborgs: { userOfUnit: (unitId) => (unitId === 1 ? "u-1" : undefined), record: () => record },
    gearOf,
    catalog: withCatalog ? () => catalog : undefined,
  });
}

describe("basePower(랭킹 전투력)", () => {
  it("걸린 효과·부상 불이익은 빼고 센다(D-7022), 사이보그는 저장된 본체", () => {
    const buffed = bodies(() => ({ equipped: [], effects: [strBuff], injuryPm: 500 }));
    const plain = bodies(() => ({ equipped: [], effects: [] }));
    const power = plain.basePower(1, NOW);
    expect(power).toBeGreaterThan(0);
    expect(buffed.basePower(1, NOW)).toBe(power);
    // 기본 몸(사이보그가 아닌 유닛)은 같은 값을 다시 쓰고, 사이보그 본체와 다르다
    const bare = plain.basePower(7, NOW);
    expect(bare).toBeGreaterThan(0);
    expect(plain.basePower(8, NOW)).toBe(bare);
    expect(bare).not.toBe(power);
    // 전투 시작 사양(버프 포함)의 전력과 견주면 버프 몫만큼 다르다(뺀 것이 맞는지)
    const spec = combatSpecOf(
      catalog,
      { kind: "cyborg", record },
      { equipped: [], effects: [strBuff] },
      { id: 1, side: 1, party: 1, x: 0, y: 0, moveIntervalMs: 1000, buildingMulPm: 1000 },
      NOW,
    );
    expect(clashPower(spec)).not.toBe(power);
  });

  it("유닛 화면 전투 자료가 없으면 0", () => {
    expect(bodies(() => ({ equipped: [], effects: [] }), false).basePower(1, NOW)).toBe(0);
  });
});
