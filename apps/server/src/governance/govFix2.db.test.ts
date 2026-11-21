// gov-fix-2 DB 통합 시험 — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// - 질문 2532 (3) 기획 답(D-588 5 NPC 예외 없음): NPC 지배 가문 빈자리도 가문원 서열로 다음 가문장이 잇는다(자동 선출은 이을 사람이 없을 때만). 계승 기록은
//   governance_state.npc_head_unit_id에 남고 NPC 런타임 가문장이 그 유닛이다.
// - 질문 2537 기획 답: 주민세 도시 몫(도시 운영비 금고 — 원장 계정)은 다시 켜도 남고, 운영비를 그 금고에서 메운다.
import {
  DAY_MS,
  TEST_ASSET_CREDIT,
  cityFundCode,
  cityFundIndex,
  depositCityFund,
  drawCityFund,
} from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { legacyNationPresets, silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { attachGovernance } from "./attach.ts";
import { TEST_GOVERNANCE_RULES } from "./rules.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.pack) throw new Error("content pack");
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));

let test: TestDatabase;
const worlds: World[] = [];
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + 3_600_000;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(ticks = 4): Promise<World> {
  const world = startWorld({
    testBots: 12,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 2, manual: true, presets },
  });
  worlds.push(world);
  await world.ready;
  const npc = world.npc;
  if (!npc) throw new Error("npc");
  for (let i = 0; i < ticks; i += 1) {
    clock += 30 * 60_000;
    await npc.tick(true);
  }
  return world;
}

function parts(world: World) {
  const persistence = world.persistence;
  const npc = world.npc;
  if (!persistence || !npc) throw new Error("world");
  return { persistence, npc };
}

describe.skipIf(!TEST_DATABASE_URL)("gov-fix-2", () => {
  it("NPC 지배 가문 빈자리: 가문원 서열로 다음 가문장이 잇고(자동 선출 없음) 다시 읽어도 그 가문장이다(질문 2532 (3))", async () => {
    const world = await boot();
    const { npc } = parts(world);
    const gov = attachGovernance({
      db: test.db,
      world: () => world,
      rules: () => ({ ...TEST_GOVERNANCE_RULES, coupEnabled: false }),
      now: () => clock,
      log: silentLog,
      manual: true,
    });
    const nation = gov.port.nations().find((row) => !row.playerHouse);
    if (!nation) throw new Error("npc nation");
    const faction = npc.world.factions.get(nation.ownerId);
    if (faction) faction.regime = "democracy";
    const ruling = npc.cityHouses.rulingHouseOf(nation.ownerId);
    if (!ruling) throw new Error("ruling");
    const members = npc.cityHouses.membersOf(ruling.id);
    expect(members.length).toBeGreaterThan(0);
    const leaderUnit = npc.cityHouses.headOf(ruling.id);
    // 해임 뒤 다시 뽑기가 실패해 빈자리가 된 판(질문 2403 답 D-582)
    await test.db.$client.query(
      `insert into governance_state (nation_id, ruling_house_key, elected_at_ms, term_ends_at_ms, vacant_since_ms, updated_at_ms)
       values ($1, $2, $3, $4, $3, $3)`,
      [nation.rowId, `n:${ruling.id}`, clock, clock + 30 * DAY_MS],
    );
    await gov.service.tick();
    const state = await rows<{
      ruling_house_key: string;
      vacant_since_ms: string | null;
      npc_head_unit_id: string;
    }>(
      test.db,
      "select ruling_house_key, vacant_since_ms, npc_head_unit_id from governance_state where nation_id = $1",
      [nation.rowId],
    );
    expect(state[0]).toMatchObject({ ruling_house_key: `n:${ruling.id}`, vacant_since_ms: null });
    const head = Number(state[0]?.npc_head_unit_id);
    expect(members).toContain(head);
    expect(head).toBe(npc.cityHouses.successorOf(ruling.id, new Set()));
    // NPC 런타임 가문장 = 이은 가문원(국가 지도자 유닛은 퇴임)
    expect(npc.cityHouses.headOf(ruling.id)).toBe(head);
    expect(head).not.toBe(leaderUnit);
    // 자동 선출은 열지 않았다
    expect(
      await rows(
        test.db,
        "select id from governance_agendas where nation_id = $1 and kind = 'leader_election'",
        [nation.rowId],
      ),
    ).toEqual([]);
    // 다음 틱도 그대로(기록 = 런타임 가문장)
    await gov.service.tick();
    expect(npc.cityHouses.headOf(ruling.id)).toBe(head);
    gov.stop();
  }, 180_000);

  it("도시 운영비 금고: 걷은 도시 몫이 다시 켠 뒤에도 남고, 운영비를 그 금고에서 메운다(질문 2537)", async () => {
    let world = await boot(1);
    let { npc, persistence } = parts(world);
    const owner = [...npc.world.factions.values()].find(
      (faction) => faction.alive && faction.cities.size > 0,
    );
    const city = owner ? [...owner.cities][0] : undefined;
    if (!owner || city === undefined) throw new Error("nation city");
    const asset = TEST_ASSET_CREDIT;
    const treasury = npc.world.book.balanceOf(owner.id, asset);
    expect(treasury).toBeGreaterThan(500n);
    depositCityFund(npc.world.book, owner.id, city, asset, 500n, clock);
    await persistence.writer.durable();
    await world.stop();
    worlds.splice(0);

    // 다시 켬: 원장 계정에서 금고를 읽는다
    world = await boot(0);
    ({ npc, persistence } = parts(world));
    const account = cityFundIndex(npc.world.book).get(cityFundCode(owner.id, city, asset));
    expect(account).toBeDefined();
    expect(npc.world.book.balance(account ?? -1)).toBe(500n);
    const before = npc.world.book.balanceOf(owner.id, asset);
    // 운영비 200을 금고가 낸다(금고 → 국고), 남은 300은 금고에
    expect(drawCityFund(npc.world.book, owner.id, account, asset, 200n, clock)).toBe(200n);
    expect(npc.world.book.balance(account ?? -1)).toBe(300n);
    expect(npc.world.book.balanceOf(owner.id, asset)).toBe(before + 200n);
    await persistence.writer.durable();
    expect(
      await rows(test.db, "select balance from ledger_accounts where system_code = $1", [
        cityFundCode(owner.id, city, asset),
      ]),
    ).toEqual([{ balance: "300" }]);
  }, 180_000);
});
