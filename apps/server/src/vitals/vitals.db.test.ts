// 생명 수치 DB 통합 시험(기획 D-512) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 전투 끝 HP·아머·쉴드가 결과와 같은 커밋으로 저장되고(다시 켜도 한 번만), 다시 켜도 남고, 전투 밖에서 분 단위로 회복하고(쉴드 재생),
// 다음 전투가 남은 값으로 시작한다. 전투 밖 회복 물약이 저장한 HP를 채운다(D-509 쿨과 같은 커밋).
import type { BattleInit } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { carriedBy } from "../holdings/state.ts";
import { TEST_HOLDING_CONTENT } from "../holdings/testContent.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog, testEncounter } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { createVitalsReads } from "./reads.ts";

const T0 = 1_800_000_000_000;
const MIN = 60_000;
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

interface VitalsRow {
  unit_id: string;
  hp: string;
  armor: string;
  shield: string;
  max_hp: string;
  max_shield: string;
  regen_shield: string;
  updated_at_ms: string;
}

const savedVitals = () =>
  rows<VitalsRow>(
    test.db,
    `select unit_id, hp, armor, shield, max_hp, max_shield, regen_shield, updated_at_ms from unit_vitals order by unit_id`,
  );

/** 시험 전투: 편 1은 단단하고(HP 5000), 모든 유닛이 쉴드 40·쉴드 재생 분당 6을 갖는다(형식 확인용 값) */
function encounter(
  ids: readonly [number, number, number, number],
  owners: readonly [number, number],
): BattleInit {
  const base = testEncounter(ids, owners);
  return {
    ...base,
    units: base.units.map((spec) => ({
      ...spec,
      shieldHp: 40,
      shieldRegen: 6,
      ...(spec.side === 1 ? { maxHp: 5000 } : {}),
    })),
  };
}

describe.skipIf(!TEST_DATABASE_URL)("생명 수치 저장(D-512)", () => {
  it("전투 끝 값이 결과와 같은 커밋으로 남고, 다시 켜도 그대로·분 단위 회복, 다음 전투는 남은 값으로 시작", async () => {
    const first = await boot();
    const p = persistence(first);
    const mapKey = [...first.maps.keys()][0] ?? 0;
    const userA = await fakeUser("keeper");
    const userB = await fakeUser("fallen");
    const [a1 = 0, a2 = 0] = p.settlement.giveWorkers(userA, mapKey, 2, clock);
    const [b1 = 0, b2 = 0] = p.settlement.giveWorkers(userB, mapKey, 2, clock);
    const ownerA = p.settlement.ownerOfUser(userA, clock).id;
    const ownerB = p.settlement.ownerOfUser(userB, clock).id;
    // 줄이 없으면 시작 자료는 그대로(모두 가득)
    const init = encounter([a1, a2, b1, b2], [ownerA, ownerB]);
    expect(p.vitals.service.battleStart(init, clock)).toBe(init);
    const battleId = await p.battles.start(init, { war: false });
    const endsAtMs = (await p.battles.get(battleId))?.endsAtMs ?? 0;
    await p.writer.durable();
    expect(await savedVitals()).toEqual([]);
    await first.stop();

    // 끝 시각이 지난 뒤 다시 켜면 결과를 적용한다: 진 편(편 2)은 HP 0, 이긴 편은 다친 값
    clock = endsAtMs + 1_000;
    const second = await boot();
    const q = persistence(second);
    await waitFor(async () => (await q.battles.get(battleId))?.status === "ended");
    await q.writer.durable();
    const afterBattle = await savedVitals();
    const outcome = (await q.battles.get(battleId))?.outcome;
    const ended = new Map(outcome?.units.map((unit) => [unit.unit, unit]));
    expect(afterBattle.map((row) => Number(row.unit_id))).toEqual(
      [a1, a2, b1, b2].filter((unit) => {
        const left = ended.get(unit);
        return (
          left !== undefined && (left.hp < (unit === a1 || unit === a2 ? 5000 : 100) || left.shield < 40)
        );
      }),
    );
    for (const row of afterBattle) {
      const left = ended.get(Number(row.unit_id));
      expect([Number(row.hp), Number(row.armor), Number(row.shield)]).toEqual([
        left?.hp,
        left?.armor,
        left?.shield,
      ]);
      expect(Number(row.updated_at_ms)).toBe(endsAtMs);
      expect(Number(row.regen_shield)).toBe(6);
    }
    expect(afterBattle.find((row) => Number(row.unit_id) === b1)?.hp).toBe("0");
    expect(afterBattle.find((row) => Number(row.unit_id) === b2)?.hp).toBe("0");
    await second.stop();

    // 다시 켜도 다시 적용하지 않는다(결과 기록이 있다). 5분이 지나면 쉴드만 분당 6씩 찼다(HP는 회복 규칙 없음)
    clock = endsAtMs + 5 * MIN + 30_000;
    const third = await boot();
    const r = persistence(third);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await r.writer.durable();
    const kept = await savedVitals();
    expect(kept.filter((row) => Number(row.unit_id) !== a1 && Number(row.unit_id) !== a2)).toEqual(
      afterBattle.filter((row) => Number(row.unit_id) !== a1 && Number(row.unit_id) !== a2),
    );
    const b1Saved = afterBattle.find((row) => Number(row.unit_id) === b1);
    const b1Now = r.vitals.service.read(b1, clock);
    expect(b1Now?.values.hp).toBe(0);
    expect(b1Now?.values.shield).toBe(Math.min(40, Number(b1Saved?.shield ?? 0) + 5 * 6));
    expect(b1Now?.at).toBe(endsAtMs + 5 * MIN);
    // 다음 전투: 남은 값으로(HP 0이면 쓰러진 채) 시작한다
    const next = r.vitals.service.battleStart(encounter([a1, a2, b1, b2], [ownerA, ownerB]), clock);
    expect(next.units.find((spec) => spec.id === b1)?.start).toEqual({
      hp: 0,
      armor: 0,
      shield: b1Now?.values.shield,
    });
    // 조회(tRPC vitals.list): 내 유닛만, 응답 시각까지 셈한 값
    const reads = createVitalsReads(() => r.vitals);
    const listed = reads.list({ id: userB, loginId: "Fake_fallen", roles: ["player"] }, clock);
    expect(listed.hasOwner).toBe(true);
    expect(listed.units.map((unit) => unit.unit)).toEqual(
      [b1, b2].filter((unit) => kept.some((row) => Number(row.unit_id) === unit)),
    );
    expect(listed.units[0]?.values.hp).toBe(0);
  });

  it("전투 밖 회복 물약이 저장한 HP를 채우고(물건 −1·쿨과 같은 커밋), 다시 켜도 남는다", async () => {
    const first = await boot();
    const p = persistence(first);
    const mapKey = [...first.maps.keys()][0] ?? 0;
    const user = await fakeUser("medic");
    const [worker = 0] = p.settlement.giveWorkers(user, mapKey, 1, clock);
    const owner = p.settlement.ownerOfUser(user, clock).id;
    // 전투가 끝나 HP 10이 남았다(전투 결과 적용과 같은 함수)
    const init = encounter([worker, 9_000_001, 9_000_002, 9_000_003], [owner, owner]);
    expect(
      p.vitals.service.applyBattle(
        init,
        [{ unit: worker, side: 1, outcome: "stays", injured: false, hp: 10, armor: 0, shield: 40 }],
        clock,
      ),
    ).toBe(1);
    const made = p.holdings.service.acquire({
      ownerId: owner,
      item: "hold_big_potion",
      quantity: 2,
      location: carriedBy(worker),
      source: "dev_grant",
      atMs: clock,
      seed: 1,
    });
    const potion = made.ok ? (made.holdings[0] ?? 0) : 0;
    const used = p.holdings.service.use(owner, potion, { confirm: false, nowMs: clock + 1_000, seed: 2 });
    expect(used.ok).toBe(true);
    await p.writer.durable();
    const healed = await savedVitals();
    expect(healed).toHaveLength(1);
    expect(Number(healed[0]?.hp)).toBeGreaterThan(10);
    expect(await rows(test.db, `select quantity from item_holdings where id = $1`, [potion])).toEqual([
      { quantity: 1 },
    ]);
    expect(await rows(test.db, `select kind from unit_cooldowns where unit_id = $1`, [worker])).toEqual([
      { kind: "potion" },
    ]);
    await first.stop();

    clock += 10 * MIN;
    const second = await boot();
    expect(persistence(second).vitals.service.read(worker, clock)?.values.hp).toBe(Number(healed[0]?.hp));
  });
});
