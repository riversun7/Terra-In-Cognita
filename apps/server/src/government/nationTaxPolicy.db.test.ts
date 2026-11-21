// 나라 세금 정하기 — 세율 크게 바꾸기 안건(질문 2407 가, 줄기 governance-2) DB 통합 시험. TEST_DATABASE_URL이 있을 때만. 계정은 시험용 가짜 값이다.
// 민주주의·자본주의 독립 가문 나라에서 폭이 문턱 이상이면 바로 정하지 않고 안건을 연다(openAgenda), 폭 아래·독재는 지도자가 바로 정한다.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { createNationTaxPolicy, taxChangeRule, taxChangeWidthPm } from "./nationTaxPolicy.ts";

const ROW = { incomeTaxBp: 1000, residentTaxPm: 10, residentEveryDays: 7, residentNationPm: 100 };

describe("taxChangeRule(질문 2407 가)", () => {
  it("폭 = 칸마다 |뒤 − 앞| 가장 큰 값(소득세 bp ÷ 10, null = 0), 독재는 늘 지도자", () => {
    expect(taxChangeWidthPm(undefined, ROW)).toBe(100);
    expect(taxChangeWidthPm(ROW, { ...ROW, residentTaxPm: 40 })).toBe(30);
    expect(taxChangeRule("democracy", ROW, { ...ROW, residentTaxPm: 40 }, 50)).toBe("leader");
    expect(taxChangeRule("capitalism", ROW, { ...ROW, incomeTaxBp: 1500 }, 50)).toBe("vote");
    expect(taxChangeRule("dictatorship", ROW, { ...ROW, incomeTaxBp: 9000 }, 50)).toBe("leader");
    expect(taxChangeRule("democracy")).toBe("leader");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("나라 세금 정하기 — 세율 안건 (DB)", () => {
  let test: TestDatabase;
  const sql = (text: string, values: unknown[] = []) => test.db.$client.query(text, values);
  const opened: unknown[] = [];
  const policy = () =>
    createNationTaxPolicy({
      pool: test.db.$client,
      db: test.db,
      now: () => 1000,
      table: () => undefined,
      agendaWidthPm: () => 50,
      openAgenda: async (_userId, row) => {
        opened.push(row);
        return { ok: true, agendaId: 42 };
      },
    });
  let leader = "";
  let nation = 0;

  beforeAll(async () => {
    test = await createTestDatabase();
    leader =
      (
        await rows<{ id: string }>(
          test.db,
          "insert into users (name, email, username) values ('fake_ntx', 'fake_ntx@tax.placeholder.invalid', 'fake_ntx') returning id",
        )
      )[0]?.id ?? "";
    nation = Number(
      (
        await rows<{ id: string }>(
          test.db,
          "insert into factions (kind, regime) values ('player', 'democracy') returning id",
        )
      )[0]?.id,
    );
    await sql(
      "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0)",
      [leader, nation],
    );
    await sql(
      `insert into world_cities (id, faction_id, map_key, cell_x, cell_y, start, founded_at_ms) values (971, $1, 7, 3, 3, false, 0)`,
      [nation],
    );
  }, 240_000);

  afterAll(async () => {
    await test?.drop();
  });

  const saved = async () =>
    (
      await rows<{ bp: number | null }>(
        test.db,
        "select income_tax_bp as bp from nation_taxes where faction_id = $1",
        [nation],
      )
    )[0]?.bp ?? null;

  it("민주주의: 폭이 문턱 이상이면 안건을 열고 세금은 그대로, 아래면 바로 정한다", async () => {
    expect(await policy().set(leader, ROW)).toEqual({ ok: true, factionId: nation, agendaId: 42 });
    expect(opened).toEqual([ROW]);
    expect(await saved()).toBeNull();
    const small = { ...ROW, incomeTaxBp: 300, residentNationPm: 20 };
    expect(await policy().set(leader, small)).toEqual({ ok: true, factionId: nation });
    expect(Number(await saved())).toBe(300);
  });

  it("독재: 폭이 커도 지도자가 바로 정한다", async () => {
    await sql("update factions set regime = 'dictatorship' where id = $1", [nation]);
    expect(await policy().set(leader, { ...ROW, incomeTaxBp: 9000 })).toEqual({
      ok: true,
      factionId: nation,
    });
    expect(Number(await saved())).toBe(9000);
    expect(opened.length).toBe(1);
  });
});
