// 이름 없는 1인 가문의 이름 붙이기 길(질문 2242 — 기술 기본값) DB 시험. TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// - 서버가 만든 1인 가문은 자리표시 정체성("가문 #ID"·"H<36진수>", 이름 대기 없음)을 세력 정체성·플레이어 정체성에 함께 갖는다.
// - 정체성 초안의 약어가 겹쳐 이름 없는 가문이 되면 초안의 색·마크는 남기고 이름·약어만 자리표시로 바꾼다.
// - 이 판 앞에 만든 이름 없는 가문(세력 정체성 없음)은 nameUnnamedHouses가 한 번 붙인다(두 번째는 0).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { RENAME_FREE } from "../factionIdentity/house.ts";
import { foundPersonalHouse, nameUnnamedHouses } from "./claimHouse.ts";

const T0 = 1_800_000_000_000;
let test: TestDatabase;

beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  await test.drop();
});

async function user(name: string): Promise<string> {
  const made = await rows<{ id: string }>(
    test.db,
    `insert into users (name, email, username) values ($1, $2, $3) returning id`,
    [`Fake_${name}`, `fake-${name}@id.placeholder.invalid`, `fake_${name}`],
  );
  return made[0]?.id ?? "";
}

const short36 = (id: number): string => `H${id.toString(36).toUpperCase()}`;

describe.skipIf(!TEST_DATABASE_URL)("이름 없는 1인 가문의 이름 붙이기 길 (2242)", () => {
  it("만들 때 자리표시 정체성, 초안이 겹치면 색·마크를 남기고, 옛 이름 없는 가문은 한 번 붙인다", async () => {
    const pool = test.db.$client;
    const nation = await rows<{ id: string }>(
      test.db,
      "insert into factions (kind, code) values ('npc', 'claim_nation') returning id",
    );
    const nationId = Number(nation[0]?.id);

    // ① 정체성 없는 사람 → 자리표시 정체성(이름 대기 없음)
    const lone = await user("lone");
    const house = await foundPersonalHouse(pool, { userId: lone, nationId, homeCityId: null, nowMs: T0 });
    expect(house).not.toBeNull();
    const id = Number(house);
    expect(
      await rows(test.db, "select name, short_name, source from faction_profiles where faction_id = $1", [
        id,
      ]),
    ).toEqual([{ name: `가문 #${id}`, short_name: short36(id), source: "player" }]);
    expect(
      await rows(
        test.db,
        "select faction_id, name, name_changed_at_ms from faction_identities where user_id = $1",
        [lone],
      ),
    ).toEqual([{ faction_id: String(id), name: `가문 #${id}`, name_changed_at_ms: String(RENAME_FREE) }]);

    // ② 초안 약어가 다른 세력과 겹친다 → 이름 없는 가문 + 자리표시(초안 색은 남는다)
    await pool.query(
      `insert into faction_profiles (faction_id, name, short_name, color, source, updated_at_ms)
       values ($1, 'Other', 'TAKN', '#2e86c1', 'default', $2)`,
      [nationId, T0],
    );
    const draft = await user("draft");
    await pool.query(
      `insert into faction_identities (user_id, name, name_key, short_name, color, emblem_shape, emblem_division,
         emblem_charge, emblem_scheme, created_at_ms, updated_at_ms, name_changed_at_ms)
       values ($1, 'Draft House', 'drafthouse', 'TAKN', '#8a7a12', 'shield', 'plain', 'star', 1, $2, $2, $2)`,
      [draft, T0],
    );
    const second = Number(
      await foundPersonalHouse(pool, { userId: draft, nationId, homeCityId: null, nowMs: T0 }),
    );
    expect(
      await rows(
        test.db,
        "select faction_id, name, short_name, color from faction_identities where user_id = $1",
        [draft],
      ),
    ).toEqual([
      { faction_id: String(second), name: `가문 #${second}`, short_name: short36(second), color: "#8a7a12" },
    ]);
    expect(await rows(test.db, "select color from faction_profiles where faction_id = $1", [second])).toEqual(
      [{ color: "#8a7a12" }],
    );

    // ③ 이 판 앞에 만든 이름 없는 가문(세력 정체성 없음) → 한 번 붙인다
    const old = await user("old");
    const bare = await rows<{ id: string }>(
      test.db,
      "insert into factions (kind, born_of) values ('player', $1) returning id",
      [nationId],
    );
    const bareId = Number(bare[0]?.id);
    await pool.query(
      "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', $3)",
      [old, bareId, T0],
    );
    expect(await nameUnnamedHouses(pool, T0)).toBe(1);
    expect(await rows(test.db, "select name from faction_profiles where faction_id = $1", [bareId])).toEqual([
      { name: `가문 #${bareId}` },
    ]);
    expect(await nameUnnamedHouses(pool, T0)).toBe(0);
  });
});
