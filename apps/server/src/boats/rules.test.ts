// 배 B2 규칙 시험(docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)", 기획 D-541):
// - 1272 가 + 다: 배 빠르기는 설정 칸 boat_speed를 이동을 시작할 때 읽는다(있는 배도 다음 이동부터)
// - 1277 다: 배 유지비 무게는 설정 칸 boat_upkeep_pm(사람보다 싸다)
// - 1278 가: 배·승객은 세계 전투에서 빠진다
// - 1279 나: 승객에게 내린 이동·멈추기는 그 배의 이동·멈추기
import { START_BOATS, SURFACE_WATER, TEST_SOCIETY_COEFFICIENTS, anchorCenter, arrivalAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_GEAR } from "../roster/unitBody.ts";
import { afloatIn } from "../world/battleStart.ts";
import { createTestMap, flatTerrain } from "../world/testSupport.ts";
import { UNIT_KIND_BOAT, UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN, isAfloat } from "../world/unitKinds.ts";
import { BASE_UPKEEP_PM, upkeepWeightOf } from "../world/upkeepWeights.ts";
import { boatSpeedOf, walkSpeedsOf } from "../world/walkSpeed.ts";

const START = 1_798_000_000_000;

/** 지형 칸 x ≥ 64(배치 칸 x ≥ 128)가 바다인 2차맵 */
function coastTerrain() {
  const terrain = flatTerrain();
  for (let ty = 0; ty < 128; ty++)
    for (let tx = 64; tx < 128; tx++) terrain.surface[ty * 128 + tx] = SURFACE_WATER;
  return terrain;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

describe("배 B2 규칙", () => {
  it("유지비 무게: 보통 1000, 사이보그 유닛 = n46_upkeep, 배 = boat_upkeep_pm(사람보다 싸다)", () => {
    const rules = { ...TEST_SOCIETY_COEFFICIENTS, boats: { ...START_BOATS, upkeepPm: 250 } };
    const weightOf = upkeepWeightOf(() => rules);
    expect(weightOf(UNIT_KIND_HUMAN)).toBe(BASE_UPKEEP_PM);
    expect(weightOf(UNIT_KIND_CYBORG_UNIT)).toBe(TEST_SOCIETY_COEFFICIENTS.fusion.upkeepPm);
    expect(weightOf(UNIT_KIND_BOAT)).toBe(250);
    expect(START_BOATS.upkeepPm).toBeLessThan(BASE_UPKEEP_PM);
    // 틀린 값은 0
    expect(
      upkeepWeightOf(() => ({ ...rules, boats: { ...START_BOATS, upkeepPm: -5 } }))(UNIT_KIND_BOAT),
    ).toBe(0);
  });

  it("배 빠르기는 설정 칸을 이동을 시작할 때 읽는다 — 바꾸면 있는 배도 다음 이동부터", async () => {
    let speed = 1536;
    const speedOf = walkSpeedsOf(
      { userOfUnit: () => undefined, record: () => undefined },
      () => NO_GEAR,
      undefined,
      () => Date.now(),
      () => ({ boats: { speed } }),
    );
    expect(boatSpeedOf({ id: 1, kind: UNIT_KIND_BOAT, speed: 900, domain: "sea" }, 0)).toBe(900);
    const { map } = createTestMap({ terrain: coastTerrain(), walkSpeed: speedOf });
    // 만들 때 값(옛 배 줄 = 900)이어도 이동을 시작하면 지금 설정 칸 값
    expect(map.addBoat({ id: 1, ownerId: 7, speed: 900, cellX: 140, cellY: 50 })).toBe(true);
    expect((await map.moveUnit(1, anchorCenter(200, 50, 2))).ok).toBe(true);
    expect(map.unitInfo(1)?.motion.speed).toBe(1536);
    speed = 3072;
    expect((await map.moveUnit(1, anchorCenter(150, 120, 2))).ok).toBe(true);
    expect(map.unitInfo(1)?.speed).toBe(3072);
    expect(map.unitInfo(1)?.motion.speed).toBe(3072);
  });

  it("승객에게 내린 이동은 배가 가고, 멈추기는 배를 세운다", async () => {
    const { map } = createTestMap({ terrain: coastTerrain() });
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 50 });
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 126, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
    expect(map.board(2, 1)).toBe(true);
    // 물 위를 누름 → 배 이동(승객은 따라간다)
    expect(await map.moveUnit(2, anchorCenter(200, 100, 1))).toEqual({ ok: true });
    const boat = map.unitInfo(1);
    expect(boat && arrivalAt(boat.motion)).toBeGreaterThan(START);
    expect(map.unitInfo(2)?.motion).toBe(boat?.motion);
    // 땅을 누르면 배는 갈 수 없다(물 길)
    expect(await map.moveUnit(2, anchorCenter(20, 20, 1))).toEqual({ ok: false, code: "goal_blocked" });
    vi.setSystemTime(START + 5_000);
    expect((await map.moveUnit(2, anchorCenter(200, 100, 1))).ok).toBe(true);
    vi.setSystemTime(START + 7_000);
    expect(map.halt(2)).toBe(true);
    expect(arrivalAt(map.unitInfo(1)!.motion)).toBeLessThanOrEqual(START + 7_000);
    expect(map.unitInfo(2)?.motion).toBe(map.unitInfo(1)?.motion);
    // 주인이 다른 배에 탄 승객은 배를 몰지 못한다(aboard)
    map.setOwner(1, 99);
    expect(await map.moveUnit(2, anchorCenter(200, 100, 1))).toEqual({ ok: false, code: "aboard" });
  });

  it("배·승객은 물 위(전투에서 뺀다), 걷는 유닛은 아니다", () => {
    const { map } = createTestMap({ terrain: coastTerrain() });
    map.addBoat({ id: 1, ownerId: 7, speed: START_BOATS.speed, cellX: 129, cellY: 50 });
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 126, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
    map.addUnit({ id: 3, size: 1, speed: 437, cellX: 120, cellY: 50, ownerId: 7, kind: UNIT_KIND_HUMAN });
    map.board(2, 1);
    const maps = new Map([[map.mapKey, map]]);
    expect(afloatIn(maps, 1)).toBe(true);
    expect(afloatIn(maps, 2)).toBe(true);
    expect(afloatIn(maps, 3)).toBe(false);
    expect(afloatIn(maps, 404)).toBe(false);
    expect(isAfloat(undefined)).toBe(false);
  });
});
