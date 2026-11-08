// 공성 결과 셋 DB 통합 시험(docs/adr/2026-11-07-war-outcomes.md, 기획 D-520·D-527) — TEST_DATABASE_URL이 있을 때만. 값은 모두 시험용 가짜다.
// 서버 NPC 공격과 같은 규칙(attachSociety occupy)으로 약탈·점령 상태·점령·귀속을 넣고, war_outcomes 줄·다시 켤 때 남은 상태(약탈 = 정부가 무너진
// 도시, 하루 끝마다 꺼내 감, 재건되면 끝·까닭·다시 전쟁)·태어날 때 부모
// (기획 답 620 나)·세력 화면 점령 칸·복귀 요약 습격 칸을 본다.
import { DAY_MS, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readOccupationRows } from "../factionScreen/occupations.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { createWorldSummaryBackend } from "../world/summarySources.ts";
import { silentLog } from "../world/testSupport.ts";
import { type World, startWorld } from "../world/world.ts";

let test: TestDatabase;
const worlds: World[] = [];
/** 시작 도시는 국가마다 하나(마을 세우기 시험이 도시 하나에 휴먼을 모은다) */
const ONE_CITY = {
  ...TEST_SOCIETY_COEFFICIENTS,
  worldSeed: { ...TEST_SOCIETY_COEFFICIENTS.worldSeed, startCitiesMin: 1, startCitiesMax: 1 },
};
let clock = 0;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
  clock = 1_800_000_000_000 - (1_800_000_000_000 % DAY_MS) + DAY_MS / 2;
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 30,
    paths: { kind: "inline" },
    now: () => clock,
    log: silentLog,
    pool: test.db.$client,
    writeIntervalMs: 10,
    onFatal: (error) => {
      throw error;
    },
    npc: { testNations: 3, manual: true },
    cyborgRules: () => ONE_CITY,
  });
  worlds.push(world);
  await world.ready;
  return world;
}

async function restart(world: World): Promise<World> {
  await world.stop();
  worlds.splice(worlds.indexOf(world), 1);
  return boot();
}

/** 붐비는 나라에서 마을(새 세력)을 세우고 그 마을과 치는 세력 둘을 고른다(시작 도시는 결과를 받지 않는다) */
async function townAndAttackers(world: World) {
  const npc = world.npc;
  if (!npc || !world.persistence) throw new Error("npc runtime");
  const parent = [...npc.world.factions.values()]
    .filter((f) => f.units.size >= 8)
    .toSorted((a, b) => b.units.size - a.units.size)[0];
  if (!parent) throw new Error("no crowded nation");
  for (const id of parent.cities) {
    const city = npc.world.cities.get(id);
    if (city) city.housing = 4;
  }
  parent.traits = { aggression: 100, commerce: 500, faith: 500, station: 500 };
  npc.society.found(parent, clock);
  await npc.tick(true);
  await world.persistence.writer.durable();
  const house = [...npc.world.factions.values()].find((f) => f.overlord === parent.id);
  const townId = house ? [...house.cities][0] : undefined;
  const others = [...npc.world.factions.values()].filter(
    (f) => f.alive && f.cities.size > 0 && f.id !== house?.id && f.id !== parent.id,
  );
  const [first, second] = others;
  if (!house || townId === undefined || !first || !second) throw new Error("town and attackers");
  return { npc, persistence: world.persistence, parent, house, townId, first, second };
}

const factionRowOf = async (ownerId: number): Promise<number> =>
  Number(
    (
      await rows<{ faction_id: string }>(test.db, "select faction_id from world_owners where id = $1", [
        ownerId,
      ])
    )[0]?.faction_id,
  );

describe.skipIf(!TEST_DATABASE_URL)("공성 결과 셋(D-520·D-527)", () => {
  it("점령 상태 → 다시 켜도 남음 → 다른 세력의 점령·귀속이 덮음 → 약탈은 재건까지 남음. 소유는 점령·귀속에서만 바뀐다", async () => {
    let world = await boot();
    let { npc, persistence, house, townId, first, second } = await townAndAttackers(world);
    const [houseRow, firstRow, secondRow] = [
      await factionRowOf(house.id),
      await factionRowOf(first.id),
      await factionRowOf(second.id),
    ];
    // ① 점령 상태: 소유는 마을 그대로
    npc.society.occupy(first, house, townId, { treatment: "occupy", shares: "keep" }, clock);
    await npc.tick(true);
    await persistence.writer.durable();
    const occupied = await rows<{
      outcome: string;
      ended_at_ms: string | null;
      until_ms: string;
      faction_id: string;
    }>(
      test.db,
      `select w.outcome, w.ended_at_ms, w.until_ms, c.faction_id from war_outcomes w join world_cities c on c.id = w.city_id`,
    );
    expect(occupied).toEqual([
      {
        outcome: "occupy",
        ended_at_ms: null,
        until_ms: String(clock + TEST_SOCIETY_COEFFICIENTS.war.occupyDays * DAY_MS),
        faction_id: String(houseRow),
      },
    ]);
    // 다시 켜면 남은 상태가 거울 세계로 돌아온다
    world = await restart(world);
    npc = world.npc ?? npc;
    persistence = world.persistence ?? persistence;
    expect(npc.world.occupations.get(townId)).toMatchObject({
      kind: "occupied",
      occupier: first.id,
      owner: house.id,
    });
    // ② 다른 세력이 점령·귀속: 옛 점령 상태 줄은 끝, 새 줄(지분 유지·재건 비용), 도시 주인이 바뀐다
    const reHouse = npc.world.factions.get(house.id);
    const reSecond = npc.world.factions.get(second.id);
    if (!reHouse || !reSecond) throw new Error("reloaded factions");
    clock += 60_000;
    npc.society.occupy(reSecond, reHouse, townId, { treatment: "integrate", shares: "keep" }, clock);
    await npc.tick(true);
    await persistence.writer.durable();
    const after = await rows<{
      outcome: string;
      attacker: string;
      share_choice: string | null;
      ended: boolean;
    }>(
      test.db,
      `select outcome, attacker_faction_id as attacker, share_choice, ended_at_ms is not null as ended
       from war_outcomes order by id`,
    );
    expect(after).toEqual([
      { outcome: "occupy", attacker: String(firstRow), share_choice: null, ended: true },
      { outcome: "integrate", attacker: String(secondRow), share_choice: "keep", ended: false },
    ]);
    const owner = await rows<{ faction_id: string }>(
      test.db,
      "select faction_id from world_cities where id = $1",
      [townId],
    );
    expect(owner[0]?.faction_id).toBe(String(secondRow));
    // ③ 약탈(D-527): 정부가 무너진 남은 상태(끝나지 않음), 소유 그대로. 꺼내 가기는 하루 끝마다
    const victim = npc.world.factions.get(second.id);
    const raider = npc.world.factions.get(first.id);
    if (!victim || !raider) throw new Error("factions");
    clock += 60_000;
    npc.society.occupy(raider, victim, townId, { treatment: "loot", shares: "keep" }, clock);
    await npc.tick(true);
    await persistence.writer.durable();
    const lootRow = async () =>
      (
        await rows<{
          ended_at_ms: string | null;
          until_ms: string;
          taken: string;
          end_reason: string | null;
        }>(
          test.db,
          `select ended_at_ms, until_ms, taken::text as taken, end_reason from war_outcomes where outcome = 'loot'`,
        )
      )[0];
    const untilMs = clock + TEST_SOCIETY_COEFFICIENTS.war.govRebuildDays * DAY_MS;
    expect(await lootRow()).toEqual({
      ended_at_ms: null,
      until_ms: String(untilMs),
      taken: "0",
      end_reason: null,
    });
    const still = await rows<{ faction_id: string }>(
      test.db,
      "select faction_id from world_cities where id = $1",
      [townId],
    );
    expect(still[0]?.faction_id).toBe(String(secondRow));
    // 하루 끝: 약탈 세력이 그 도시 금고 몫을 꺼내 간다(가져간 값이 쌓인다). 결과 셋이 거듭 깎은 만족도로 반란이 나지 않게 그 도시 휴먼 만족도를 채운다
    const calm = (): void => {
      for (const unit of npc.world.units.values()) if (unit.city === townId) unit.satisfactionMilli = 100_000;
    };
    calm();
    npc.society.endOfDay(clock + DAY_MS / 2);
    await npc.tick(true);
    await persistence.writer.durable();
    const afterDay = await lootRow();
    expect(afterDay?.ended_at_ms).toBeNull();
    expect(BigInt(afterDay?.taken ?? "0")).toBeGreaterThan(0n);
    // 세력 화면 점령 칸: 친 쪽(첫 세력)은 약탈·점령 상태 두 줄(as_occupier), 당한 쪽(둘째)은 약탈을 as_target으로
    const firstView = await readOccupationRows(test.db.$client, firstRow);
    expect(firstView.map((row) => [row.side, row.lootChoice])).toEqual([
      ["as_occupier", "loot"],
      ["as_occupier", "occupy"],
    ]);
    expect(firstView[1]?.outcome?.endReason).toBe("replaced");
    const secondView = await readOccupationRows(test.db.$client, secondRow);
    expect(secondView.map((row) => [row.side, row.lootChoice])).toEqual([
      ["as_target", "loot"],
      ["as_occupier", "integrate"],
    ]);
    expect(secondView[0]?.outcome).toMatchObject({ endedAt: null, endReason: null, untilAt: untilMs });
    expect(await world.checkInvariants()).toEqual([]);
    // 다시 켜면 약탈 상태가 거울로 돌아온다(가져간 값 그대로)
    world = await restart(world);
    npc = world.npc ?? npc;
    persistence = world.persistence ?? persistence;
    expect(npc.world.occupations.get(townId)).toMatchObject({
      kind: "looted",
      occupier: first.id,
      owner: second.id,
      untilMs,
      taken: BigInt(afterDay?.taken ?? "0"),
    });
    // 재건할 날이 지난 하루 끝: 옛 세력이 재건 비용을 내고 정부를 다시 세운다 → 끝(까닭 rebuilt)·다시 전쟁
    clock = untilMs;
    calm();
    npc.society.endOfDay(untilMs);
    await npc.tick(true);
    await persistence.writer.durable();
    const rebuilt = await lootRow();
    expect(rebuilt?.end_reason).toBe("rebuilt");
    expect(rebuilt?.ended_at_ms).not.toBeNull();
    expect(npc.world.occupations.has(townId)).toBe(false);
    expect(npc.world.factions.get(second.id)?.wars.has(first.id)).toBe(true);
    const ended = await readOccupationRows(test.db.$client, secondRow);
    expect(ended[0]?.outcome?.endReason).toBe("rebuilt");
  });

  it("태어날 때 부모(620 나): 마을 세력 행에 born_of, 다시 켜도 거울 세력이 안다", async () => {
    let world = await boot();
    const { house, parent } = await townAndAttackers(world);
    const born = await rows<{ born_of: string | null }>(
      test.db,
      `select f.born_of from factions f join world_owners o on o.faction_id = f.id where o.id = $1`,
      [house.id],
    );
    expect(born[0]?.born_of).toBe(String(await factionRowOf(parent.id)));
    world = await restart(world);
    expect(world.npc?.world.factions.get(house.id)?.bornOf).toBe(parent.id);
  });

  it("복귀 요약 습격·방어 칸: 마지막 확인 뒤 내 세력의 공성 결과 수", async () => {
    const world = await boot();
    const { npc, persistence, house, townId, first } = await townAndAttackers(world);
    const user = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ('WarUser', 'waruser@id.placeholder.invalid', 'waruser') returning id`,
    );
    const userId = String(user[0]?.id);
    await test.db.$client.query(`insert into faction_members (user_id, faction_id) values ($1, $2)`, [
      userId,
      await factionRowOf(first.id),
    ]);
    const since = clock;
    clock += 60_000;
    npc.society.occupy(first, house, townId, { treatment: "loot", shares: "keep" }, clock);
    await npc.tick(true);
    await persistence.writer.durable();
    const raid = createWorldSummaryBackend(world).sources.find((source) => source.kind === "raid");
    const section = await raid?.collect({ userId, roles: [] }, since, clock);
    expect(section).toMatchObject({
      kind: "raid",
      count: 1,
      params: { won: 1, lost: 0, loot: 1 },
      target: { route: "faction" },
    });
  });
});
