// 원자재 오브젝트 채집 DB 통합 시험(docs/adr/2026-11-07-gather-objects.md 4절) — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로: 내 휴먼이 시험 2차맵(임시 지형)의 광맥으로 걸어가 한 번 캔다 → 원장 유닛 화물과 오브젝트 상태 줄(남은 번수)이 같은 쓰기 묶음으로 저장되고,
// 서버를 다시 켜도 남은 번수·화물이 그대로다.
import { cargoLocation } from "@terra/shared/goodsPlaces";
import { WALK_SPEED, anchorAt, positionAt } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_FACILITY_SOURCE } from "../facilities/testFacilities.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { type World, startWorld } from "../world/world.ts";
import type { GatherKind } from "./kinds.ts";
import { type WorldGather, startWorldGather } from "./world.ts";

const T0 = 1_800_000_000_000;
const KINDS: GatherKind[] = [
  {
    id: "ore_vein",
    name: { ko: "광맥", en: "Ore vein" },
    source: "rock",
    arts: [],
    chancePm: 1000,
    art: 0,
    surfaces: [],
    minCells: 0,
    material: null,
    direct: true,
    item: "copper_ore",
    lots: 1,
    workMs: 10_000,
    uses: 5,
    regrowMs: 1_800_000,
    facility: null,
    primary: "str",
    secondary: "vit",
  },
];

let test: TestDatabase;
let clock = T0;
const running: { world: World; gather: WorldGather }[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = T0;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const entry of running.splice(0)) {
    entry.gather.stop();
    await entry.world.stop().catch(() => undefined);
  }
  await test.drop();
});

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
}

async function boot(): Promise<{ world: World; gather: WorldGather }> {
  const world = startWorld({
    testBots: 0,
    testMaps: 1,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    facilities: { content: () => TEST_FACILITY_SOURCE },
    holdings: { content: () => TEST_HOLDING_CONTENT },
  });
  await world.ready;
  const gather = startWorldGather(world, { kinds: () => KINDS, now: () => clock, log: silentLog });
  // 오브젝트 상태 줄을 읽을 때까지(DB 조회 한 번)
  for (let i = 0; i < 300 && !gather.current(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  const entry = { world, gather };
  running.push(entry);
  return entry;
}

describe.skipIf(!TEST_DATABASE_URL)("원자재 오브젝트 채집(DB)", () => {
  it("한 번 캐면 화물·남은 번수가 저장되고 다시 켜도 그대로다", async () => {
    const first = await boot();
    const current = first.gather.current();
    const p = first.world.persistence;
    const map = [...first.world.maps.values()][0];
    if (!current || !p || !map) throw new Error("gather is not ready");
    const object = current.service.objects(map.mapKey)?.[0];
    if (!object) throw new Error("temp terrain has no rock block");
    const found = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ($1, $2, $3) returning id`,
      ["Fake_gather", "fake-gather@id.placeholder.invalid", "fake_gather"],
    );
    const userId = String(found[0]?.id);
    const ownerId = p.settlement.ownerOfUser(userId, clock).id;
    const unitId = p.nextId.unit();
    // 오브젝트 둘레의 설 칸에 세운다(걷기 한 구간)
    let placed = false;
    for (let ring = 1; ring < 10 && !placed; ring++)
      for (const [dx, dy] of [
        [ring, 0],
        [-ring, 0],
        [0, ring],
        [0, -ring],
      ] as const)
        if (
          !placed &&
          map.addUnit({
            id: unitId,
            size: 1,
            speed: WALK_SPEED,
            cellX: object.x + dx,
            cellY: object.y + dy,
            ownerId,
            kind: UNIT_KIND_HUMAN,
          })
        )
          placed = true;
    expect(placed).toBe(true);
    expect(await current.service.start(userId, { unitId, mapKey: map.mapKey, objectId: object.id })).toEqual({
      ok: true,
    });
    // 걷기·캐기 확인 시각마다 시계를 옮긴다. 캐는 중이면 [시작 시각, 끝 시각]이 진행바 구간이다
    let digWindow: { phaseAt: number | null | undefined; nextAt: number | null } | null = null;
    for (let step = 0; step < 20 && current.service.loops(userId)[0]?.gatheredLots === 0; step++) {
      const loop = current.service.loops(userId)[0];
      if (loop?.phase === "gathering") digWindow = { phaseAt: loop.phaseAt, nextAt: loop.nextAt };
      const next = current.service.loops(userId)[0]?.nextAt;
      clock = Math.max(clock + 1, next ?? clock + 1000);
      current.service.runDue();
      await flush();
    }
    const lots = current.service.loops(userId)[0]?.gatheredLots ?? 0;
    expect(lots).toBeGreaterThan(0);
    expect(digWindow?.phaseAt).toEqual(expect.any(Number));
    expect((digWindow?.nextAt ?? 0) - (digWindow?.phaseAt ?? 0)).toBeGreaterThan(0);
    const cargo = p.ledger.balanceOf(ownerId, "item:copper_ore", cargoLocation(unitId));
    expect(cargo).toBeGreaterThan(0n);
    // 직접 채집 효율 500‰라 묶음 하나에 두 번 캘 수 있다: 남은 번수는 5 − 캔 번수
    const left = current.store.read(map.mapKey, object.id, 5, clock).usesLeft;
    expect(left).toBeLessThan(5);
    const info = map.unitInfo(unitId);
    expect(info && anchorAt(positionAt(info.motion, clock), 1)).toBeDefined();
    current.service.halt(userId, unitId);
    await p.writer.durable();
    const saved = await rows<{ uses_left: number }>(
      test.db,
      "select uses_left from gather_object_states where map_key = $1 and object_id = $2",
      [map.mapKey, object.id],
    );
    expect(saved.map((row) => row.uses_left)).toEqual([left]);

    // 다시 켜기: 남은 번수·화물 그대로
    const entry = running.splice(0)[0];
    entry?.gather.stop();
    await entry?.world.stop();
    const second = await boot();
    const again = second.gather.current();
    expect(again?.store.read(map.mapKey, object.id, 5, clock).usesLeft).toBe(left);
    expect(
      second.world.persistence?.ledger.balanceOf(ownerId, "item:copper_ore", cargoLocation(unitId)),
    ).toBe(cargo);
  });
});
