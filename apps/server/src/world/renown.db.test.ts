// 나라 명성·작위 DB 통합 시험(D-326·D-571 답 1961·1962) — TEST_DATABASE_URL이 있을 때만. 계정은 가짜 값이다.
// 명성을 쌓으면 user_nation_renown에 쓰이고(덮어쓰기), 다시 켜면 읽어 작위(지금 나라 명성 구간)가 이어진다. 방어 명성은 결과 적용과 같은 길.
import { DEFAULT_RENOWN_COEFFICIENTS } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { titleOfUser } from "./commandRanks.ts";
import { silentLog } from "./testSupport.ts";
import { type World, startWorld } from "./world.ts";

let test: TestDatabase;
const worlds: World[] = [];
const clock = 1_800_000_000_000;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  for (const world of worlds.splice(0)) await world.stop().catch(() => undefined);
  await test.drop();
});

async function boot(): Promise<World> {
  const world = startWorld({
    testBots: 4,
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

describe.skipIf(!TEST_DATABASE_URL)("나라 명성 → 작위(D-326·D-571)", () => {
  it("명성을 쌓으면 표에 쓰이고, 다시 켜도 지금 나라 작위가 이어진다(다른 나라 명성은 따로)", async () => {
    const first = await boot();
    const p = first.persistence;
    if (!p) throw new Error("persistence");
    const found = await rows<{ id: string }>(
      test.db,
      `insert into users (name, email, username) values ($1, $2, $3) returning id`,
      ["Renown", "renown@id.placeholder.invalid", "renown"],
    );
    const userId = String(found[0]?.id);
    const creation = p.cyborgs.creation(userId, clock);
    const faction = creation.factions[0];
    const other = creation.factions[1];
    const city = faction?.cities[0];
    if (!faction || !city) throw new Error("no start city");
    await p.cyborgs.roll(userId, "balanced");
    const made = await p.cyborgs.create(userId, {
      name: "Renown",
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
    expect(titleOfUser(p.cyborgs, DEFAULT_RENOWN_COEFFICIENTS, userId)).toBe(0);
    expect(p.cyborgs.addRenown(userId, faction.id, 600, clock)).toBe(600);
    expect(p.cyborgs.addRenown(userId, faction.id, 450, clock + 1)).toBe(1050);
    if (other) p.cyborgs.addRenown(userId, other.id, 9000, clock);
    // 공훈자 500·기사 1000 → 기사(3). 다른 나라 9000은 그 나라 작위다
    expect(titleOfUser(p.cyborgs, DEFAULT_RENOWN_COEFFICIENTS, userId)).toBe(3);
    // 사이보그가 없는 사용자는 쌓지 않는다
    expect(p.cyborgs.addRenown("00000000-0000-0000-0000-000000000000", faction.id, 1, clock)).toBeUndefined();
    await first.stop();
    worlds.splice(0);

    const stored = await rows<{ faction_id: string; renown: string }>(
      test.db,
      `select faction_id, renown from user_nation_renown where user_id = $1 order by faction_id`,
      [userId],
    );
    expect(stored.find((row) => Number(row.faction_id) === faction.id)?.renown).toBe("1050");
    const second = await boot();
    const q = second.persistence;
    if (!q) throw new Error("persistence");
    expect(q.cyborgs.renownOf(userId, faction.id)).toBe(1050);
    expect(titleOfUser(q.cyborgs, DEFAULT_RENOWN_COEFFICIENTS, userId)).toBe(3);
  });
});
