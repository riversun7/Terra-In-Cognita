// 2차맵 내 유닛 목록 조회 시험(docs/adr/2026-11-07-unit-control.md) — 내 유닛만·사이보그 본체 먼저·명령할 수 없는 까닭·운영자 표시·띄우지 않은 맵
import { JOB_GATHER } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createTestMap } from "../world/testSupport.ts";
import { UNIT_KIND_CYBORG, UNIT_KIND_GUARDIAN, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { createMapUnitReads } from "./mapUnits.ts";

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

  it("중태는 명령할 수 없다(나을 시각이 지나면 다시 된다)", () => {
    const { reads, map } = setup();
    map.setCondition(7, { injury: 3, injuryUntilMs: NOW + 1_000, heldBy: null });
    expect(reads.mapUnits(PLAYER, MAP_KEY, NOW).units.find((unit) => unit.unitId === 7)).toMatchObject({
      injury: 3,
      hold: "critical",
    });
    expect(
      reads.mapUnits(PLAYER, MAP_KEY, NOW + 1_000).units.find((unit) => unit.unitId === 7),
    ).toMatchObject({ injury: 0, hold: null });
    map.stop();
  });

  it("운영자 표시는 권한 표(dev·admin), 소유 주체가 없으면 빈 목록, 띄우지 않은 맵은 loaded false", () => {
    const { reads, map } = setup();
    expect(reads.mapUnits(DEV, MAP_KEY, NOW)).toMatchObject({ operator: true, loaded: true, units: [] });
    expect(reads.mapUnits(PLAYER, 12_345, NOW)).toMatchObject({ loaded: false, units: [], operator: false });
    map.stop();
  });
});
