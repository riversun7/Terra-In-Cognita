// 운영자 콘솔 DB 통합 시험 — TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다(docs/adr/2026-11-08-operator-console.md).
// 실제 월드(저장 켬)와 DB로: 현황 수, 유저 목록·상세(유닛·자산), 유닛 목록·상세, 유닛 통제(멈추기·치료·순간이동),
// 원장 지급·회수(잔고·운영자 거래·감사 기록), 정지·해제와 세션 지우기, 권한 체크박스 저장, 세력·도시·감사 기록 조회를 본다.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { createOpsServices } from "./services.ts";
import { loadOpsSwitches } from "./switches.ts";

const T0 = 1_800_000_000_000;
const MINUTE = 60_000;

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
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function fakeUser(name: string, role = "player"): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username, role) values ($1, $2, $3, $4) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`, role],
  );
  return String(found[0]?.id);
}

describe.skipIf(!TEST_DATABASE_URL)("운영자 콘솔(DB)", () => {
  it("조회·유닛 통제·원장 지급·정지·권한 체크박스가 DB와 맞는다", async () => {
    const world = await boot();
    const persistence = world.persistence;
    if (!persistence) throw new Error("no persistence");
    const switches = await loadOpsSwitches(test.db.$client);
    const ops = createOpsServices(
      {
        pool: test.db.$client,
        world: () => world,
        worldStatus: () => world.status(),
        wsConnections: () => 3,
        switches,
        now: () => clock,
      },
      { ip: "127.0.0.1" },
    );
    const operator = await fakeUser("ops_admin", "admin");
    const player = await fakeUser("ops_player");
    const opsViewer = { id: operator, roles: ["admin"] as const };
    const mapKey = [...world.maps.keys()][0] ?? 0;
    const [unitA = 0] = persistence.settlement.giveWorkers(player, mapKey, 1, clock);
    const ownerId = persistence.settlement.ownerOfUser(player, clock).id;
    await persistence.writer.durable();

    // 현황
    const overview = await ops.overview();
    expect(overview.world.state).toBe("ready");
    expect(overview.wsConnections).toBe(3);
    expect(overview.counts.users).toBe(2);
    expect(overview.world.units).toBeGreaterThanOrEqual(1);

    // 유저 목록: 검색·운영진 거르기
    const list = await ops.players({
      search: "ops_player",
      status: "all",
      sort: "login",
      limit: 10,
      offset: 0,
    });
    expect(list.total).toBe(1);
    expect(list.rows[0]).toMatchObject({ loginId: "Fake_ops_player", ownerId, units: 1, banned: false });
    const staff = await ops.players({ search: "", status: "staff", sort: "created", limit: 10, offset: 0 });
    expect(staff.rows.map((row) => row.id)).toEqual([operator]);
    // LIKE 특수 글자는 글자로 본다(_가 아무 글자가 되지 않는다)
    expect(
      (await ops.players({ search: "%", status: "all", sort: "login", limit: 10, offset: 0 })).total,
    ).toBe(0);

    // 유닛 목록·상세
    const units = await ops.units({ ownerKind: "user", limit: 10, offset: 0 });
    expect(units.rows.map((row) => row.id)).toEqual([unitA]);
    expect(units.rows[0]).toMatchObject({ ownerKind: "user", ownerLabel: "Fake_ops_player", mapKey });
    const detail = await ops.unit(unitA);
    expect(detail?.unit.id).toBe(unitA);
    expect(detail?.human).toBeNull();

    // 유닛 통제: 다치게 한 뒤 치료 → 부상 0, 감사 기록
    world.maps
      .get(mapKey)
      ?.setCondition(unitA, { injury: 2, injuryUntilMs: clock + 60 * MINUTE, heldBy: null });
    expect(
      await ops.unitAction(opsViewer, { unitId: unitA, action: { kind: "heal" }, reason: "test" }),
    ).toEqual({
      result: "ok",
    });
    expect(world.maps.get(mapKey)?.unitInfo(unitA)?.condition.injury).toBe(0);
    expect(
      await ops.unitAction(opsViewer, { unitId: 999_999, action: { kind: "stop" }, reason: "" }),
    ).toEqual({
      result: "not_found",
    });
    // 순간이동: 지금 자리에서 한 칸 옆(설 수 있는 칸을 찾아서)
    const here = (await ops.unit(unitA))?.unit;
    if (!here) throw new Error("unit missing");
    const map = world.maps.get(mapKey);
    let targetCell: { x: number; y: number } | undefined;
    for (let d = 2; d < 40 && !targetCell; d += 1)
      for (const [dx, dy] of [
        [d, 0],
        [-d, 0],
        [0, d],
        [0, -d],
      ] as const) {
        const x = here.cellX + dx;
        const y = here.cellY + dy;
        if (x >= 0 && y >= 0 && map?.isStandable(x, y, 1)) {
          targetCell = { x, y };
          break;
        }
      }
    if (!targetCell) throw new Error("no standable cell");
    expect(
      await ops.unitAction(opsViewer, {
        unitId: unitA,
        action: { kind: "teleport", cellX: targetCell.x, cellY: targetCell.y },
        reason: "stuck",
      }),
    ).toEqual({ result: "ok" });
    const moved = (await ops.unit(unitA))?.unit;
    expect({ x: moved?.cellX, y: moved?.cellY }).toEqual(targetCell);

    // 원장 지급 → 잔고·운영자 거래, 잔고보다 큰 회수는 거절
    const granted = await ops.grant(opsViewer, {
      ownerId,
      asset: ASSET_CREDIT,
      amount: 500n,
      reason: "보상",
    });
    expect(granted).toMatchObject({ ok: true });
    const before = BigInt(granted.ok ? granted.balance : "0");
    expect(
      await ops.grant(opsViewer, { ownerId, asset: ASSET_CREDIT, amount: -(before + 1n), reason: "회수" }),
    ).toEqual({
      ok: false,
      code: "insufficient",
    });
    expect(
      await ops.grant(opsViewer, { ownerId, asset: ASSET_CREDIT, amount: -100n, reason: "회수" }),
    ).toMatchObject({
      ok: true,
      balance: String(before - 100n),
    });
    const economy = await ops.economy({ asset: "" });
    expect(economy.operatorTx.map((tx) => tx.kind)).toEqual(["ops_revoke", "ops_grant"]);
    expect(economy.top.find((row) => row.ownerId === ownerId)?.balance).toBe(String(before - 100n));
    const playerDetail = await ops.player(player);
    expect(playerDetail?.balances.find((row) => row.asset === ASSET_CREDIT)?.balance).toBe(
      String(before - 100n),
    );
    expect(playerDetail?.units.map((unit) => unit.id)).toEqual([unitA]);

    // 정지(세션 지움)·해제
    await test.db.$client.query(
      "insert into sessions (expires_at, token, user_id) values (now() + interval '1 day', 'fake-token', $1)",
      [player],
    );
    expect((await ops.player(player))?.sessions.count).toBe(1);
    expect(await ops.ban(opsViewer, { userId: player, banned: true, reason: "abuse", hours: 24 })).toEqual({
      ok: true,
    });
    const banned = await ops.player(player);
    expect(banned?.player).toMatchObject({ banned: true, banReason: "abuse" });
    expect(banned?.sessions.count).toBe(0);
    expect(await ops.ban(opsViewer, { userId: player, banned: false, reason: "", hours: null })).toEqual({
      ok: true,
    });
    expect((await ops.player(player))?.player.banned).toBe(false);
    expect(await ops.ban(opsViewer, { userId: operator, banned: true, reason: "", hours: null })).toEqual({
      ok: false,
      code: "self",
    });

    // 권한 체크박스
    expect(
      await ops.setGrants({ id: operator, roles: ["dev"] }, { userId: player, permissions: ["view_server"] }),
    ).toEqual({
      ok: true,
    });
    expect((await ops.grantsOf(player))?.access).toEqual({ permissions: [], granted: ["view_server"] });

    // 감사 기록: 운영자 동작만
    const audit = await ops.audit({ action: "ops.", limit: 50 });
    expect(audit.map((row) => row.action)).toEqual([
      "ops.set_grants",
      "ops.unban",
      "ops.ban",
      "ops.revoke",
      "ops.grant",
      "ops.unit.teleport",
      "ops.unit.heal",
    ]);
    expect(audit.find((row) => row.action === "ops.grant")?.meta).toMatchObject({ reason: "보상", ownerId });
    // 대상 계정 아이디가 붙는다, 분류·한 사람·대상 거르기
    expect(audit.find((row) => row.action === "ops.ban")?.targetLoginId).toBe("Fake_ops_player");
    const byCategory = await ops.audit({ action: "", categories: ["ops"], limit: 50 });
    expect(byCategory.length).toBe(audit.length);
    expect(await ops.audit({ action: "", categories: ["tuning"], limit: 50 })).toEqual([]);
    expect(
      // 그 유저를 대상으로 한 운영자 동작 모두(유닛 통제·지급도 대상 = 유닛·주체의 계정)
      (await ops.audit({ action: "", targetSearch: "ops_player", limit: 50 })).map((row) => row.action),
    ).toEqual(audit.map((row) => row.action));
    expect((await ops.audit({ action: "", actorSearch: "ops_admin", limit: 50 })).length).toBe(audit.length);
    expect(await ops.audit({ action: "", actorSearch: "nobody", limit: 50 })).toEqual([]);

    // 운영 스위치: 기본 꺼짐, 켜면 DB에 남고 다시 읽어도 켜짐, 바꾼 것은 감사 기록
    expect(ops.switches()).toEqual([{ id: "view_audit", enabled: false }]);
    expect(await ops.setSwitch(opsViewer, { id: "view_audit", enabled: true })).toEqual({ ok: true });
    expect((await loadOpsSwitches(test.db.$client)).isOn("view_audit")).toBe(true);
    expect((await ops.audit({ action: "ops.switch", limit: 5 }))[0]?.after).toEqual({ view_audit: true });

    // 세력·도시(시험 NPC 세력이 있다)
    const factions = await ops.factions({ kind: "npc", includeDissolved: false });
    expect(factions.length).toBeGreaterThanOrEqual(1);
    const first = factions[0];
    if (!first) throw new Error("no faction");
    expect((await ops.faction(first.id))?.faction.id).toBe(first.id);
    expect(Array.isArray(await ops.cities({ search: "" }))).toBe(true);
  });
});
