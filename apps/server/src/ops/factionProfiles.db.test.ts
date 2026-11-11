// 세력 정체성·화폐 표시 DB 시험 — TEST_DATABASE_URL이 있을 때만(docs/adr/2026-11-09-faction-profiles.md).
// 처음 정하기(고정 NPC 나라 = 팩 프리셋, 반란 세력 = 기본값·따르는 나라 화폐), 한 번 정한 값은 다시 정하지 않음, 약어·티커 고유,
// 관리자 수정(겹치면 거절·틀린 값 거절), 운영자 콘솔 세력·화폐 목록에 실린다.
import { legacyNationPresets } from "../world/testSupport.ts";
import { loadContentPack } from "@terra/content/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { nationPresetsOf } from "../npc/presets.ts";
import { TEST_DATABASE_URL, type TestDatabase, createTestDatabase, rows } from "../testDb.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { TEST_NPC_FACTION_CODE } from "../world/unitKinds.ts";
import {
  currencyOfFactions,
  currencyProfiles,
  ensureProfiles,
  factionProfiles,
  uniqueShort,
  uniqueTicker,
  updateCurrencyProfile,
  updateFactionProfile,
} from "./factionProfiles.ts";
import { createOpsServices } from "./services.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.pack) throw new Error("content pack");
// 옛 규칙(등급 없음, 성격 칸 도시 수 4·3·2)을 보는 시험이다 — 국력 등급 씨앗은 world/nationTiers.db.test.ts
const presets = legacyNationPresets(nationPresetsOf(loaded.pack));
const NOW = 1_800_000_000_000;

let test: TestDatabase;
beforeEach(async () => {
  if (!TEST_DATABASE_URL) return;
  test = await createTestDatabase();
});
afterEach(async () => {
  if (!TEST_DATABASE_URL) return;
  await test.drop();
});

describe("겹치지 않는 기본값", () => {
  it("티커: 코드 글자 → 같은 첫 글자 차례, 약어: F + ID 36진수", () => {
    expect(uniqueTicker("placeholder_cur_01", new Set())).toBe("PLA");
    expect(uniqueTicker("placeholder_cur_01", new Set(["PLA"]))).toBe("PUR");
    expect(uniqueTicker("abc", new Set(["ABC", "ABC"]))).not.toBe("ABC");
    expect(uniqueShort(35, new Set())).toBe("FZ");
    expect(uniqueShort(35, new Set(["fz"]))).toBe("FZ0");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("세력 정체성(DB)", () => {
  it("처음 정하기·다시 정하지 않음·관리자 수정·콘솔 목록", async () => {
    const pool = test.db.$client;
    // 고정 NPC 나라(첫 프리셋 코드)와 시험 NPC 세력(16번째 프리셋), 그 반란 세력(코드 없음)
    const insert = async (code: string | null, extra = "") =>
      Number(
        (
          await rows<{ id: string }>(
            test.db,
            `insert into factions (kind, code, fixed${extra ? ", rebel_of" : ""}) values ('npc', $1, ${code === null ? "false" : "true"}${extra ? `, ${extra}` : ""}) returning id`,
            [code],
          )
        )[0]?.id,
      );
    const first = presets[0];
    if (!first?.currency) throw new Error("preset");
    const nation = await insert(first.code);
    const testNpc = await insert(TEST_NPC_FACTION_CODE);
    const rebel = await insert(null, String(nation));
    const deps = { pool, presets, baseAsset: ASSET_CREDIT, now: () => NOW };

    expect(await ensureProfiles(deps)).toEqual({ factions: 3, currencies: presets.length + 1 });
    const profiles = await factionProfiles(pool);
    expect(profiles.get(nation)).toMatchObject({
      name: first.name.ko,
      shortName: first.shortName,
      color: first.color,
      source: "preset",
    });
    expect(profiles.get(testNpc)?.name).toBe(presets[15]?.name.ko);
    expect(profiles.get(rebel)).toMatchObject({ name: `${first.name.ko} #${rebel}`, source: "default" });
    expect(profiles.get(rebel)?.shortName).toBe(`F${rebel.toString(36).toUpperCase()}`);

    // 반란 세력은 부모 나라 화폐, 화폐 표시는 프리셋 기호·티커
    const currencyOf = await currencyOfFactions(deps);
    const asset = `cur:${first.currency.code}`;
    expect(currencyOf.get(rebel)).toBe(asset);
    expect((await currencyProfiles(pool)).get(asset)).toMatchObject({
      symbol: first.currency.symbol,
      ticker: first.currency.ticker,
      source: "preset",
    });
    expect((await currencyProfiles(pool)).get(ASSET_CREDIT)?.ticker).toBe("CRD");

    // 다시 불러도 그대로(관리자가 고친 값도 다시 정하지 않는다)
    expect(
      await updateFactionProfile(pool, {
        factionId: rebel,
        name: "붉은 깃발",
        shortName: "RED",
        color: "#ff0000",
        actorId: "00000000-0000-4000-8000-000000000001",
        nowMs: NOW,
      }),
    ).toMatchObject({ ok: true });
    expect(await ensureProfiles(deps)).toEqual({ factions: 0, currencies: 0 });
    expect((await factionProfiles(pool)).get(rebel)).toMatchObject({ name: "붉은 깃발", source: "admin" });

    // 약어 겹침(대소문자 무시)·틀린 값·없는 세력은 거절
    const actor = { actorId: "00000000-0000-4000-8000-000000000001", nowMs: NOW };
    expect(
      await updateFactionProfile(pool, {
        factionId: nation,
        name: "X",
        shortName: "red",
        color: "#000000",
        ...actor,
      }),
    ).toEqual({ ok: false, code: "short_taken" });
    expect(
      await updateFactionProfile(pool, {
        factionId: nation,
        name: "X",
        shortName: "R E",
        color: "#000000",
        ...actor,
      }),
    ).toEqual({ ok: false, code: "invalid" });
    expect(
      await updateFactionProfile(pool, {
        factionId: 999_999,
        name: "X",
        shortName: "QQ",
        color: "#000000",
        ...actor,
      }),
    ).toEqual({ ok: false, code: "not_found" });

    // 화폐 티커 겹침은 거절, 고치면 바뀐다
    const second = presets[1]?.currency;
    if (!second?.ticker) throw new Error("preset 2");
    expect(
      await updateCurrencyProfile(pool, {
        asset,
        name: "붉은 화폐",
        symbol: "R$",
        ticker: second.ticker,
        ...actor,
      }),
    ).toEqual({ ok: false, code: "ticker_taken" });
    expect(
      await updateCurrencyProfile(pool, { asset, name: "붉은 화폐", symbol: "R$", ticker: "RED", ...actor }),
    ).toMatchObject({ ok: true });

    // 운영자 콘솔: 세력 목록에 정체성·화폐, 화폐 목록에 찍는 나라·쓰는 세력 수, 수정은 감사 기록
    const ops = createOpsServices(
      {
        pool,
        world: () => undefined,
        worldStatus: () => undefined,
        wsConnections: () => 0,
        presets,
        now: () => NOW,
      },
      { ip: null },
    );
    const list = await ops.factions({ kind: "all", includeDissolved: false });
    const rebelRow = list.find((row) => row.id === rebel);
    expect(rebelRow).toMatchObject({ name: "붉은 깃발", shortName: "RED", color: "#ff0000" });
    expect(rebelRow?.currency).toMatchObject({ asset, ticker: "RED", symbol: "R$" });
    const currencies = await ops.currencies();
    const red = currencies.find((row) => row.asset === asset);
    expect(red).toMatchObject({ issuer: { id: nation }, factions: 2 });
    const viewer = { id: "00000000-0000-4000-8000-000000000001", roles: ["admin"] as const };
    await test.db.$client.query(
      "insert into users (id, name, email, username, role) values ($1, 'Admin', 'a@id.placeholder.invalid', 'admin_x', 'admin')",
      [viewer.id],
    );
    expect(
      await ops.updateFaction(viewer, {
        factionId: nation,
        name: "새 이름",
        shortName: "NEW",
        color: "#123456",
        reason: "개명",
      }),
    ).toEqual({ ok: true });
    expect((await ops.audit({ action: "ops.faction_profile", limit: 5 }))[0]).toMatchObject({
      after: { name: "새 이름", shortName: "NEW", color: "#123456" },
      meta: { factionId: nation, reason: "개명" },
    });
  });
});
