// 전투 결과의 세계 적용 DB 통합 시험(docs/adr/2026-10-31-combat-core.md 8절) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 두 주체의 휴먼끼리 전쟁 전투를 열고, 끝 시각이 지난 뒤 다시 켜면: 진 유닛은 부상·포로·안전한 곳으로 걸어감(D-591 — 2655), 화물 절반은 이긴 쪽,
// 불변 조건은 그대로, 또 켜도 두 번 적용하지 않는다.
import {
  type BattleInit,
  CELL_UNITS,
  arrivalAt,
  TEST_SOCIETY_COEFFICIENTS,
  combatInjuryStage,
  resolveOutcomes,
  runBattle,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { cargoLocation } from "./battleResults.ts";
import { ASSET_ORE } from "./settlement.ts";
import { unavailable } from "./unitCondition.ts";
import { addTestUnits, silentLog, testEncounter } from "./testSupport.ts";
import { type World, startWorld } from "./world.ts";

const T0 = 1_800_000_000_000;
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

async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out");
}

describe.skipIf(!TEST_DATABASE_URL)("전투 결과 → 세계", () => {
  it("전쟁에서 진 유닛은 부상·포로·안전한 곳, 화물 절반은 이긴 쪽 유닛으로, 다시 켜도 한 번만", async () => {
    const first = await boot();
    const p = persistence(first);
    const mapKey = [...first.maps.keys()][0] ?? 0;
    const userA = await fakeUser("victor");
    const userB = await fakeUser("loser");
    const [a1 = 0, a2 = 0] = addTestUnits(first, userA, mapKey, 2, clock);
    const [b1 = 0, b2 = 0] = addTestUnits(first, userB, mapKey, 2, clock);
    const ownerA = p.settlement.ownerOfUser(userA, clock).id;
    const ownerB = p.settlement.ownerOfUser(userB, clock).id;
    // 진 쪽 유닛마다 화물(광석) 10
    for (const unit of [b1, b2])
      p.ledger.post({
        kind: "issue",
        atMs: clock,
        entries: [
          { account: p.ledger.systemAccount("test_issue_ore", ASSET_ORE), amount: -10n },
          { account: p.ledger.ownerAccount(ownerB, ASSET_ORE, cargoLocation(unit)), amount: 10n },
        ],
      });
    // 편 1(A)이 훨씬 세다 → 편 2(B) 전멸
    const base = testEncounter([a1, a2, b1, b2], [ownerA, ownerB]);
    const init: BattleInit = {
      ...base,
      units: base.units.map((spec) => (spec.side === 1 ? { ...spec, maxHp: 5000 } : spec)),
    };
    const battleId = await p.battles.start(init, { war: true });
    const endsAtMs = (await p.battles.get(battleId))?.endsAtMs ?? 0;
    await p.writer.durable();
    await first.stop();

    // 끝 시각이 지난 뒤 다시 켠다 → 곧바로 적용
    clock = endsAtMs + 1_000;
    const second = await boot();
    const q = persistence(second);
    await waitFor(async () => (await q.battles.get(battleId))?.status === "ended");
    const local = runBattle(init, []);
    const expected = resolveOutcomes(local.state, { war: true });
    expect(expected.filter((r) => r.side === 2).map((r) => [r.outcome, r.injured])).toEqual([
      ["prisoner", true],
      ["prisoner", true],
    ]);

    const units = await rows<{ id: string; injury: number; injury_until_ms: string; held_by: string | null }>(
      test.db,
      `select id, injury, injury_until_ms, held_by from world_units where id = any($1) order by id`,
      [[b1, b2]],
    );
    // 쓰러진 유닛은 부상 단계를 굴린다(D-521, 쓰러짐 확률 출발값 1000‰ — 단계는 단계표에서): 그 단계의 자연 치유 시간 뒤 한 단계 내려간다
    const c = TEST_SOCIETY_COEFFICIENTS.injury;
    expect(units).toEqual(
      [b1, b2].map((id) => {
        const spec = init.units.find((unit) => unit.id === id);
        const stage = combatInjuryStage(
          { seed: init.seed, unit: id, maxHp: spec?.maxHp ?? 1, startHp: spec?.maxHp ?? 1, endHp: 0 },
          c,
        );
        expect(stage).toBeGreaterThan(0);
        return {
          id: String(id),
          injury: stage,
          injury_until_ms: String(endsAtMs + (c.healMs[stage] ?? 0)),
          held_by: String(ownerA),
        };
      }),
    );
    // 포로는 주인의 명령을 받지 않는다
    const map = second.maps.get(mapKey);
    expect(await map?.moveUnit(b1, { x: 5000, y: 5000 })).toEqual({ ok: false, code: "invalid_request" });
    // 진 유닛은 가장 가까운 안전 도시(시험 NPC 세력의 시작 도시, 가운데 칸) 둘레로 실제로 걸어간다(D-591 순간이동 없음 — 질문 2655):
    // 지금 자리는 전투 자리 그대로이고 길 끝이 그 도시 둘레, 닿을 때까지 돌아가는 중(쓰지 못함)
    const before = map?.unitInfo(b1)?.motion.waypoints[0];
    await waitFor(async () => {
      const info = map?.unitInfo(b1);
      return (
        info !== undefined &&
        info.motion.waypoints.length > 1 &&
        info.condition.returningUntilMs === arrivalAt(info.motion)
      );
    });
    const walking = map?.unitInfo(b1);
    if (!walking) throw new Error("no unit");
    expect(walking.motion.waypoints[0]).toEqual(before);
    expect(walking.motion.waypoints.length).toBeGreaterThan(1);
    expect(walking.condition.returningUntilMs).toBeGreaterThan(clock);
    // 걷는 동안은 쓰지 못하고(포로가 아니어도), 닿으면 풀린다
    const free = { ...walking.condition, heldBy: null, injury: 0, injuryUntilMs: null };
    expect(unavailable(free, clock)).toBe(true);
    expect(unavailable(free, arrivalAt(walking.motion))).toBe(false);
    const startCities = await rows<{ cell_x: number; cell_y: number }>(
      test.db,
      `select cell_x, cell_y from world_cities where start and map_key = $1`,
      [mapKey],
    );
    expect(startCities).toHaveLength(1);
    const stand = walking.motion.waypoints.at(-1);
    const near = startCities[0];
    expect(Math.abs(Math.floor((stand?.x ?? 0) / CELL_UNITS) - (near?.cell_x ?? 0))).toBeLessThan(16);
    expect(Math.abs(Math.floor((stand?.y ?? 0) / CELL_UNITS) - (near?.cell_y ?? 0))).toBeLessThan(16);
    // 돌아가는 중 표시는 저장된다(다시 켜도 이어진다)
    await q.writer.durable();
    const saved = await rows<{ returning_until_ms: string | null }>(
      test.db,
      `select returning_until_ms from world_units where id = $1`,
      [b1],
    );
    expect(saved[0]?.returning_until_ms).toBe(String(walking.condition.returningUntilMs));

    // 화물: 진 쪽은 5씩 남고, 이긴 쪽 첫 남은 유닛의 화물에 10
    const winnerStays = expected.find((r) => r.side === 1 && r.outcome === "stays")?.unit ?? 0;
    expect(q.ledger.balanceOf(ownerB, ASSET_ORE, cargoLocation(b1))).toBe(5n);
    expect(q.ledger.balanceOf(ownerB, ASSET_ORE, cargoLocation(b2))).toBe(5n);
    expect(q.ledger.balanceOf(ownerA, ASSET_ORE, cargoLocation(winnerStays))).toBe(10n);
    expect([a1, a2]).toContain(winnerStays);
    expect(await second.checkInvariants()).toEqual([]);
    await second.stop();

    // 또 켜도 두 번 적용하지 않는다
    clock += 60_000;
    const third = await boot();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const counts = await rows<{ loot: string; results: string }>(
      test.db,
      `select (select count(*) from ledger_transactions where kind = 'loot') as loot,
              (select count(*) from world_battle_results) as results`,
    );
    expect(counts).toEqual([{ loot: "1", results: "1" }]);
    expect(persistence(third).ledger.balanceOf(ownerA, ASSET_ORE, cargoLocation(winnerStays))).toBe(10n);
    expect(await third.checkInvariants()).toEqual([]);
  });
});
