// 폐허 복원 DB 통합 시험(D-510·D-339·D-343·D-344, docs/adr/2026-11-07-ruins-restoration.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 개발 시험 폐허 → 행정 건물 짓기 = 주인(먼저 지은 쪽, 다른 자리·두 번째는 막힘) → 모금 전엔 주인만 → 모금 열기 → 누구나 넣기 → 목표를 채우면
// 같은 ID로 도시가 돌아오고 지분 1000주 = 낸 값 비례(독재면 나라 과반) → 다시 켜도 그대로 → 되살아난 도시가 다시 무너지면 폐허 줄이 남는다.
// 폐허 2(기획 답 480 다·482 나·485 다·487 다·489 다, 535): 정부 건물을 다 지어야 모금(짓는 중 not_built), 목표 = 옛 주거 × 주거 1당 값, 기한,
// 정부 건물이 0%가 되면 다시 지은 쪽이 주인(낸 값은 사업에 남음), 되살아난 도시 행정 레벨 = 그 건물 레벨(올리면 따라 오름), 폐허가 된 도시 창고의
// 유저 물건은 소각하지 않고 그 유저 나라의 가장 가까운 도시 창고로, NPC 세력 물건도 같은 규칙(540 나).
import { loadContentPack } from "@terra/content/node";
import { buildCostAt } from "@terra/shared/facilityBuild";
import { DAY_MS, holdingsOf } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { economyCatalogFromPack } from "../economyView/catalog.ts";
import { serverEconomyCatalogAccessor } from "../market/catalog.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { silentLog } from "../world/testSupport.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { type World, startWorld } from "../world/world.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source || !loaded.pack) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
// 도시 경제(폐허가 된 도시 창고 물건 옮기기 535는 경제 고리로 돈다)
const economy = serverEconomyCatalogAccessor(
  economyCatalogFromPack(loaded.pack, { version: "core@test", placeholder: true }),
  () => pack,
);

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
    economy,
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
  // 첫 접속은 국가 미소속으로 시작한다(ADR 2026-11-24-house-membership-separation.md). 이 시험은 그 나라 시민에서
  // 출발하므로, 가문이 그 나라 도시에 가입했을 때와 같은 맞춤(alignHome)으로 국적을 준다
  persistence.cyborgs.alignHome(userId, { factionId: faction.id, cityId: city.id });
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
  it("정부를 먼저 지은 쪽이 주인 → 다 지어야 모금 → 0%면 다시 지은 쪽이 주인 → 같은 ID로 도시(행정 레벨 = 건물 레벨), 다시 무너지면 폐허 줄·창고 물건 옮김", async () => {
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
    // 이름 있던 도시가 무너진 것처럼(552 다: 폐허는 무너지기 전 이름을 지니고, 복원되면 그 도시가 되찾는다)
    const madePlace = npc.places.get(ruinId);
    if (!madePlace) throw new Error("ruin place");
    expect(madePlace.name).toBeUndefined();
    npc.places.set(ruinId, { ...madePlace, name: "Testburg" });
    let row = await rows<{ claimant_owner_id: string | null; join_faction_id: string | null }>(
      test.db,
      `select claimant_owner_id, join_faction_id from world_ruins where id = $1`,
      [ruinId],
    );
    expect(row).toEqual([{ claimant_owner_id: null, join_faction_id: null }]);
    let view = ruins.overview({ id: one.userId, devGrant: true }, clock);
    const card = view?.ruins.find((r) => r.id === ruinId);
    expect(card?.name).toBe("Testburg");
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
    const hallOne = built.ok ? (built.buildingId ?? -1) : -1;
    // 행정 건물은 그 폐허(되살아날 도시)의 시설이다(489 다)
    expect(facilities.service.facilities.get(hallOne)?.cityId).toBe(ruinId);
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

    // 모금 화폐 = 들어갈 나라의 화폐(거래소 나라 화폐 534 가 뒤, 시뮬 treasuryAsset). 유저는 환전으로 마련한다 — 시험은 그 화폐를 바로 준다
    const fundAsset = npc.world.ruins.get(ruinId)?.currency ?? ASSET_CREDIT;
    if (fundAsset !== ASSET_CREDIT) {
      const grant = 100_000n;
      for (const ownerId of [one.ownerId, two.ownerId])
        ledger.post({
          kind: "issue",
          atMs: clock,
          entries: [
            { account: ledger.systemAccount(`issue:${fundAsset}`, fundAsset), amount: -grant },
            { account: ledger.ownerAccount(ownerId, fundAsset), amount: grant },
          ],
        });
      await writer.durable();
    }

    // 짓는 동안은 모금을 열지도 넣지도 못한다(480 다) → 다 지음
    expect(await ruins.fund(one.userId, ruinId, "1000")).toEqual({ ok: false, code: "not_built" });
    expect(await ruins.open(one.userId, ruinId)).toEqual({ ok: false, code: "not_built" });
    view = ruins.overview({ id: one.userId, devGrant: true }, clock);
    expect(view?.ruins.find((r) => r.id === ruinId)?.owner?.hall).toEqual({
      state: "building",
      level: 0,
      buildingId: hallOne,
    });
    expect(await facilities.service.devFinish(one.userId, { buildingId: hallOne })).toEqual({ ok: true });

    // 목표 = 옛 주거 8 × 주거 1당 값 700 = 5,600(482 나), 기한 = 주인이 된 때 + 30일(485 다)
    // 모금 전엔 주인만 → 주인 2,240 → 모금 열기
    expect(await ruins.fund(two.userId, ruinId, "1000")).toEqual({ ok: false, code: "not_open" });
    expect(await ruins.open(two.userId, ruinId)).toEqual({ ok: false, code: "not_owner" });
    expect(await ruins.fund(one.userId, ruinId, "2240")).toMatchObject({
      ok: true,
      accepted: "2240",
      raised: "2240",
    });
    expect(await ruins.open(one.userId, ruinId)).toEqual({ ok: true, ruinId });
    view = ruins.overview({ id: two.userId, devGrant: false }, clock);
    expect(view?.ruins.find((r) => r.id === ruinId)?.project).toMatchObject({
      goal: "5600",
      raised: "2240",
      open: true,
      canFund: true,
      ready: true,
      deadlineAtMs: clock + 30 * DAY_MS,
      mine: "0",
    });
    const paid = await rows<{ owner_id: string; amount: string }>(
      test.db,
      `select owner_id, amount from restoration_contributions where ruin_id = $1`,
      [ruinId],
    );
    expect(paid).toEqual([{ owner_id: String(one.ownerId), amount: "2240" }]);

    // 정부 건물이 0%가 되면 넣기가 막히고, 다시 지은 쪽(둘째)이 주인이 된다 — 낸 값은 사업에 남는다(487 다)
    expect(facilities.service.damage(hallOne, 0, true, clock)).toBe(true);
    expect(await ruins.fund(two.userId, ruinId, "1000")).toEqual({ ok: false, code: "not_built" });
    view = ruins.overview({ id: two.userId, devGrant: false }, clock);
    const downCard = view?.ruins.find((r) => r.id === ruinId);
    expect(downCard?.owner?.hall?.state).toBe("down");
    const rebuildAt = downCard?.buildAt;
    if (!rebuildAt) throw new Error("no rebuild cell");
    const rebuilt = await facilities.service.build(two.userId, {
      mapKey: card.mapKey,
      x: rebuildAt.x,
      y: rebuildAt.y,
      facility: "government_hall",
      rotation: 0,
    });
    expect(rebuilt).toMatchObject({ ok: true });
    const hallTwo = rebuilt.ok ? (rebuilt.buildingId ?? -1) : -1;
    expect(await facilities.service.devFinish(two.userId, { buildingId: hallTwo })).toEqual({ ok: true });
    row = await rows(test.db, `select claimant_owner_id, join_faction_id from world_ruins where id = $1`, [
      ruinId,
    ]);
    expect(row).toEqual([
      { claimant_owner_id: String(two.ownerId), join_faction_id: String(two.factionRow) },
    ]);
    expect(npc.world.ruins.get(ruinId)?.contributions.get(one.ownerId)).toBe(2240n);

    // 둘째가 9,000을 내면 남은 3,360만 받고 복원
    const done = await ruins.fund(two.userId, ruinId, "9000");
    expect(done).toEqual({ ok: true, ruinId, accepted: "3360", raised: "0", restored: true });

    // 같은 ID로 도시가 돌아오고(유저의 나라), 폐허·낸 값 줄은 지워진다
    await writer.durable();
    const city = await rows<{ faction_id: string; start: boolean; admin_level: number; name: string | null }>(
      test.db,
      `select faction_id, start, admin_level, name from world_cities where id = $1`,
      [ruinId],
    );
    expect(city).toEqual([
      { faction_id: String(two.factionRow), start: false, admin_level: 1, name: "Testburg" },
    ]);
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

    // 행정 레벨 = 그 도시 안 행정 건물 레벨(489 다): 둘째의 행정 건물을 Lv2로 올리면 도시도 Lv2
    const hallDef = facilities.catalog().facility("government_hall");
    if (!hallDef?.build) throw new Error("government_hall");
    expect(hallDef.maxLevel).toBe(3);
    for (const stack of buildCostAt(hallDef.build, 2))
      await facilities.service.devFacilityGrant(two.userId, stack.item, stack.qty, spot);
    expect(await facilities.service.upgrade(two.userId, hallTwo, [])).toMatchObject({ ok: true });
    expect(await facilities.service.devFinish(two.userId, { buildingId: hallTwo })).toEqual({ ok: true });
    await npc.tick(true);
    await writer.durable();
    expect(npc.world.cities.get(ruinId)?.adminLevel).toBe(2);
    expect(await rows(test.db, `select admin_level from world_cities where id = $1`, [ruinId])).toEqual([
      { admin_level: 2 },
    ]);
    await first.stop();

    // 다시 켜도 도시 그대로, 폐허 없음 → 되살아난 도시(시작 도시 아님)가 다시 무너지면 폐허 줄이 남고 도시 줄은 지워진다
    clock += 60_000;
    const second = await boot();
    const npc2 = second.npc;
    if (!npc2) throw new Error("npc runtime");
    expect(npc2.world.cities.get(ruinId)?.owner).toBe(nation);
    expect(npc2.world.ruins.size).toBe(0);
    // 폐허가 될 도시 창고에 첫째의 물건 7, 나라(NPC 세력)의 물건 5(535·540 나: 둘 다 소각하지 않고 그 주인 나라의 가장 가까운 다른 도시
    // 창고로 — NPC·유저 같은 규칙)
    const ledger2 = persistenceOf(second).ledger;
    const asset = "item:plank";
    const homes = [...(npc2.world.factions.get(nation)?.cities ?? [])].filter((id) => id !== ruinId);
    const heldAt = (owner = one.ownerId) =>
      homes.reduce((sum, id) => sum + ledger2.balanceOf(owner, asset, id), 0n);
    const before = heldAt();
    const beforeNation = heldAt(nation);
    ledger2.post({
      kind: "endow",
      atMs: clock,
      entries: [
        { account: ledger2.systemAccount(`source:${asset}`, asset), amount: -12n },
        { account: ledger2.ownerAccount(one.ownerId, asset, ruinId), amount: 7n },
        { account: ledger2.ownerAccount(nation, asset, ruinId), amount: 5n },
      ],
    });
    npc2.society.ruin(ruinId, clock);
    await npc2.tick(true);
    await persistenceOf(second).writer.durable();
    expect(await rows(test.db, `select id from world_cities where id = $1`, [ruinId])).toEqual([]);
    expect(ledger2.balanceOf(one.ownerId, asset, ruinId)).toBe(0n);
    expect(heldAt()).toBe(before + 7n);
    expect(ledger2.balanceOf(nation, asset, ruinId)).toBe(0n);
    expect(heldAt(nation)).toBe(beforeNation + 5n);
    const again = await rows<{ id: string; claimant_owner_id: string | null; name: string | null }>(
      test.db,
      `select id, claimant_owner_id, name from world_ruins`,
    );
    // 옛 주인 나라(NPC)는 판단 후보 "폐허 복원"으로 바로 정부를 지을 수 있다(484 다). 폐허 줄은 되찾은 이름을 다시 지닌다(552 다)
    expect(again.map((r) => r.id)).toEqual([String(ruinId)]);
    expect(again[0]?.name).toBe("Testburg");
    expect([null, String(nation)]).toContain(again[0]?.claimant_owner_id ?? null);
    await second.stop();
    const third = await boot();
    expect([null, nation]).toContain(third.npc?.world.ruins.get(ruinId)?.claimant ?? null);
    expect(third.npc?.places.has(ruinId)).toBe(true);
    expect(await third.checkInvariants()).toEqual([]);
  }, 120_000);
});
