// 가문 연맹 저장·명령 시험 — npc-invest-2(질문 2502·2503), leagueService.ts·npcLeague.ts. NPC 판단은 DB 없이, 명령은 TEST_DATABASE_URL이 있을 때만.
// 계정은 시험용 가짜 값이다.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { createHouseLeagueService, leagueHouseKey, leagueHouseNum } from "./leagueService.ts";
import { loadLeagues } from "./leagueStore.ts";
import { npcLeagueChoice } from "./npcLeague.ts";

const traits = (openness: number, communalism: number, autonomy: number, boldness: number) => ({
  openness,
  communalism,
  autonomy,
  boldness,
});
const RULES = { foundScore: 750, joinScore: 550 };

describe("NPC 가문 연맹 판단(npcLeague.ts)", () => {
  it("만들기 점수가 문턱을 넘으면 만들고, 연맹이 있으면 들기 점수로 가장 큰 연맹에 든다", () => {
    expect(npcLeagueChoice(traits(900, 100, 900, 900), [], RULES)).toEqual({ kind: "found" });
    expect(npcLeagueChoice(traits(600, 600, 100, 100), [], RULES)).toBeUndefined();
    expect(
      npcLeagueChoice(
        traits(600, 600, 100, 100),
        [
          { id: 4, members: 2 },
          { id: 2, members: 2 },
          { id: 9, members: 1 },
        ],
        RULES,
      ),
    ).toEqual({ kind: "join", leagueId: 2 });
    // 둘 다 넘으면 점수가 높은 쪽(같으면 들기)
    expect(npcLeagueChoice(traits(1000, 1000, 800, 800), [{ id: 1, members: 1 }], RULES)).toEqual({
      kind: "join",
      leagueId: 1,
    });
  });

  it("가문 열쇠 ↔ 수", () => {
    expect(leagueHouseNum("p:12")).toBe(12);
    expect(leagueHouseNum("n:5")).toBe(-5);
    expect(leagueHouseKey(-5)).toBe("n:5");
    expect(leagueHouseKey(12)).toBe("p:12");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("가문 연맹 명령 (DB)", () => {
  let test: TestDatabase;
  let serial = 0;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);

  beforeAll(async () => {
    test = await createTestDatabase();
  });
  afterAll(async () => {
    await test.drop();
  });

  /** 플레이어 가문 하나와 그 가문장(사용자 ID) */
  const house = async (): Promise<{ user: string; id: number }> => {
    serial += 1;
    const login = `fake_lg${serial}`;
    const user =
      (
        await rows<{ id: string }>(
          test.db,
          "insert into users (name, email, username) values ($1, $2, $3) returning id",
          [login, `${login}@league.placeholder.invalid`, login],
        )
      )[0]?.id ?? "";
    const id = Number(
      (await rows<{ id: string }>(test.db, "insert into factions (kind) values ('player') returning id"))[0]
        ?.id,
    );
    await sql(
      "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0)",
      [user, id],
    );
    return { user, id };
  };

  it("만들기·들기·위임·투표·나가기가 표에 남고, NPC 가문은 판단으로 만들고 든다", async () => {
    let clock = 1_000;
    const service = createHouseLeagueService({ pool: test.db.$client, now: () => ++clock });
    const a = await house();
    const b = await house();
    const c = await house();
    const made = await service.command(a.user, { action: "found" });
    expect(made.ok).toBe(true);
    const leagueId = made.ok ? (made.leagueId ?? 0) : 0;
    expect(await service.command(b.user, { action: "join", leagueId })).toEqual({ ok: true, leagueId });
    expect(await service.command(b.user, { action: "join", leagueId })).toEqual({
      ok: false,
      code: "already_member",
    });
    expect(await service.command(c.user, { action: "join", leagueId })).toEqual({ ok: true, leagueId });
    // 대표(a)는 위임 전에는 못 나간다
    expect(await service.command(a.user, { action: "leave", leagueId })).toEqual({
      ok: false,
      code: "representative_must_delegate",
    });
    // 투표: 셋 가운데 둘이 c를 찍으면 c가 대표
    expect(await service.command(b.user, { action: "vote", leagueId, house: `p:${c.id}` })).toEqual({
      ok: true,
      leagueId,
    });
    expect((await service.list())[0]?.representative).toBe(`p:${a.id}`);
    expect(await service.command(c.user, { action: "vote", leagueId, house: `p:${c.id}` })).toEqual({
      ok: true,
      leagueId,
    });
    expect((await service.list())[0]?.representative).toBe(`p:${c.id}`);
    // 위임: c → a, 그 뒤 c는 나갈 수 있다
    expect(await service.command(c.user, { action: "delegate", leagueId, house: `p:${a.id}` })).toEqual({
      ok: true,
      leagueId,
    });
    expect(await service.command(c.user, { action: "leave", leagueId })).toEqual({ ok: true, leagueId });
    // 가문장이 아니면 못 한다
    expect(await service.command("00000000-0000-4000-8000-000000000000", { action: "found" })).toEqual({
      ok: false,
      code: "not_house_head",
    });
    // NPC 가문: 7은 만들고(만들기 점수 900), 8은 그 연맹 가운데 가장 큰 곳에 든다
    expect(
      await service.npcSweep(
        [
          { houseId: 8, traits: traits(700, 700, 100, 100) },
          { houseId: 7, traits: traits(900, 100, 900, 900) },
        ],
        RULES,
      ),
    ).toBe(2);
    const stored = await loadLeagues(test.db.$client);
    expect(stored.leagues.map((league) => [league.representativeKey, league.members])).toEqual([
      [`p:${a.id}`, [`p:${a.id}`, `p:${b.id}`, "n:8"]],
      ["n:7", ["n:7"]],
    ]);
    // 다시 돌려도 이미 든 NPC 가문은 그대로
    expect(await service.npcSweep([{ houseId: 8, traits: traits(700, 700, 100, 100) }], RULES)).toBe(0);
  });
});
