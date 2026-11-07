// 폐허 복원 DB 통합 시험(D-510·D-339·D-343·D-344, docs/adr/2026-11-07-ruins-restoration.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 개발 시험 폐허 → 행정 건물 짓기 = 주인(먼저 지은 쪽, 다른 자리·두 번째는 막힘) → 모금 전엔 주인만 → 모금 열기 → 누구나 넣기 → 목표를 채우면
// 같은 ID로 도시가 돌아오고 지분 1000주 = 낸 값 비례(독재면 나라 과반) → 다시 켜도 그대로 → 되살아난 도시가 다시 무너지면 폐허 줄이 남는다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, holdingsOf } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { type World, startWorld } from "../world/world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();

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

async function boot(): Promise<World> {
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
    npc: { testNations: 2, manual: true },
    holdings: { content: () => pack },
    facilities: { content: () => pack },
  });
  worlds.push(world);
  await world.ready;
  return world;
}

function persistenceOf(world: World) {
  const found = world.persistence;
  if (!found) throw new Error("persistence");
  return found;
}

/** 사이보그(첫 나라·첫 도시)를 만들고 시험 화폐를 준다 */
async function citizen(world: World, name: string) {
  const persistence = persistenceOf(world);
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  const userId = String(found[0]?.id);
  const creation = persistence.cyborgs.creation(userId, clock);
  const faction = creation.factions[0];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await persistence.cyborgs.roll(userId, "balanced");
  const made = await persistence.cyborgs.create(userId, {
    name,
    appearance: {
      head: "dome",
      face: "visor",
      body: "slim",
      limbs: "piston",
      primary: "mint",
      accent: "lemon",
    },
    factionId: faction.id,
    cityId: city.id,
    elements: { fire: 6, wind: 4 },
  });
  if (!made.ok) throw new Error(`cyborg ${made.code}`);
  const ownerId = persistence.settlement.ownerOfUser(userId, clock).id;
  const credit = 100_000n;
  persistence.ledger.post({
    kind: "issue",
    atMs: clock,
    entries: [
      { account: persistence.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -credit },
      { account: persistence.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: credit },
    ],
  });
  await persistence.writer.durable();
  return { userId, ownerId, factionRow: faction.id };
}

describe.skipIf(!TEST_DATABASE_URL)("폐허 복원(D-510)", () => {
  it("정부를 먼저 지은 쪽이 주인 → 모금 → 같은 ID로 도시가 돌아오고 지분은 낸 값 비례, 다시 켜도 그대로, 다시 무너지면 폐허 줄", async () => {
    const first = await boot();
    const npc = first.npc;
    const persistence = persistenceOf(first);
    if (!npc) throw new Error("npc runtime");
    const { ruins, facilities, ledger, writer } = persistence;
    const one = await citizen(first, "RuinOne");
    const two = await citizen(first, "RuinTwo");

    // 개발 시험 폐허(주인 없음)
    const made = await ruins.devMakeRuin(one.userId);
    if (!made.ok || made.ruinId === undefined) throw new Error(`dev ruin ${JSON.stringify(made)}`);
    const ruinId = made.ruinId;
    let row = await rows<{ claimant_owner_id: string | null; join_faction_id: string | null }>(
      test.db,
      `select claimant_owner_id, join_faction_id from world_ruins where id = $1`,
      [ruinId],
    );
    expect(row).toEqual([{ claimant_owner_id: null, join_faction_id: null }]);
    let view = ruins.overview({ id: one.userId, devGrant: true }, clock);
    const card = view?.ruins.find((r) => r.id === ruinId);
    expect(card?.owner).toBeNull();
    expect(view?.government?.facilityId).toBe("government_hall");
    const at = card?.buildAt;
    if (!card || !at || !view?.government) throw new Error("no build cell");

    // 재료(레벨 1, 옛 마을회관 × 영토 배율 3) → 행정 건물 짓기 = 주인
    const spot = { mapKey: card.mapKey, x: at.x, y: at.y };
    for (const stack of view.government.materials)
      expect(await facilities.service.devFacilityGrant(one.userId, stack.item, stack.qty, spot)).toEqual({
        ok: true,
      });
    const built = await facilities.service.build(one.userId, {
      ...spot,
      facility: "government_hall",
      rotation: 0,
    });
    expect(built).toMatchObject({ ok: true });
    // 두 번째(다른 사람·같은 폐허)는 막히고, 도시 자리(가장 가까운 것이 도시)는 폐허가 아니다
    for (const stack of view.government.materials)
      await facilities.service.devFacilityGrant(two.userId, stack.item, stack.qty, spot);
    const late = await facilities.service.build(two.userId, {
      ...spot,
      x: at.x + 4,
      facility: "government_hall",
      rotation: 0,
    });
    expect(late).toEqual({ ok: false, code: "ruin_claimed" });
    const start = npc.places.get(persistence.cyborgs.record(two.userId)?.startCityId ?? -1);
    if (!start) throw new Error("start place");
    expect(
      await facilities.service.build(two.userId, {
        mapKey: start.mapKey,
        x: start.cellX + 2,
        y: start.cellY + 2,
        facility: "government_hall",
        rotation: 0,
      }),
    ).toEqual({ ok: false, code: "not_ruin" });
    row = await rows(test.db, `select claimant_owner_id, join_faction_id from world_ruins where id = $1`, [
      ruinId,
    ]);
    expect(row).toEqual([
      { claimant_owner_id: String(one.ownerId), join_faction_id: String(one.factionRow) },
    ]);

    // 모금 전엔 주인만 → 주인 4,000 → 모금 열기 → 둘째가 9,000을 내면 남은 6,000만 받고 복원
    expect(await ruins.fund(two.userId, ruinId, "1000")).toEqual({ ok: false, code: "not_open" });
    expect(await ruins.open(two.userId, ruinId)).toEqual({ ok: false, code: "not_owner" });
    expect(await ruins.fund(one.userId, ruinId, "4000")).toMatchObject({
      ok: true,
      accepted: "4000",
      raised: "4000",
    });
    expect(await ruins.open(one.userId, ruinId)).toEqual({ ok: true, ruinId });
    view = ruins.overview({ id: two.userId, devGrant: false }, clock);
    expect(view?.ruins.find((r) => r.id === ruinId)?.project).toMatchObject({
      goal: "10000",
      raised: "4000",
      open: true,
      canFund: true,
      mine: "0",
    });
    const paid = await rows<{ owner_id: string; amount: string }>(
      test.db,
      `select owner_id, amount from restoration_contributions where ruin_id = $1`,
      [ruinId],
    );
    expect(paid).toEqual([{ owner_id: String(one.ownerId), amount: "4000" }]);
    const done = await ruins.fund(two.userId, ruinId, "9000");
    expect(done).toEqual({ ok: true, ruinId, accepted: "6000", raised: "0", restored: true });

    // 같은 ID로 도시가 돌아오고(유저의 나라), 폐허·낸 값 줄은 지워진다
    await writer.durable();
    const city = await rows<{ faction_id: string; start: boolean; admin_level: number }>(
      test.db,
      `select faction_id, start, admin_level from world_cities where id = $1`,
      [ruinId],
    );
    expect(city).toEqual([{ faction_id: String(one.factionRow), start: false, admin_level: 1 }]);
    expect(await rows(test.db, `select id from world_ruins`)).toEqual([]);
    expect(await rows(test.db, `select ruin_id from restoration_contributions`)).toEqual([]);
    const shares = holdingsOf(ledger, ruinId);
    expect(shares.reduce((sum, h) => sum + h.amount, 0n)).toBe(1000n);
    const nation = npc.world.cities.get(ruinId)?.owner ?? -1;
    if (npc.world.factions.get(nation)?.regime === "dictatorship")
      expect(shares.find((h) => h.owner === nation)?.amount).toBe(501n);
    else
      expect(shares).toEqual(
        [
          { owner: one.ownerId, amount: 400n },
          { owner: two.ownerId, amount: 600n },
        ].toSorted((a, b) => a.owner - b.owner),
      );
    expect(await first.checkInvariants()).toEqual([]);
    await first.stop();

    // 다시 켜도 도시 그대로, 폐허 없음 → 되살아난 도시(시작 도시 아님)가 다시 무너지면 폐허 줄이 남고 도시 줄은 지워진다
    clock += 60_000;
    const second = await boot();
    const npc2 = second.npc;
    if (!npc2) throw new Error("npc runtime");
    expect(npc2.world.cities.get(ruinId)?.owner).toBe(nation);
    expect(npc2.world.ruins.size).toBe(0);
    npc2.society.ruin(ruinId, clock);
    await npc2.tick(true);
    await persistenceOf(second).writer.durable();
    expect(await rows(test.db, `select id from world_cities where id = $1`, [ruinId])).toEqual([]);
    const again = await rows<{ id: string; claimant_owner_id: string | null }>(
      test.db,
      `select id, claimant_owner_id from world_ruins`,
    );
    expect(again).toEqual([{ id: String(ruinId), claimant_owner_id: null }]);
    await second.stop();
    const third = await boot();
    expect(third.npc?.world.ruins.get(ruinId)?.claimant).toBeNull();
    expect(third.npc?.places.has(ruinId)).toBe(true);
    expect(await third.checkInvariants()).toEqual([]);
  }, 120_000);
});
