// 2차맵 사이 이동 도중 습격 시험(docs/adr/2026-11-07-play-flow.md "WP13", 기획 답 610 나) — 확률 = min(상한, 기본 + 오염 ÷ 나눗수), 같은 씨앗이면 같은
// 굴림, 크리쳐 0이면 습격 없음, 습격 전투는 넥서스 없는 보통 전투(크리쳐 = 웨이브 몸), 지면 부상(DOWNED_INJURY)을 그 2차맵 유닛에 건다
import { TEST_COMBAT_CATALOG, TEST_COMBAT_COEFFICIENTS, TEST_GARDENER_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestMap } from "../world/testSupport.ts";
import { DOWNED_INJURY } from "../world/unitCondition.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { createTravelRaids, raidBattleInit, raidChancePm, raidSeed, rollRaid } from "./raid.ts";

const NOW = 1_798_000_000_000;
const C = TEST_GARDENER_COEFFICIENTS;
/** 시험 오염: 2차맵 12만 높다 */
const pollution = (key: number): number => (key === 12 ? 9_000 : 0);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("도중 습격 굴림", () => {
  it("확률 ‰ = min(상한, 기본 + 오염 ÷ 나눗수)", () => {
    expect(raidChancePm(0, C)).toBe(C.travelRaidBasePm);
    expect(raidChancePm(2_000, C)).toBe(
      C.travelRaidBasePm + Math.floor(2_000 / C.travelRaidPollutionDivisor),
    );
    expect(raidChancePm(1_000_000, C)).toBe(C.travelRaidMaxPm);
    expect(raidChancePm(-5, { ...C, travelRaidBasePm: 0 })).toBe(0);
  });

  it("같은 씨앗이면 같은 답, 확률 1000‰이면 첫 2차맵, 0이면 없음, 크리쳐 0이면 굴리지 않는다", () => {
    const seed = raidSeed(5, NOW, 1);
    const always = { ...C, travelRaidBasePm: 1000, travelRaidMaxPm: 1000 };
    expect(rollRaid([11, 12], () => 0, seed, always)).toBe(11);
    expect(rollRaid([11, 12], () => 0, seed, { ...C, travelRaidBasePm: 0 })).toBeNull();
    expect(rollRaid([11, 12], () => 0, seed, { ...always, travelRaidCreatures: 0 })).toBeNull();
    expect(rollRaid([11, 12, 13], pollution, seed, C)).toBe(rollRaid([11, 12, 13], pollution, seed, C));
    expect(raidSeed(5, NOW, 1)).not.toBe(raidSeed(5, NOW, 2));
  });
});

describe("습격 전투", () => {
  it("넥서스 없는 보통 전투: 크리쳐 N마리(물리형) + 내 유닛 하나", () => {
    const init = raidBattleInit({
      seed: 3,
      unitId: 77,
      ownerId: 9,
      creatures: 3,
      catalog: TEST_COMBAT_CATALOG,
      combat: TEST_COMBAT_COEFFICIENTS,
    });
    expect(init.kind).toBe("normal");
    expect(init.map.buildings).toEqual([]);
    expect(init.units.filter((unit) => unit.side === 1)).toHaveLength(3);
    expect(init.units.filter((unit) => unit.side === 2).map((unit) => unit.id)).toEqual([77]);
    expect(init.sides.find((side) => side.id === 2)?.faction).toBe(9);
  });

  it("크리쳐가 많아 지면 그 2차맵 유닛에 부상을 건다. 크리쳐 0이면 싸우지 않는다", () => {
    const { map } = createTestMap();
    map.addUnit({ id: 5, size: 1, speed: 437, cellX: 20, cellY: 20, ownerId: 3, kind: UNIT_KIND_HUMAN });
    const raids = createTravelRaids({
      rules: () => ({ ...C, travelRaidCreatures: 12 }),
      catalog: () => TEST_COMBAT_CATALOG,
    });
    const outcome = raids.fight(map, 5, raidSeed(5, NOW, 0), NOW);
    expect(outcome).toMatchObject({ lost: true, creatures: 12 });
    expect(map.unitInfo(5)?.condition.injury).toBe(DOWNED_INJURY);
    const none = createTravelRaids({
      rules: () => ({ ...C, travelRaidCreatures: 0 }),
      catalog: () => TEST_COMBAT_CATALOG,
    });
    expect(none.fight(map, 5, 1, NOW)).toBeNull();
    expect(raids.fight(map, 999, 1, NOW)).toBeNull();
    map.stop();
  });
});
