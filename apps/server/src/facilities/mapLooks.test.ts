// 2차맵 건물 겉모습 조회 시험(DB 없음) — ADR 2026-11-08-building-art.
// 평평한 시험 2차맵에 건물 넷(다 지은 창고·짓는 중 농장·레벨 올리는 중 광산·시설 줄 없는 시험 건물)을 놓고 상태·국가를 본다.
import { performance } from "node:perf_hooks";
import { VISION_BYTES } from "@terra/protocol";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { mapTerrainFromTemp } from "../world/mapTerrain.ts";
import { createInlinePathService } from "../world/pathService.ts";
import { type SecondMap, createSecondMap } from "../world/secondMap.ts";
import { flatTerrain, silentLog } from "../world/testSupport.ts";
import { testMapKey } from "../world/world.ts";
import { emptyWorldStats } from "../world/worldStats.ts";
import { mapBuildingLooks, mapOwnerIds } from "./mapLooks.ts";
import type { FacilityRecord, JobRecord } from "./state.ts";

const NOW = 1_800_000_000_000;
const KEY = testMapKey(0);
const NPC_OWNER = 3;
const PLAYER_OWNER = 9;
const OBSERVER = { observer: true, ownerId: undefined, sighted: undefined } as const;

function rig(): { maps: Map<number, SecondMap>; ids: number[] } {
  const maps = new Map<number, SecondMap>();
  const paths = createInlinePathService(
    () => [...maps.values()].map((map) => map.replicaInit()),
    () => performance.now(),
  );
  const map = createSecondMap({
    mapKey: KEY,
    terrain: mapTerrainFromTemp(KEY, flatTerrain()),
    paths,
    now: () => NOW,
    stats: emptyWorldStats(),
    log: silentLog,
    persist: { saveUnit: () => {}, saveBuilding: () => {}, removeBuilding: () => {} },
  });
  maps.set(KEY, map);
  const ids: number[] = [];
  const spots: [number, number, number | null][] = [
    [40, 40, NPC_OWNER],
    [60, 40, NPC_OWNER],
    [80, 40, PLAYER_OWNER],
    [100, 40, null],
  ];
  for (const [x, y, owner] of spots) {
    const placed = map.placeBuilding({ x, y, width: 3, height: 3, rotation: 0 }, owner);
    if (!placed.ok || placed.buildingId === undefined) throw new Error("no building");
    ids.push(placed.buildingId);
  }
  return { maps, ids };
}

const record = (
  buildingId: number,
  facilityId: string,
  level: number,
  conditionPpm = 1_000_000,
): FacilityRecord => ({
  buildingId,
  facilityId,
  level,
  conditionPpm,
  conditionAtMs: NOW,
  builtAtMs: NOW,
  builtBy: null,
  cityId: null,
});

describe("mapBuildingLooks", () => {
  it("시설 ID·레벨·상태(짓는 중·손상)·레벨 올리는 중·주인의 국가, 시설 줄이 없으면 시험 건물", () => {
    const { maps, ids } = rig();
    const [store = 0, farm = 0, mine = 0, test = 0] = ids;
    const facilities = new Map<number, FacilityRecord>([
      [store, record(store, "storehouse", 2, 500_000)],
      [farm, record(farm, "farm", 0)],
      [mine, record(mine, "mine", 1)],
    ]);
    const upgrade: JobRecord = {
      id: 1,
      kind: "upgrade",
      ownerId: PLAYER_OWNER,
      buildingId: mine,
      beaconId: null,
      holdingId: null,
      targetLevel: 2,
      restorePpm: null,
      unitIds: [],
      materials: [],
      startedAtMs: NOW,
      doneAtMs: NOW + 60_000,
    };
    expect(mapOwnerIds(maps, KEY).toSorted((a, b) => a - b)).toEqual([NPC_OWNER, PLAYER_OWNER]);
    const looks = mapBuildingLooks(
      {
        maps,
        service: { facilities, jobs: new Map([[1, upgrade]]) },
        rules: () => TEST_SOCIETY_COEFFICIENTS,
        facilityName: (id) => (id === "storehouse" ? { ko: "창고", en: "Storehouse" } : undefined),
        // 실효 팩 겉모습(건물 편집기가 바꾼 것, 2026-11-09): 광산만 칸이 있다
        facilityArt: (id) => (id === "mine" ? { model: "mine", roof: "teal", heightPm: 1300 } : undefined),
      },
      KEY,
      NOW,
      OBSERVER,
      new Map([
        [NPC_OWNER, 12],
        [PLAYER_OWNER, null],
      ]),
    );
    expect(looks.status).toBe("ok");
    expect(looks.buildings).toEqual([
      {
        buildingId: store,
        facilityId: "storehouse",
        level: 2,
        state: "damaged",
        upgrading: false,
        factionId: 12,
        name: { ko: "창고", en: "Storehouse" },
        mine: false,
      },
      {
        buildingId: farm,
        facilityId: "farm",
        level: 0,
        state: "building",
        upgrading: false,
        factionId: 12,
        mine: false,
      },
      {
        buildingId: mine,
        facilityId: "mine",
        level: 1,
        state: "ok",
        upgrading: true,
        factionId: null,
        mine: false,
        art: { model: "mine", roof: "teal", heightPm: 1300 },
      },
      {
        buildingId: test,
        facilityId: null,
        level: 1,
        state: "ok",
        upgrading: false,
        factionId: null,
        mine: false,
      },
    ]);
  });

  it("띄우지 않은 2차맵은 unknown_map", () => {
    const { maps } = rig();
    const looks = mapBuildingLooks(
      { maps, service: { facilities: new Map(), jobs: new Map() }, rules: () => TEST_SOCIETY_COEFFICIENTS },
      KEY + 1,
      NOW,
      OBSERVER,
      new Map(),
    );
    expect(looks).toEqual({ status: "unknown_map", mapKey: KEY + 1, buildings: [], generatedAt: NOW });
  });

  it("시야: 전체 보기가 아니면 내 건물과 아는 시야 칸(발자국 가운데)에 든 건물만", () => {
    const { maps, ids } = rig();
    const [first = 0, , mine = 0] = ids;
    const source = {
      maps,
      service: { facilities: new Map(), jobs: new Map() },
      rules: () => TEST_SOCIETY_COEFFICIENTS,
    };
    const none = new Uint8Array(VISION_BYTES);
    const mineOnly = mapBuildingLooks(
      source,
      KEY,
      NOW,
      { observer: false, ownerId: PLAYER_OWNER, sighted: none },
      new Map(),
    );
    expect(mineOnly.buildings.map((row) => [row.buildingId, row.mine])).toEqual([[mine, true]]);
    // 첫 건물(40,40 + 3×3 → 가운데 41.5 → 시야 칸 5,5 = 8칸 단위)만 안다
    const bits = new Uint8Array(VISION_BYTES);
    const cell = 5 * 32 + 5;
    bits[cell >> 3] = 1 << (cell & 7);
    const sighted = mapBuildingLooks(
      source,
      KEY,
      NOW,
      { observer: false, ownerId: undefined, sighted: bits },
      new Map(),
    );
    expect(sighted.buildings.map((row) => row.buildingId)).toEqual([first]);
  });
});
