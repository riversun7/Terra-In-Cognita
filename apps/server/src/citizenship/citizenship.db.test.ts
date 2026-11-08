// 국적 바꾸기(귀화) DB 통합 시험(질문 745 나, docs/adr/2026-11-08-citizenship.md) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 나라 A에서 강하(지원금 받음) → 나라 B 행정 건물 조건(그 도시에 없음) → 본체를 B 도시로 옮김 → 값이 틀리면 terms_changed → 귀화(귀화 값 → B 국고,
// 지원금 → A 국고, 나라·내 도시·가입·기록) → 쉬는 날에는 다시 못 바꿈 → 쉬는 날 뒤 A로 되돌아가면 지원금은 다시 돌려주지 않음 → 다시 켜도
// 쉬는 날·반환 합이 남음, 돈이 모자라면 insufficient_funds를 본다.
import { loadContentPack } from "@terra/content/node";
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { createContentEditState } from "../contentEdit/state.ts";
import { GOVERNMENT_FACILITY } from "../government/reads.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import type { Viewer } from "../trpc/context.ts";
import { ASSET_CREDIT, SYSTEM_ISSUE_CREDIT } from "../world/settlement.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";
import { citizenshipServiceOf } from "./attach.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const pack = createContentEditState(loaded.source).effective();
const FEE = BigInt(TEST_SOCIETY_COEFFICIENTS.cyborg.naturalizeFee);
const REST_MS = TEST_SOCIETY_COEFFICIENTS.cyborg.naturalizeRestMs;
const APPEARANCE = {
  head: "dome",
  face: "visor",
  body: "slim",
  limbs: "piston",
  primary: "mint",
  accent: "lemon",
} as const;

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
    testBots: 8,
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

async function fakeUser(name: string): Promise<string> {
  const found = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [name, `${name}@id.placeholder.invalid`, name.toLowerCase()],
  );
  return String(found[0]?.id);
}

/** 나라 index(첫 접속 목록 차례)의 첫 시작 도시에 사이보그를 만든다. extra = 더 줄 시험 화폐 */
async function cyborgIn(world: World, name: string, index: number, extra: bigint) {
  const p = persistenceOf(world);
  const userId = await fakeUser(name);
  const creation = p.cyborgs.creation(userId, clock);
  const faction = creation.factions[index];
  const city = faction?.cities[0];
  if (!faction || !city) throw new Error("no start city");
  await p.cyborgs.roll(userId, "balanced");
  const made = await p.cyborgs.create(userId, {
    name,
    appearance: APPEARANCE,
    factionId: faction.id,
    cityId: city.id,
    elements: { fire: 6, wind: 4 },
  });
  if (!made.ok) throw new Error(`cyborg ${made.code}`);
  const ownerId = p.settlement.ownerOfUser(userId, clock).id;
  if (extra > 0n)
    p.ledger.post({
      kind: "issue",
      atMs: clock,
      entries: [
        { account: p.ledger.systemAccount(SYSTEM_ISSUE_CREDIT, ASSET_CREDIT), amount: -extra },
        { account: p.ledger.ownerAccount(ownerId, ASSET_CREDIT), amount: extra },
      ],
    });
  await p.writer.durable();
  return { userId, ownerId, factionId: faction.id, cityId: city.id };
}

/** 그 나라(세력 행 ID)의 시작 도시 하나와 그 행정 건물 */
function hallOf(world: World, factionRow: number): { cityId: number; buildingId: number } {
  const p = persistenceOf(world);
  const npc = world.npc;
  if (!npc) throw new Error("npc runtime");
  for (const record of p.facilities.service.facilities.values()) {
    if (record.facilityId !== GOVERNMENT_FACILITY || record.cityId === null) continue;
    const city = npc.world.cities.get(record.cityId);
    if (city && p.owners.get(city.owner)?.factionId === factionRow)
      return { cityId: city.id, buildingId: record.buildingId };
  }
  throw new Error(`no government hall for faction ${factionRow}`);
}

/** 사이보그 본체를 그 도시 시청 칸 둘레로 옮긴다(다른 2차맵이면 넘긴다) */
function moveBodyTo(world: World, userId: string, cityId: number): void {
  const p = persistenceOf(world);
  const place = world.npc?.places.get(cityId);
  const unitId = p.cyborgs.record(userId)?.unitId;
  if (!place || unitId === undefined || unitId === null) throw new Error("place or body");
  const from = [...world.maps.values()].find((map) => map.unitInfo(unitId));
  const to = world.maps.get(place.mapKey);
  if (!from || !to) throw new Error("maps");
  if (from === to) {
    expect(to.relocateToSafety(unitId, { x: place.cellX + 4, y: place.cellY + 4 })).toBe(true);
    return;
  }
  const row = from.transferOut(unitId);
  if (!row) throw new Error("transfer out");
  for (let d = 4; d < 30; d++) if (to.transferIn(row, place.cellX + d, place.cellY + d)) return;
  throw new Error("transfer in");
}

const balanceOf = (world: World, ownerId: number): bigint =>
  persistenceOf(world).ledger.balanceOf(ownerId, ASSET_CREDIT);

const treasuryOf = (world: World, factionRow: number): number => {
  for (const owner of persistenceOf(world).owners.values())
    if (owner.factionId === factionRow) return owner.id;
  throw new Error("treasury");
};

describe.skipIf(!TEST_DATABASE_URL)("국적 바꾸기(귀화, 질문 745 나)", () => {
  it("조건 → 그 도시로 가서 귀화(값 → 새 나라, 지원금 → 옛 나라) → 쉬는 날 → 되돌아가면 지원금은 한 번만, 다시 켜도 남는다", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const service = citizenshipServiceOf(world, { now: () => clock })();
    if (!service) throw new Error("citizenship service");
    const me = await cyborgIn(world, "Wanderer", 0, 1_000n);
    const viewer: Viewer = { id: me.userId, loginId: "wanderer", roles: [] };
    const record = p.cyborgs.record(me.userId);
    const grant = record?.startGrant ?? 0n;
    expect(grant).toBeGreaterThan(0n);
    const others = p.cyborgs.creation(me.userId, clock).factions.filter((f) => f.id !== me.factionId);
    const target = others[0];
    if (!target) throw new Error("second nation");
    const hall = hallOf(world, target.id);
    const home = hallOf(world, me.factionId);

    // 내 나라 행정 건물 = 같은 나라, 남의 나라 = 그 도시에 없음
    const homeTerms = await service.terms(viewer, home.buildingId, clock);
    expect(homeTerms.terms?.blocked).toBe("same_nation");
    let terms = await service.terms(viewer, hall.buildingId, clock);
    expect(terms.status).toBe("ready");
    expect(terms.terms).toMatchObject({
      target: { id: target.id },
      current: { id: me.factionId },
      cityId: hall.cityId,
      fee: String(FEE),
      grantReturn: String(grant),
      total: String(FEE + grant),
      restMs: REST_MS,
      restUntilMs: null,
      blocked: "wrong_city",
    });
    const total = String(FEE + grant);
    expect(
      await service.change(me.userId, { buildingId: hall.buildingId, factionId: target.id, cost: total }),
    ).toEqual({
      ok: false,
      code: "wrong_city",
    });
    // 행정 건물이 아닌 건물
    const notHall = [...p.facilities.service.facilities.values()].find(
      (f) => f.facilityId !== GOVERNMENT_FACILITY,
    );
    if (notHall)
      expect(
        await service.change(me.userId, {
          buildingId: notHall.buildingId,
          factionId: target.id,
          cost: total,
        }),
      ).toEqual({
        ok: false,
        code: "not_government",
      });

    moveBodyTo(world, me.userId, hall.cityId);
    terms = await service.terms(viewer, hall.buildingId, clock);
    expect(terms.terms?.blocked).toBeNull();
    // 보지 않은 값·나라면 거절(보인 값으로만 낸다)
    expect(
      await service.change(me.userId, {
        buildingId: hall.buildingId,
        factionId: target.id,
        cost: String(FEE),
      }),
    ).toEqual({ ok: false, code: "terms_changed" });
    expect(
      await service.change(me.userId, { buildingId: hall.buildingId, factionId: me.factionId, cost: total }),
    ).toEqual({ ok: false, code: "terms_changed" });

    const before = {
      me: balanceOf(world, me.ownerId),
      newNation: balanceOf(world, treasuryOf(world, target.id)),
      oldNation: balanceOf(world, treasuryOf(world, me.factionId)),
    };
    const done = await service.change(me.userId, {
      buildingId: hall.buildingId,
      factionId: target.id,
      cost: total,
    });
    expect(done).toEqual({
      ok: true,
      factionId: target.id,
      cityId: hall.cityId,
      paid: String(FEE),
      returned: String(grant),
      nextAtMs: clock + REST_MS,
    });
    expect(balanceOf(world, me.ownerId)).toBe(before.me - FEE - grant);
    expect(balanceOf(world, treasuryOf(world, target.id))).toBe(before.newNation + FEE);
    expect(balanceOf(world, treasuryOf(world, me.factionId))).toBe(before.oldNation + grant);
    expect(p.cyborgs.record(me.userId)).toMatchObject({
      factionId: target.id,
      startCityId: hall.cityId,
      nationChangedAtMs: clock,
      grantReturned: grant,
      // 받은 지원금 기록은 그대로(새 나라가 다시 주지 않는다)
      startGrant: grant,
    });
    // 저장: 사이보그 행·세력 가입·기록 한 줄·원장 거래(같은 커밋)
    const saved = await rows<{ faction_id: string; start_city_id: string }>(
      test.db,
      `select faction_id, start_city_id from cyborgs where user_id = $1`,
      [me.userId],
    );
    expect(saved.map((row) => [Number(row.faction_id), Number(row.start_city_id)])).toEqual([
      [target.id, hall.cityId],
    ]);
    const member = await rows<{ faction_id: string }>(
      test.db,
      `select faction_id from faction_members where user_id = $1`,
      [me.userId],
    );
    expect(member.map((row) => Number(row.faction_id))).toEqual([target.id]);
    const log = await rows<{ from_faction: string; to_faction: string; fee: string; grant_returned: string }>(
      test.db,
      `select from_faction, to_faction, fee, grant_returned from nationality_changes where user_id = $1`,
      [me.userId],
    );
    expect(
      log.map((row) => [Number(row.from_faction), Number(row.to_faction), row.fee, row.grant_returned]),
    ).toEqual([[me.factionId, target.id, String(FEE), String(grant)]]);
    const tx = await rows<{ kind: string }>(
      test.db,
      `select kind from ledger_transactions where idempotency_key = $1`,
      [`nationality_change:${me.userId}:${clock}`],
    );
    expect(tx.map((row) => row.kind)).toEqual(["nationality_change"]);

    // 새 나라 행정 건물 = 같은 나라. 옛 나라로 되돌아가기는 쉬는 날 동안 막힌다
    expect((await service.terms(viewer, hall.buildingId, clock)).terms?.blocked).toBe("same_nation");
    moveBodyTo(world, me.userId, home.cityId);
    clock += 60_000;
    terms = await service.terms(viewer, home.buildingId, clock);
    expect(terms.terms).toMatchObject({
      blocked: "resting",
      restUntilMs: done.ok ? done.nextAtMs : 0,
      grantReturn: "0",
    });
    expect(
      await service.change(me.userId, {
        buildingId: home.buildingId,
        factionId: me.factionId,
        cost: String(FEE),
      }),
    ).toEqual({ ok: false, code: "resting" });

    // 다시 켜도 나라·쉬는 날·반환 합이 남는다(기록 표에서 읽는다)
    await p.writer.durable();
    await world.stop();
    worlds.splice(worlds.indexOf(world), 1);
    const again = await boot();
    const q = persistenceOf(again);
    expect(q.cyborgs.record(me.userId)).toMatchObject({
      factionId: target.id,
      startCityId: hall.cityId,
      nationChangedAtMs: clock - 60_000,
      grantReturned: grant,
    });
    expect(await again.checkInvariants()).toEqual([]);

    // 쉬는 날 뒤: 옛 나라로 되돌아간다 — 지원금은 이미 돌려줬으니 귀화 값만
    clock += REST_MS;
    const service2 = citizenshipServiceOf(again, { now: () => clock })();
    if (!service2) throw new Error("service again");
    const back = hallOf(again, me.factionId);
    moveBodyTo(again, me.userId, back.cityId);
    expect((await service2.terms(viewer, back.buildingId, clock)).terms).toMatchObject({
      blocked: null,
      grantReturn: "0",
      total: String(FEE),
    });
    expect(
      await service2.change(me.userId, {
        buildingId: back.buildingId,
        factionId: me.factionId,
        cost: String(FEE),
      }),
    ).toMatchObject({ ok: true, factionId: me.factionId, returned: "0" });
    expect(q.cyborgs.record(me.userId)?.grantReturned).toBe(grant);
  });

  it("돈이 모자라면 insufficient_funds(일부만 내지 않는다), 나라가 하나뿐이면 받을 나라가 없다", async () => {
    const world = await boot();
    const p = persistenceOf(world);
    const service = citizenshipServiceOf(world, { now: () => clock })();
    if (!service) throw new Error("citizenship service");
    // 지원금만 가진 사이보그: 지원금 반환 + 귀화 값을 낼 수 없다
    const poor = await cyborgIn(world, "Pauper", 0, 0n);
    const target = p.cyborgs.creation(poor.userId, clock).factions.find((f) => f.id !== poor.factionId);
    if (!target) throw new Error("second nation");
    const hall = hallOf(world, target.id);
    moveBodyTo(world, poor.userId, hall.cityId);
    const viewer: Viewer = { id: poor.userId, loginId: "pauper", roles: [] };
    const terms = await service.terms(viewer, hall.buildingId, clock);
    expect(terms.terms?.blocked).toBe("insufficient_funds");
    const total = terms.terms?.total ?? "0";
    const before = balanceOf(world, poor.ownerId);
    expect(
      await service.change(poor.userId, { buildingId: hall.buildingId, factionId: target.id, cost: total }),
    ).toEqual({
      ok: false,
      code: "insufficient_funds",
    });
    expect(balanceOf(world, poor.ownerId)).toBe(before);
    expect(p.cyborgs.record(poor.userId)?.factionId).toBe(poor.factionId);
  });
});
