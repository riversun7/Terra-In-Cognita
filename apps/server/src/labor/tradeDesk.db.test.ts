// 거래소 거래 직무 DB 통합 시험(질문 2083·2084, 줄기 exchange-3 — 기획 D-571 1944 "거래소에 배치, 거래소 개인창고 및 거래물품 관리 등 역할",
// docs/adr/2026-11-16-exchange-buildings.md "바뀜 (2081·2083·2084·2086)") — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 가짜 시계로: 플레이어가 물자 거래소를 짓고 → 제 유닛은 직무 배치로 둔다. 남은 직무 배치로 두지 못하고, 주인이 자리 값(임대료)을 내야 임대형 계약으로
// 빌린다. 거래 직무는 산출(시험 광석)이 없고 자리 값은 그 거래소 금고로 간다. 자리 수 = 레벨 × 설정 칸.
import { buildingLocation } from "@terra/shared/goodsPlaces";
import { UPKEEP_PERIOD_MS, WALK_SPEED } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_FACILITY_SOURCE } from "../facilities/testFacilities.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import {
  TEST_DATABASE_URL,
  type TestDatabase,
  createTestDatabase,
  joinCityFaction,
  rows,
} from "../testDb.ts";
import { ASSET_CREDIT, ASSET_ORE } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { UNIT_KIND_HUMAN } from "../world/unitKinds.ts";
import { type World, startWorld } from "../world/world.ts";
import { workerFor } from "./workerEntry.ts";

const HOUR = 3_600_000;
/** 정시 + 1ms에서 시작 */
const T0 = 1_800_000_000_000 - (1_800_000_000_000 % UPKEEP_PERIOD_MS) + 1;

let test: TestDatabase;
let clock = T0;
const worlds: World[] = [];

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = T0;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
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
  worlds.push(world);
  await world.ready;
  return world;
}

function persistence(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("no persistence");
  return found;
}

function firstMap(world: World) {
  const map = [...world.maps.values()][0];
  if (!map) throw new Error("no map");
  return map;
}

/** 사용자 하나: 소유 주체·시험 화폐·휴먼 유닛 하나 */
async function setup(world: World, name: string, cell: number) {
  const p = persistence(world);
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  const userId = String(found[0]?.id);
  const ownerId = p.settlement.ownerOfUser(userId, clock).id;
  p.settlement.grantCredit(ownerId, 100_000n, clock);
  const map = firstMap(world);
  await joinCityFaction(test.db, userId, map.mapKey);
  const unitId = p.nextId.unit();
  expect(
    map.addUnit({
      id: unitId,
      size: 1,
      speed: WALK_SPEED,
      cellX: cell,
      cellY: cell,
      ownerId,
      kind: UNIT_KIND_HUMAN,
    }),
  ).toBe(true);
  return { userId, ownerId, unitId };
}

describe.skipIf(!TEST_DATABASE_URL)("거래소 거래 직무(질문 2083·2084)", () => {
  it("내 거래소는 직무 배치, 남의 거래소는 주인이 낸 자리를 임대형 계약으로 — 산출 없음, 자리 값은 그 거래소 금고", async () => {
    const world = await boot();
    const p = persistence(world);
    const a = await setup(world, "deskowner", 30);
    const b = await setup(world, "desktrader", 32);
    const service = p.facilities.service;
    const mapKey = firstMap(world).mapKey;
    for (const [item, qty] of Object.entries({ pine_log: 14, stone: 12_000 }))
      expect(await service.devFacilityGrant(a.userId, item, qty, { mapKey, x: 50, y: 50 })).toEqual({
        ok: true,
      });
    const built = await service.build(a.userId, {
      mapKey,
      facility: "goods_exchange",
      x: 50,
      y: 50,
      rotation: 0,
    });
    if (!built.ok || built.buildingId === undefined)
      throw new Error(`build failed: ${JSON.stringify(built)}`);
    const ex = built.buildingId;
    clock += 6 * HOUR;
    service.finishDue(clock);
    expect(service.facilities.get(ex)?.level).toBe(1);

    // 내 거래소: 제 유닛은 직무 배치로 둔다
    expect(await p.labor.assign(a.userId, ex, a.unitId)).toEqual({ ok: true });
    // 남의 거래소에는 직무 배치로 두지 못한다(다른 시설과 같다)
    expect(await p.labor.assign(b.userId, ex, b.unitId)).toEqual({ ok: false, code: "forbidden" });
    // 주인이 자리를 내지 않으면 빌리지 못한다
    expect(p.labor.rentOf(ex)).toBeNull();
    expect(await p.labor.create(b.userId, { kind: "lease", buildingId: ex, unitId: b.unitId })).toEqual({
      ok: false,
      code: "not_for_lease",
    });
    // 주인이 시간당 자리 값을 내면 임대형 계약으로 빌린다
    expect(await p.labor.setRent(a.userId, ex, 7n)).toEqual({ ok: true });
    expect(p.labor.rentOf(ex)).toBe(7n);
    const leased = await p.labor.create(b.userId, { kind: "lease", buildingId: ex, unitId: b.unitId });
    expect(leased.ok).toBe(true);
    // 일꾼 줄: 직무 배치 = 유닛 주인 몫, 빌린 자리 = 임차인(유닛 주인) 몫 — 계약 ID
    const workers = p.labor.workersAt(ex);
    expect(workers.map((entry) => [entry.unitId, entry.via, workerFor(entry)])).toEqual(
      [
        [a.unitId, "assign", a.ownerId],
        [b.unitId, "lease", b.ownerId],
      ].toSorted((x, y) => Number(x[0]) - Number(y[0])),
    );
    expect(workers.find((entry) => entry.unitId === b.unitId)?.contractId).toBe(
      leased.ok ? leased.contractId : undefined,
    );
    // 두 시간 뒤: 거래 직무는 산출이 없고(시험 광석도), 자리 값은 그 거래소 금고로
    const vaultBefore = p.ledger.balanceOf(a.ownerId, ASSET_CREDIT, buildingLocation(ex));
    clock += 2 * HOUR;
    p.settlement.settleOwner(b.ownerId, clock);
    p.settlement.settleOwner(a.ownerId, clock);
    expect(p.ledger.balanceOf(b.ownerId, ASSET_ORE, buildingLocation(ex))).toBe(0n);
    expect(p.ledger.balanceOf(b.ownerId, ASSET_ORE)).toBe(0n);
    expect(p.ledger.balanceOf(a.ownerId, ASSET_ORE)).toBe(0n);
    expect(p.ledger.balanceOf(a.ownerId, ASSET_CREDIT, buildingLocation(ex))).toBeGreaterThan(vaultBefore);
    // 배치·계약은 그대로(내 거래소 배치는 정산이 풀지 않는다)
    expect(p.labor.workersAt(ex).map((entry) => entry.unitId)).toEqual(
      [a.unitId, b.unitId].toSorted((x, y) => x - y),
    );
    expect(await world.checkInvariants()).toEqual([]);
  });
});
