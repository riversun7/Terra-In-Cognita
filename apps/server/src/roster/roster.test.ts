// 유닛·사이보그 화면 자료 — 팩 이름 표, 몸 계산(성장·장비·스킬 칸), 시안 자료, 실제 유닛 줄 바꾸기, 서비스·프로시저 권한
import { loadContentPack } from "@terra/content/node";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import type { HomeQuery, TrpcContext, Viewer } from "../trpc/context.ts";
import { emptyEconomyCatalog } from "../economyView/catalog.ts";
import { createEconomyServices } from "../economyView/services.ts";
import { createFactionScreenServices } from "../factionScreen/overview.ts";
import { createHomeServices } from "../home/services.ts";
import { createMailServices } from "../mail/list.ts";
import { createCallerFactory } from "../trpc/init.ts";
import { appRouter } from "../trpc/router.ts";
import { BASELINE_PRIMARY, baselineBody, bodyView } from "./body.ts";
import { type RosterCatalog, namesFor, rosterCatalogOf } from "./catalog.ts";
import { previewCyborg, previewUnits } from "./preview.ts";
import { createRosterServices, realPrisoner, realUnit } from "./services.ts";
import { type WorldRosterRow, type WorldRosterSource, injuryOf, jobOf, unitTypeOf } from "./worldUnits.ts";

function packCatalog(): RosterCatalog {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  return rosterCatalogOf(loaded.source);
}

const catalog = packCatalog();
const NOW = 1_800_000_000_000;
const player: Viewer = { id: "u-player", loginId: "Player1", roles: ["player"] };
const dev: Viewer = { id: "u-dev", loginId: "Dev1", roles: ["player", "dev"] };
const own: HomeQuery = { preview: false, now: NOW };
const withPreview: HomeQuery = { preview: true, now: NOW };

describe("팩 이름 표", () => {
  it("스탯·아이템·스킬·시설 이름을 두 언어로 갖고, 응답에는 쓴 ID만 고른다", () => {
    expect(catalog.names.stats.hp).toEqual({ ko: "HP", en: "HP" });
    expect(catalog.names.items.test_sword?.en).toBe("Test sword");
    expect(catalog.names.skills.power_strike?.ko).toBe("강타");
    expect(catalog.names.facilities.mine).toEqual({ ko: "광산", en: "Mine" });
    const picked = namesFor(catalog, {
      stats: ["hp", "no_such_stat"],
      items: ["grain"],
      skills: [],
      facilities: ["farm"],
    });
    expect(Object.keys(picked.stats)).toEqual(["hp"]);
    expect(Object.keys(picked.items)).toEqual(["grain"]);
    expect(picked.skills).toEqual({});
    expect(Object.keys(picked.facilities)).toEqual(["farm"]);
  });
});

describe("몸 계산", () => {
  it("성장(D-417) 뒤에 장신구 보너스(D-423)를 더하고, 2차 스탯은 팩 표로 계산한다(Mina Lv18)", () => {
    const mina = previewUnits(catalog, NOW).find((unit) => unit.id === "p1");
    if (!mina) throw new Error("p1");
    // STR 14, K 1150, Lv18 → 14 × (1000 + 100 × 1150 × 17 ÷ 1000) ÷ 1000 = 41, 반지(1~3, 700‰) +2
    expect(mina.stats.primaries.str).toEqual({ base: 41, bonus: 2 });
    expect(mina.stats.primaries.vit).toEqual({ base: 40, bonus: 0 });
    // HP = 0 + (43×1500 + 23×1000 + 24×1500 + 40×3000 + 14×1000 + 20×1200) ÷ 1000 = 281(팩 표 = 기획 48 N1, R4b)
    expect(mina.stats.secondary.find((row) => row.id === "hp")?.value).toBe(281);
    expect(mina.stats.source).toBe("computed");
    // 칸 배치 = 팩 human 6칸, 장비 4개
    expect(mina.slots.map((slot) => slot.slot)).toEqual([
      "weapon",
      "offhand",
      "head",
      "body",
      "accessory",
      "accessory",
    ]);
    expect(mina.slots.filter((slot) => slot.item !== null)).toHaveLength(4);
    // 스킬: 고유 먼저(강타·강철 피부), 칸 = 기본 3
    expect(mina.skills).toEqual({
      slots: 3,
      list: [
        { id: "power_strike", source: "innate" },
        { id: "iron_skin", source: "innate" },
      ],
    });
  });

  it("확률 모양은 상한(점근선)을 넘지 않는다", () => {
    for (const unit of previewUnits(catalog, NOW))
      for (const row of unit.stats.secondary) {
        const def = catalog.combat.statTable.find((entry) => entry.id === row.id);
        if (def?.shape === "probability") expect(row.value).toBeLessThan(def.cap);
      }
  });

  it("안드로이드는 레벨이 없고 배터리, 장비 스킬은 장비에서 온다", () => {
    const units = previewUnits(catalog, NOW);
    const android = units.find((unit) => unit.id === "p5");
    expect(android?.level).toBeNull();
    expect(android?.energy.kind).toBe("battery");
    const joon = units.find((unit) => unit.id === "p2");
    // 환생 1번 → 스킬 칸 4(D-427), 지팡이의 불꽃 화살은 장비 스킬
    expect(joon?.skills.slots).toBe(4);
    expect(joon?.skills.list).toContainEqual({ id: "fire_bolt", source: "equipment" });
  });

  it("칸이 맞지 않거나 팩에 없는 아이템은 빈 칸이다", () => {
    const view = bodyView(catalog, {
      kind: "human",
      initial: { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 },
      kPm: null,
      level: 1,
      rebirths: 0,
      equipped: new Map([
        [0, { item: "test_vest", pm: 500 }],
        [2, { item: "no_such_item", pm: 500 }],
      ]),
      innateSkills: [],
      source: "computed",
    });
    expect(view.slots.every((slot) => slot.item === null)).toBe(true);
  });

  it("사이보그 시안: 공통 6칸 + 인공장기, 환생 1 → 스킬 칸 4·등급 상한 4, 인공 심장은 VIT 보너스", () => {
    const body = previewCyborg(catalog);
    expect(body.slots.filter((slot) => slot.slot === "organ").length).toBeGreaterThan(0);
    expect(body.skills.slots).toBe(4);
    expect(body.skillGradeCap).toBe(4);
    expect(body.stats.primaries.vit.bonus).toBeGreaterThan(0);
    expect(body.preview).toBe(true);
  });

  it("[임시] 시험 유닛 기본값: 1차 모두 10, 보너스 0, baseline", () => {
    const body = baselineBody(catalog);
    expect(body.stats.source).toBe("baseline");
    for (const value of Object.values(body.stats.primaries))
      expect(value).toEqual({ base: BASELINE_PRIMARY, bonus: 0 });
  });
});

describe("실제 유닛 줄", () => {
  const row: WorldRosterRow = {
    id: 42,
    type: "test_worker",
    planetId: "s2_test_planet",
    mapKey: 123,
    domain: "land",
    job: { kind: "test_gather", phase: "work" },
    fatigue: 30,
    injury: { stage: 0, untilMs: null },
    captive: false,
    moving: false,
    cargo: [{ asset: "s3_test_ore", amount: "5" }],
  };

  it("세계 유닛 코드·직무·부상을 화면 값으로 바꾼다", () => {
    expect(unitTypeOf(1)).toBe("test_worker");
    expect(unitTypeOf(2)).toBe("test_unit");
    expect(jobOf(1, 0)).toEqual({ kind: "test_gather", phase: "work" });
    expect(jobOf(2, 1)).toEqual({ kind: "test_hunt", phase: "rest" });
    expect(jobOf(0, 0)).toBeNull();
    expect(injuryOf(2, NOW + 1000, NOW)).toEqual({ stage: 2, untilMs: NOW + 1000 });
    // 나을 시각이 지났으면 없음
    expect(injuryOf(2, NOW - 1, NOW)).toEqual({ stage: 0, untilMs: null });
  });

  it("실제 유닛은 이름·레벨 없음, 기본값 스탯, 시안 아님. 포로의 원래 주인은 보이지 않는다", () => {
    const unit = realUnit(catalog, row);
    expect(unit).toMatchObject({ id: "w42", name: null, level: null, preview: false, party: null });
    expect(unit.place).toEqual({ planetId: "s2_test_planet", mapKey: "123", domain: "land", base: null });
    expect(unit.energy).toEqual({ kind: "fatigue", value: 30, max: 120 });
    expect(unit.stats.source).toBe("baseline");
    expect(realPrisoner(row)).toMatchObject({ id: "w42", owner: null, preview: false });
  });
});

/** 실제 유닛 출처 흉내(한 사용자에게 한 줄) */
function fakeWorld(rows: readonly WorldRosterRow[]): WorldRosterSource {
  return {
    read: (userId) =>
      Promise.resolve(userId === player.id ? { units: rows, prisoners: [] } : { units: [], prisoners: [] }),
    count: (userId) => Promise.resolve(userId === player.id ? rows.length : 0),
  };
}

describe("서비스", () => {
  const worker: WorldRosterRow = {
    id: 7,
    type: "test_worker",
    planetId: "s2_test_planet",
    mapKey: 1,
    domain: "land",
    job: null,
    fatigue: 0,
    injury: { stage: 0, untilMs: null },
    captive: false,
    moving: true,
    cargo: [],
  };
  const services = createRosterServices({ catalog, world: fakeWorld([worker]) });

  it("시안이 아니면 실제 유닛만, 시안 칸(파티·프리셋·관리인·경매소)은 비어 있다", async () => {
    const list = await services.units(player, own);
    expect(list.units.map((unit) => unit.id)).toEqual(["w7"]);
    expect(list).toMatchObject({
      prisoners: [],
      parties: [],
      presets: [],
      bases: [],
      auction: [],
      preview: false,
    });
    expect(list.generatedAt).toBe(NOW);
    // 직무가 없으니 시설 이름은 없고, 스탯 이름은 있다
    expect(list.names.facilities).toEqual({});
    expect(list.names.stats.hp).toBeDefined();
    const empty = await services.units(dev, own);
    expect(empty.units).toEqual([]);
  });

  it("시안이면 실제 유닛 뒤에 시안 유닛·포로·파티·프리셋·관리인·경매소를 더한다(모두 preview)", async () => {
    const list = await services.units(player, withPreview);
    expect(list.units[0]?.id).toBe("w7");
    expect(list.units.slice(1).every((unit) => unit.preview && unit.id.startsWith("p"))).toBe(true);
    expect(list.prisoners.length).toBeGreaterThan(0);
    expect(list.parties.every((party) => party.members.length <= 6)).toBe(true);
    for (const group of [list.prisoners, list.parties, list.presets, list.bases, list.auction])
      expect(group.every((entry) => entry.preview)).toBe(true);
    // 파티 구성원은 목록의 유닛이다
    const ids = new Set(list.units.map((unit) => unit.id));
    for (const party of list.parties)
      for (const entry of party.members) expect(ids.has(entry.unit)).toBe(true);
    expect(list.names.facilities.mine).toBeDefined();
    expect(list.names.items.grain).toBeDefined();
  });

  it("사이보그: 이름·유닛 수는 실제, 본체는 시안에서만", async () => {
    const mine = await services.cyborg(player, own);
    expect(mine).toMatchObject({ name: "Player1", body: null, unitCount: 1, preview: false });
    const preview = await services.cyborg(dev, withPreview);
    expect(preview.body?.level).toBe(23);
    expect(preview.unitCount).toBe(0);
    expect(preview.names.items.test_heart).toBeDefined();
  });
});

function callerFor(viewer: Viewer) {
  const ctx: TrpcContext = {
    contentVersion: "test",
    now: () => NOW,
    viewer: () => Promise.resolve(viewer),
    admin: undefined,
    settings: undefined,
    planetEditor: undefined,
    home: createHomeServices(),
    roster: createRosterServices({ catalog }),
    // 다른 화면 자료: 이 시험은 쓰지 않는다
    economy: createEconomyServices({ catalog: emptyEconomyCatalog("test") }),
    faction: createFactionScreenServices(),
    mail: createMailServices(),
  };
  return createCallerFactory(appRouter)(ctx);
}

describe("프로시저", () => {
  it("플레이어가 시안 자료를 요청하면 FORBIDDEN, dev는 받는다", async () => {
    await expect(callerFor(player).units.list({ preview: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(callerFor(player).cyborg.get({ preview: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const list = await callerFor(player).units.list();
    expect(list.preview).toBe(false);
    const preview = await callerFor(dev).units.list({ preview: true });
    expect(preview.units.length).toBeGreaterThan(0);
  });
});
