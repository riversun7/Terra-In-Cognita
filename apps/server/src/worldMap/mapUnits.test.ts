// 2차맵 내 유닛 목록 조회 시험(docs/adr/2026-11-07-unit-control.md) — 내 유닛만·사이보그 본체 먼저·명령할 수 없는 까닭·운영자 표시·띄우지 않은 맵.
// 바뀜(기획 답 630~637): 다른 곳 내 유닛 수(632 다)·카메라 범위(630)·남의 유닛 한눈 정보(636 나 — 시야 안일 때만 세력·종류)
// 바뀜(docs/adr/2026-11-07-play-flow.md "WP-NPC4", 773 나): NPC 도시 휴먼의 한눈 정보 = 종류 human + 휴먼 이름
import { DEFAULT_CHARACTER_LOOK, characterLookForUnit } from "@terra/shared/characterLook";
import { JOB_GATHER } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createTestMap } from "../world/testSupport.ts";
import {
  UNIT_KIND_BOT,
  UNIT_KIND_CYBORG,
  UNIT_KIND_GUARDIAN,
  UNIT_KIND_HUMAN,
  UNIT_KIND_NPC_LEADER,
} from "../world/unitKinds.ts";
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
  it("1차 스탯 출처가 있으면 목록 줄에 stats가 실린다(고른 유닛의 추천 줄), 없으면 칸이 없다", () => {
    const { reads, map } = setup();
    expect(reads.mapUnits(PLAYER, MAP_KEY, NOW).units.every((unit) => unit.stats === undefined)).toBe(true);
    const withStats = createMapUnitReads({
      map: (key) => (key === MAP_KEY ? map : undefined),
      ownerOfUser: (userId) => (userId === PLAYER.id ? 5 : undefined),
      cyborgName: () => undefined,
      primaries: (unitId) =>
        unitId === 7 ? { str: 40, dex: 10, agi: 5, vit: 30, int: 6, wis: 7 } : undefined,
    });
    const units = withStats.mapUnits(PLAYER, MAP_KEY, NOW).units;
    // 화면 스탯 차례(STR·VIT·INT·WIS·DEX·AGI)로 싣는다
    expect(units.find((unit) => unit.unitId === 7)?.stats).toEqual({
      str: 40,
      vit: 30,
      int: 6,
      wis: 7,
      dex: 10,
      agi: 5,
    });
    expect(units.find((unit) => unit.unitId === 9)?.stats).toBeUndefined();
    map.stop();
  });

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
    // 유저 유닛의 주인이 정한 세력 정체성(docs/adr/2026-11-11-faction-identity.md 6절): 있으면 owner 칸, 읽다 실패해도 한눈 정보는 그대로
    const identity = {
      name: "하늘세력",
      shortName: "HAN",
      color: "#2980b9",
      emblem: { shape: "shield", division: "plain", charge: "star", scheme: 0 } as const,
      uploaded: null,
    };
    const withOwner = (identityOfOwner: (ownerId: number) => Promise<typeof identity | null>) =>
      createMapUnitReads({
        map: (key) => (key === MAP_KEY ? test.map : undefined),
        ownerOfUser: (userId) => (userId === PLAYER.id ? 5 : undefined),
        cyborgName: () => undefined,
        identityOfOwner,
      });
    expect(
      (
        await withOwner(async (ownerId) => (ownerId === 5 ? identity : null)).unitGlance(
          PLAYER,
          MAP_KEY,
          9,
          NOW,
        )
      ).glance,
    ).toEqual({ unitId: 9, kind: "cyborg_body", faction: null, owner: identity });
    expect(
      (await withOwner(() => Promise.reject(new Error("db down"))).unitGlance(PLAYER, MAP_KEY, 9, NOW))
        .glance,
    ).toEqual({ unitId: 9, kind: "cyborg_body", faction: null });
    test.map.stop();
  });

  it("WP-NPC: NPC 국가 지도자는 종류 npc_leader와 그 나라 지도자 이름을 싣는다(다른 유닛은 이름 없음)", async () => {
    const test = setup();
    test.map.addUnit({
      id: 77,
      size: 1,
      speed: 437,
      cellX: 52,
      cellY: 50,
      ownerId: 6,
      kind: UNIT_KIND_NPC_LEADER,
    });
    const faction = { id: 4, code: "placeholder_nation_01", kind: "npc" as const, name: null };
    const reads = createMapUnitReads({
      map: (key) => (key === MAP_KEY ? test.map : undefined),
      ownerOfUser: () => 5,
      cyborgName: () => undefined,
      sees: () => true,
      factionOfOwner: async () => faction,
      leaderName: (code) =>
        code === "placeholder_nation_01" ? { ko: "임시 지도자 1", en: "L1" } : undefined,
    });
    expect((await reads.unitGlance(PLAYER, MAP_KEY, 77, NOW)).glance).toEqual({
      unitId: 77,
      kind: "npc_leader",
      faction,
      name: { ko: "임시 지도자 1", en: "L1" },
    });
    expect((await reads.unitGlance(PLAYER, MAP_KEY, 3, NOW)).glance).toEqual({
      unitId: 3,
      kind: "human",
      faction,
    });
    test.map.stop();
  });

  it("WP-NPC4(773 나): NPC 도시 휴먼(봇 유닛 가운데 거울 세계 휴먼)은 종류 human + 휴먼 이름, 시험 봇은 그대로", async () => {
    const test = setup();
    test.map.addUnit({ id: 61, size: 1, speed: 437, cellX: 54, cellY: 50, ownerId: 6, kind: UNIT_KIND_BOT });
    test.map.addUnit({ id: 62, size: 1, speed: 437, cellX: 55, cellY: 50, ownerId: 6, kind: UNIT_KIND_BOT });
    test.map.addUnit({ id: 63, size: 1, speed: 437, cellX: 56, cellY: 50, ownerId: 6, kind: UNIT_KIND_BOT });
    const faction = { id: 4, code: "placeholder_nation_01", kind: "npc" as const, name: null };
    const reads = createMapUnitReads({
      map: (key) => (key === MAP_KEY ? test.map : undefined),
      ownerOfUser: () => 5,
      cyborgName: () => undefined,
      sees: () => true,
      factionOfOwner: async () => faction,
      // 61 = 이름 있는 휴먼, 62 = 이름 목록 없는 나라의 휴먼, 63 = 시험 봇(휴먼 아님)
      npcHuman: (unitId) =>
        unitId === 61 ? { name: "Alda Brook" } : unitId === 62 ? { name: undefined } : undefined,
    });
    expect((await reads.unitGlance(PLAYER, MAP_KEY, 61, NOW)).glance).toEqual({
      unitId: 61,
      kind: "human",
      faction,
      name: { ko: "Alda Brook", en: "Alda Brook" },
    });
    expect((await reads.unitGlance(PLAYER, MAP_KEY, 62, NOW)).glance).toEqual({
      unitId: 62,
      kind: "human",
      faction,
    });
    expect((await reads.unitGlance(PLAYER, MAP_KEY, 63, NOW)).glance).toEqual({
      unitId: 63,
      kind: "test_unit",
      faction,
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

/** 내 본체 9, 남의 본체 12(주체 6), 지도자 13(주체 7), 남의 휴먼 3 */
function looksSetup(sees: (unitId: number) => boolean) {
  const test = createTestMap({ mapKey: MAP_KEY });
  const { map } = test;
  map.addUnit({ id: 9, size: 1, speed: 437, cellX: 10, cellY: 11, ownerId: 5, kind: UNIT_KIND_CYBORG });
  map.addUnit({ id: 12, size: 1, speed: 437, cellX: 60, cellY: 60, ownerId: 6, kind: UNIT_KIND_CYBORG });
  map.addUnit({
    id: 13,
    size: 1,
    speed: 437,
    cellX: 70,
    cellY: 70,
    ownerId: 7,
    kind: UNIT_KIND_NPC_LEADER,
  });
  map.addUnit({ id: 3, size: 1, speed: 437, cellX: 50, cellY: 50, ownerId: 6, kind: UNIT_KIND_HUMAN });
  const other = { ...DEFAULT_CHARACTER_LOOK, head: "hex", primary: "crimson" } as const;
  const reads = createMapUnitReads({
    map: (key) => (key === MAP_KEY ? map : undefined),
    ownerOfUser: (userId) => (userId === PLAYER.id ? 5 : undefined),
    cyborgName: () => undefined,
    sees: (_mapKey, _viewer, unitId) => sees(unitId),
    observer: (viewer) => viewer.roles.includes("dev"),
    cyborgLook: (unitId) => (unitId === 9 ? DEFAULT_CHARACTER_LOOK : unitId === 12 ? other : undefined),
  });
  return { ...test, reads, other };
}

/** 나라 색 고리 시험용: 주인 5 → 나라 2, 주인 6 → 나라 1, 주인 7(지도자) → 나라 없음. 물은 주인 목록을 적는다 */
function nationsSetup(sees: (unitId: number) => boolean) {
  const base = looksSetup(sees);
  const asked: number[][] = [];
  const reads = createMapUnitReads({
    map: (key) => (key === MAP_KEY ? base.map : undefined),
    ownerOfUser: (userId) => (userId === PLAYER.id ? 5 : undefined),
    cyborgName: () => undefined,
    sees: (_mapKey, _viewer, unitId) => sees(unitId),
    observer: (viewer) => viewer.roles.includes("dev"),
    ownerNations: (ownerIds) => {
      asked.push([...ownerIds].toSorted((a, b) => a - b));
      return Promise.resolve(
        new Map(ownerIds.map((id) => [id, id === 5 ? 2 : id === 6 ? 1 : null] as const)),
      );
    },
  });
  return { map: base.map, reads, asked };
}

describe("world.unitLooks (docs/adr/2026-11-11-character-3d.md 5절)", () => {
  it("내 본체는 늘, 남의 본체·지도자는 지금 시야 안일 때만 준다. 휴먼은 싣지 않는다(기기가 유닛 ID로 만든다)", async () => {
    const hidden = looksSetup(() => false);
    expect(await hidden.reads.unitLooks(PLAYER, MAP_KEY, NOW)).toEqual({
      status: "ready",
      mapKey: MAP_KEY,
      units: [{ unitId: 9, kind: "cyborg_body", look: DEFAULT_CHARACTER_LOOK }],
      generatedAt: NOW,
    });
    hidden.map.stop();
    const seen = looksSetup((unitId) => unitId === 12 || unitId === 13 || unitId === 3);
    expect((await seen.reads.unitLooks(PLAYER, MAP_KEY, NOW)).units).toEqual([
      { unitId: 9, kind: "cyborg_body", look: DEFAULT_CHARACTER_LOOK },
      { unitId: 12, kind: "cyborg_body", look: seen.other },
      { unitId: 13, kind: "npc_leader", look: characterLookForUnit(13, "leader") },
    ]);
    seen.map.stop();
  });

  it("전체 보기 권한이면 시야와 상관없이 모두, 띄우지 않은 2차맵이면 빈 목록", async () => {
    const { reads, map } = looksSetup(() => false);
    expect((await reads.unitLooks(DEV, MAP_KEY, NOW)).units.map((unit) => unit.unitId)).toEqual([9, 12, 13]);
    expect(await reads.unitLooks(PLAYER, 12_345, NOW)).toEqual({
      status: "ready",
      mapKey: 12_345,
      units: [],
      nations: [],
      generatedAt: NOW,
    });
    map.stop();
  });

  it("나라 색 고리(질문 963 나): 보는 유닛(종류와 상관없이)을 나라마다 모은다. 시야 밖·나라 없는 유닛은 빠진다. 주인 → 나라는 한 번에 묻는다", async () => {
    // 시야 안 = 남의 휴먼 3만(남의 본체 12·지도자 13은 시야 밖)
    const player = nationsSetup((unitId) => unitId === 3);
    expect((await player.reads.unitLooks(PLAYER, MAP_KEY, NOW)).nations).toEqual([
      { factionId: 1, unitIds: [3] },
      { factionId: 2, unitIds: [9] },
    ]);
    expect(player.asked).toEqual([[5, 6]]);
    player.map.stop();
    // 전체 보기: 모두 보지만 지도자(주인 7)는 나라가 없어 빠진다
    const dev = nationsSetup(() => false);
    expect((await dev.reads.unitLooks(DEV, MAP_KEY, NOW)).nations).toEqual([
      { factionId: 1, unitIds: [3, 12] },
      { factionId: 2, unitIds: [9] },
    ]);
    expect(dev.asked).toEqual([[5, 6, 7]]);
    dev.map.stop();
    // 나라 조회가 없으면(옛 조립) 칸을 싣지 않는다
    const plain = looksSetup(() => true);
    expect((await plain.reads.unitLooks(PLAYER, MAP_KEY, NOW)).nations).toBeUndefined();
    plain.map.stop();
  });
});
