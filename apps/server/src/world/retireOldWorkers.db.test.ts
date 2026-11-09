// 없앤 시험 일꾼(종류 1) 옛 행을 부팅이 지우는지 DB 통합 시험(사용자 지적 2026-11-09 "시험일꾼 다 없애라고") — TEST_DATABASE_URL이 있을 때만.
// 계정은 시험용 가짜 값이다. 옛 서버가 남긴 것처럼 종류 1 유닛(든 물건·화물·노동 계약)을 세운 뒤 다시 켜면: 유닛 행은 없고, 든 물건은 그
// 2차맵 도시 창고(사이보그 본체가 없는 주인), 화물은 주인 자리 없는 계정, 계약은 다음 정산에서 "유닛 사라짐"으로 끝나며 불변 조건이 맞고,
// 서버 기록 한 줄과 감사 기록이 남는다. 지울 것이 없으면 아무것도 남기지 않는다.
import { laborEscrowCode } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carriedBy } from "../holdings/state.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { cargoLocation } from "./battleResults.ts";
import { ASSET_CREDIT, ASSET_ORE } from "./settlement.ts";
import { addTestUnits } from "./testSupport.ts";
import { UNIT_KIND_HUMAN, UNIT_KIND_OLD_WORKER } from "./unitKinds.ts";
import { type World, startWorld } from "./world.ts";

const T0 = 1_800_000_000_000;
const HOUR = 3_600_000;

let test: TestDatabase;
let clock = T0;
const worlds: World[] = [];
const logged: { obj: object; message: string }[] = [];
const log = {
  info: (obj: object, message: string) => logged.push({ obj, message }),
  warn: (obj: object, message: string) => logged.push({ obj, message }),
  error: (obj: object, message: string) => logged.push({ obj, message }),
};

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = T0;
  logged.length = 0;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 0,
    paths: { kind: "inline" },
    now: () => clock,
    log,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    holdings: { content: () => TEST_HOLDING_CONTENT },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function stop(world: World): Promise<void> {
  await world.stop();
  worlds.splice(worlds.indexOf(world), 1);
}

function persistence(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("no persistence");
  return found;
}

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  return String(found[0]?.id);
}

const removedLine = () => logged.find((line) => line.message === "world boot: removed the old test workers");

describe.skipIf(!TEST_DATABASE_URL)("없앤 시험 일꾼 옛 행 정리(부팅)", () => {
  it("종류 1 유닛을 지우고 든 물건·화물은 주인에게, 계약은 다음 정산에서 끝난다. 휴먼은 그대로", async () => {
    const first = await boot();
    const p = persistence(first);
    const mapKey = [...first.maps.keys()][0] ?? 0;
    const user = await fakeUser("old_worker");
    // 옛 서버가 남긴 시험 일꾼 둘(종류 1)과 휴먼 하나
    const [w1 = 0, w2 = 0] = addTestUnits(first, user, mapKey, 2, clock, { kind: UNIT_KIND_OLD_WORKER });
    const [human = 0] = addTestUnits(first, user, mapKey, 1, clock);
    const ownerId = p.settlement.ownerOfUser(user, clock).id;
    // w1: 든 물건(조끼) + 화물(광석 7)
    const vest = p.holdings.service.acquire({
      ownerId,
      item: "hold_vest",
      quantity: 1,
      location: carriedBy(w1),
      source: "dev_grant",
      atMs: clock,
      seed: 3,
    });
    expect(vest.ok).toBe(true);
    const vestId = vest.ok ? (vest.holdings[0] ?? 0) : 0;
    p.ledger.post({
      kind: "issue",
      atMs: clock,
      entries: [
        { account: p.ledger.systemAccount("test_issue_ore", ASSET_ORE), amount: -7n },
        { account: p.ledger.ownerAccount(ownerId, ASSET_ORE, cargoLocation(w1)), amount: 7n },
      ],
    });
    // w2: 내 건물에서 임금형 계약(보증금은 에스크로)
    const placed = first.maps
      .get(mapKey)
      ?.placeBuilding({ x: 40, y: 40, width: 2, height: 2, rotation: 0 }, ownerId);
    if (!placed?.ok || placed.buildingId === undefined) throw new Error("no building");
    p.settlement.grantCredit(ownerId, 10_000n, clock);
    const hired = await p.labor.create(user, { kind: "wage", buildingId: placed.buildingId, unitId: w2 });
    if (!hired.ok || hired.contractId === undefined) throw new Error(`no contract: ${JSON.stringify(hired)}`);
    const contractId = hired.contractId;
    await p.writer.durable();
    expect(removedLine()).toBeUndefined();
    await stop(first);

    clock += HOUR;
    const second = await boot();
    const q = persistence(second);
    expect(removedLine()?.obj).toEqual({ units: 2, holdings: 1, stranded: 0, cargo: 1 });
    const units = await rows<{ id: string; kind: number }>(test.db, "select id, kind from world_units");
    expect(units.map((row) => Number(row.id))).toEqual([human]);
    expect(units.map((row) => row.kind)).toEqual([UNIT_KIND_HUMAN]);
    for (const map of second.maps.values()) expect(map.unitInfo(w1) ?? map.unitInfo(w2)).toBeUndefined();
    // 든 물건: 사이보그 본체가 없는 주인 → 그 2차맵 도시 창고(위치 = 도시 ID), 입은 칸은 벗김
    const [city] = await rows<{ id: string }>(
      test.db,
      "select id from world_cities where map_key = $1 order by id",
      [mapKey],
    );
    expect(city).toBeDefined();
    expect(
      await rows<{ location: string; slot: number | null }>(
        test.db,
        "select location, slot from item_holdings where id = $1",
        [vestId],
      ),
    ).toEqual([{ location: String(city?.id), slot: null }]);
    // 화물: 주인의 자리 없는 계정으로
    expect(q.ledger.balanceOf(ownerId, ASSET_ORE)).toBe(7n);
    expect(q.ledger.balanceOf(ownerId, ASSET_ORE, cargoLocation(w1))).toBe(0n);
    // 계약은 다음 정산에서 "유닛 사라짐"으로 끝나고 남은 보증금이 돌아온다
    q.settlement.settleOwner(ownerId, clock);
    expect(q.labor.contracts.get(contractId)).toMatchObject({ state: "ended", endReason: "unit_gone" });
    expect(q.ledger.balance(q.ledger.systemAccount(laborEscrowCode(contractId), ASSET_CREDIT))).toBe(0n);
    expect(await second.checkInvariants()).toEqual([]);
    expect(
      await rows<{ action: string; before: unknown }>(
        test.db,
        "select action, before from audit_log where action = 'world.retire_test_workers'",
      ),
    ).toEqual([
      { action: "world.retire_test_workers", before: { units: 2, holdings: 1, stranded: 0, cargo: 1 } },
    ]);
    await stop(second);

    // 다시 켜면 지울 것이 없다(기록도 없음)
    logged.length = 0;
    await boot();
    expect(removedLine()).toBeUndefined();
  });
});
