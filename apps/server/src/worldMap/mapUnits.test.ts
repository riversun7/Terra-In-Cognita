// 2차맵 내 유닛 목록 조회 시험(docs/adr/2026-11-07-unit-control.md) — 내 유닛만·사이보그 본체 먼저·명령할 수 없는 까닭·운영자 표시·띄우지 않은 맵.
// 바뀜(기획 답 630~637): 다른 곳 내 유닛 수(632 다)·카메라 범위(630)·남의 유닛 한눈 정보(636 나 — 시야 안일 때만 세력·종류)
import { JOB_GATHER } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createTestMap } from "../world/testSupport.ts";
import { UNIT_KIND_CYBORG, UNIT_KIND_GUARDIAN, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { UNIT_VISION_CELLS } from "@terra/sim";
import { VIEW_MARGIN_CELLS, createMapUnitReads } from "./mapUnits.ts";

const NOW = 1_798_000_000_000;
const PLAYER: Viewer = { id: "u-player", loginId: "player", roles: ["player"] };
const DEV: Viewer = { id: "u-dev", loginId: "dev", roles: ["player", "dev"] };
const MAP_KEY = 9;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  const test = createTestMap({ mapKey: MAP_KEY });
  const { map } = test;
  // 내 주체 5: 휴먼 7(직무), 사이보그 본체 9, 수호신 4, 포로가 된 휴먼 8. 남의 유닛 3
  map.addUnit({ id: 7, size: 1, speed: 437, cellX: 20, cellY: 21, ownerId: 5, kind: UNIT_KIND_HUMAN });
  map.addUnit({ id: 9, size: 1, speed: 437, cellX: 10, cellY: 11, ownerId: 5, kind: UNIT_KIND_CYBORG });
  map.addUnit({ id: 4, size: 1, speed: 437, cellX: 30, cellY: 30, ownerId: 5, kind: UNIT_KIND_GUARDIAN });
  map.addUnit({ id: 8, size: 1, speed: 437, cellX: 40, cellY: 40, ownerId: 5, kind: UNIT_KIND_HUMAN });
  map.addUnit({ id: 3, size: 1, speed: 437, cellX: 50, cellY: 50, ownerId: 6, kind: UNIT_KIND_HUMAN });
  map.setJob(7, { job: JOB_GATHER, phase: 0, progressMs: 0, fatigue: 0 });
  map.setCondition(8, { injury: 0, injuryUntilMs: null, heldBy: 6 });
  const reads = createMapUnitReads({
    map: (key) => (key === MAP_KEY ? map : undefined),
    ownerOfUser: (userId) => (userId === PLAYER.id ? 5 : undefined),
    cyborgName: (userId) => (userId === PLAYER.id ? "Leon" : undefined),
  });
  return { ...test, reads };
}

describe("world.mapUnits", () => {
  it("내 유닛만, 사이보그 본체 먼저 그다음 ID 차례, 명령할 수 없는 까닭", () => {
    const { reads, map } = setup();
    const answer = reads.mapUnits(PLAYER, MAP_KEY, NOW);
    expect(answer).toMatchObject({ status: "ready", loaded: true, operator: false, mapKey: MAP_KEY });
    expect(answer.units.map((unit) => [unit.unitId, unit.kind, unit.hold])).toEqual([
      [9, "cyborg_body", null],
      [4, "guardian", "guardian"],
      [7, "human", null],
      [8, "human", "captive"],
    ]);
    expect(answer.units[0]).toMatchObject({ name: "Leon", cellX: 10, cellY: 11, moving: false, injury: 0 });
    expect(answer.units[2]?.name).toBeNull();
    expect(answer.units[2]?.job).toEqual({ kind: "test_gather", phase: "work" });
    map.stop();
  });

  it("빨강(옛 중태)은 명령할 수 없다(노랑으로 내려가면 다시 된다 — 부상 4단계 D-521)", () => {
    const { reads, map } = setup();
    map.setCondition(7, { injury: 3, injuryUntilMs: NOW + 1_000, heldBy: null });
    expect(reads.mapUnits(PLAYER, MAP_KEY, NOW).units.find((unit) => unit.unitId === 7)).toMatchObject({
      injury: 3,
      hold: "critical",
    });
    expect(
      reads.mapUnits(PLAYER, MAP_KEY, NOW + 1_000).units.find((unit) => unit.unitId === 7),
    ).toMatchObject({ injury: 2, hold: null });
    map.stop();
  });

  it("운영자 표시는 권한 표(dev·admin), 소유 주체가 없으면 빈 목록, 띄우지 않은 맵은 loaded false", () => {
    const { reads, map } = setup();
    expect(reads.mapUnits(DEV, MAP_KEY, NOW)).toMatchObject({ operator: true, loaded: true, units: [] });
    expect(reads.mapUnits(PLAYER, 12_345, NOW)).toMatchObject({ loaded: false, units: [], operator: false });
    map.stop();
  });
});

describe("기획 답 630~637", () => {
  it("632 다: 다른 띄운 2차맵 + 건너뛰는 중인 내 유닛 수, 630: 카메라 범위(시야 + 여유)와 내 건물", () => {
    const test = setup();
    const other = createTestMap({ mapKey: 10 });
    other.map.addUnit({ id: 21, size: 1, speed: 437, cellX: 5, cellY: 5, ownerId: 5, kind: UNIT_KIND_HUMAN });
    other.map.addUnit({ id: 22, size: 1, speed: 437, cellX: 6, cellY: 5, ownerId: 6, kind: UNIT_KIND_HUMAN });
    expect(test.map.placeBuilding({ x: 60, y: 60, width: 2, height: 2, rotation: 0 }, 5).ok).toBe(true);
    const reads = createMapUnitReads({
      map: (key) => (key === MAP_KEY ? test.map : undefined),
      ownerOfUser: (userId) => (userId === PLAYER.id ? 5 : undefined),
      cyborgName: () => undefined,
      maps: () => [test.map, other.map],
      hiddenUnits: (userId) => (userId === PLAYER.id ? 1 : 0),
    });
    const answer = reads.mapUnits(PLAYER, MAP_KEY, NOW);
    expect(answer.elsewhere).toBe(2);
    expect(answer.view).toMatchObject({
      unitRadius: UNIT_VISION_CELLS + VIEW_MARGIN_CELLS,
      buildings: [{ x: 60, y: 60 }],
    });
    // 다른 2차맵에서 보면 이 2차맵의 유닛 4가 다른 곳(+ 건너뛰는 1)
    expect(reads.mapUnits(PLAYER, 10, NOW).elsewhere).toBe(5);
    test.map.stop();
    other.map.stop();
  });

  it("636 나: 시야 안이면 세력·종류, 시야 밖·없는 유닛은 같은 답(null), 전체 보기 권한은 시야와 상관없이", async () => {
    const test = setup();
    const seen = new Set<number>([3]);
    const faction = {
      id: 4,
      code: "npc_nation_01",
      kind: "npc" as const,
      name: { ko: "가 나라", en: "Nation A" },
    };
    const reads = createMapUnitReads({
      map: (key) => (key === MAP_KEY ? test.map : undefined),
      ownerOfUser: (userId) => (userId === PLAYER.id ? 5 : undefined),
      cyborgName: () => undefined,
      sees: (_key, _viewer, unitId) => seen.has(unitId),
      observer: (viewer) => viewer.roles.includes("dev"),
      factionOfOwner: async (ownerId) => (ownerId === 6 ? faction : null),
    });
    expect((await reads.unitGlance(PLAYER, MAP_KEY, 3, NOW)).glance).toEqual({
      unitId: 3,
      kind: "human",
      faction,
    });
    seen.clear();
    expect((await reads.unitGlance(PLAYER, MAP_KEY, 3, NOW)).glance).toBeNull();
    expect((await reads.unitGlance(PLAYER, MAP_KEY, 999, NOW)).glance).toBeNull();
    expect((await reads.unitGlance(PLAYER, 12_345, 3, NOW)).glance).toBeNull();
    expect((await reads.unitGlance(DEV, MAP_KEY, 3, NOW)).glance).toMatchObject({ unitId: 3, faction });
    // 내 유닛은 늘 본다(무소속이면 세력 null)
    expect((await reads.unitGlance(PLAYER, MAP_KEY, 9, NOW)).glance).toEqual({
      unitId: 9,
      kind: "cyborg_body",
      faction: null,
    });
    test.map.stop();
  });

  it("MapVision.sees: 내 유닛 시야 칸 안의 남의 유닛만 본다(구독하지 않아도)", () => {
    const { map } = createTestMap({ mapKey: 11 });
    map.addUnit({ id: 1, size: 1, speed: 437, cellX: 100, cellY: 100, ownerId: 5, kind: UNIT_KIND_HUMAN });
    map.addUnit({ id: 2, size: 1, speed: 437, cellX: 110, cellY: 100, ownerId: 6, kind: UNIT_KIND_HUMAN });
    map.addUnit({ id: 3, size: 1, speed: 437, cellX: 10, cellY: 10, ownerId: 6, kind: UNIT_KIND_HUMAN });
    const viewer = { userId: PLAYER.id, ownerId: 5 };
    expect(map.vision.sees(viewer, 1)).toBe(true);
    expect(map.vision.sees(viewer, 2)).toBe(true);
    expect(map.vision.sees(viewer, 3)).toBe(false);
    expect(map.vision.sees(viewer, 99)).toBe(false);
    expect(map.vision.sees({ userId: "u-none", ownerId: undefined }, 2)).toBe(false);
    map.stop();
  });
});
