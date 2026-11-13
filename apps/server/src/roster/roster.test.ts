// 유닛·사이보그 화면 자료 — 팩 이름 표, 몸 계산(성장·장비·스킬 칸), 시안 자료, 실제 유닛 줄 바꾸기, 서비스·프로시저 권한
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CYBORG_APPEARANCE, zeroElements } from "@terra/shared/cyborg";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import type { HomeQuery, TrpcContext, Viewer } from "../trpc/context.ts";
import { emptyEconomyCatalog } from "../economyView/catalog.ts";
import { createEconomyServices } from "../economyView/services.ts";
import { createFactionScreenServices } from "../factionScreen/overview.ts";
import { createHomeServices } from "../home/services.ts";
import { createMailServices } from "../mail/list.ts";
import { NO_HOLDINGS } from "../holdings/reads.ts";
import { NO_VITALS } from "../vitals/reads.ts";
import { createCallerFactory } from "../trpc/init.ts";
import { appRouter } from "../trpc/router.ts";
import { BASELINE_PRIMARY, baselineBody, bodyView } from "./body.ts";
import { type RosterCatalog, namesFor, rosterCatalogOf } from "./catalog.ts";
import type { CyborgRecord } from "../cyborg/state.ts";
import { realCyborgBody } from "./cyborgBody.ts";
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

const DAY = 86_400_000;

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
    // 만렙은 팩 N7, 신앙도는 0~100 척도(D-441)
    expect(body.maxLevel).toBe(catalog.society.cyborg.maxLevel);
    expect(body.faith).toBeGreaterThanOrEqual(0);
    expect(body.faith).toBeLessThanOrEqual(100);
    expect(body.stats.primaries.vit.bonus).toBeGreaterThan(0);
    expect(body.preview).toBe(true);
  });

  it("사이보그 풀이: 켜진 2차 스탯 15개 + 시야 + 제작 직무(D-458, D-502로 명중·크리·행동 속도 점수는 끔, D-512 323, HP 회복 D-514), 새 행도 공식 항과 함께 온다", () => {
    const body = previewCyborg(catalog);
    expect(body.breakdown).toHaveLength(17);
    // 물리 공격력 = STR + ⌊VIT ÷ 2⌋(2026-11-13, D-502의 (STR + VIT) ÷ 2를 바꿈): 항 STR 1000‰·VIT 500‰
    const attack = body.breakdown.find((entry) => entry.id === "physical_attack");
    expect(attack?.terms.map((term) => [term.stat, term.weightPm])).toEqual([
      ["str", 1000],
      ["vit", 500],
    ]);
    expect(body.breakdown.some((entry) => entry.id === "hit" || entry.id === "action_speed")).toBe(false);
    const row = (id: string) => {
      const found = body.breakdown.find((entry) => entry.id === id);
      if (!found) throw new Error(`row ${id}`);
      return found;
    };
    const total = (stat: "agi" | "vit" | "int" | "wis") =>
      body.stats.primaries[stat].base + body.stats.primaries[stat].bonus;
    // 쉴드 재생 = 1분에 WIS만큼(L11): 항 WIS × 1000‰ 하나
    expect(row("shield_regen").terms.map((term) => [term.stat, term.weightPm])).toEqual([["wis", 1000]]);
    expect(row("shield_regen").value).toBe(total("wis"));
    // HP 회복(D-514) = 분당 60 + VIT × 4.8 + WIS × 2.4(옛 문서 초당 식 × 60 [임시])
    expect(row("hp_regen").terms.map((term) => [term.stat, term.weightPm])).toEqual([
      ["vit", 4800],
      ["wis", 2400],
    ]);
    expect(row("hp_regen").value).toBe(60 + Math.floor((total("vit") * 4800 + total("wis") * 2400) / 1000));
    // 속성 방어율: 확률 모양(상한 700‰·반감 100), 항은 화면 차례 VIT·WIS
    const ward = row("elemental_defense_rate");
    expect([ward.shape, ward.cap, ward.halfConstant]).toEqual(["probability", 700, 100]);
    expect(ward.terms.map((term) => term.stat)).toEqual(["vit", "wis"]);
    // 스태미나 회복 = 적정 STA에서 분당 720(D-511, 1차 항 없음 — 적정 비율은 전투 사양이 곱한다), MP 회복 = INT × 1 + WIS × 2 (분당)
    expect(row("stamina_regen").value).toBe(720);
    expect(row("stamina_regen").terms).toEqual([]);
    expect(row("mp_regen").value).toBe(Math.floor((total("int") * 1000 + total("wis") * 2000) / 1000));
    expect(catalog.names.stats.elemental_defense_rate).toEqual({
      ko: "속성 방어율",
      en: "Elemental defense rate",
    });
  });

  it("사이보그 풀이: 행마다 stats.secondary와 같은 값, 항은 보너스까지 더한 1차 × 팩 가중치, 장비 수치는 extra(48 §3.1)", () => {
    const body = previewCyborg(catalog);
    expect(body.breakdown.map((row) => row.id)).toEqual(body.stats.secondary.map((row) => row.id));
    for (const row of body.breakdown) {
      expect(row.value).toBe(body.stats.secondary.find((stat) => stat.id === row.id)?.value);
      for (const term of row.terms) {
        const primary = body.stats.primaries[term.stat];
        expect(term.value).toBe(primary.base + primary.bonus);
        expect(term.milli).toBe(term.value * term.weightPm);
      }
      expect(row.weighted).toBe(Math.floor(row.terms.reduce((sum, term) => sum + term.milli, 0) / 1000));
      if (row.shape === "quantity") expect(row.value).toBe(row.base + row.weighted + row.extra);
      else expect(row.cap).not.toBeNull();
    }
    // HP 항은 화면 차례(STR·VIT·INT·WIS·DEX·AGI)로 온다
    expect(body.breakdown.find((row) => row.id === "hp")?.terms.map((term) => term.stat)).toEqual([
      "str",
      "vit",
      "int",
      "wis",
      "dex",
      "agi",
    ]);
    // 시험 조끼(body)는 방어 수치를 더한다 → 어느 행이든 extra가 0이 아니다
    expect(body.breakdown.some((row) => row.extra !== 0)).toBe(true);
    // 속성값 12칸(D-450 시안: 생성 불 7·바람 3 + 인공장기 불 2·빙결 3 + 종교 환생 빛 5), 스킬 칸: 환생 1 → 4칸, 닫힌 칸 6개가
    // 환생 2~7에 하나씩 열린다(팩 처음 3 + 환생마다 1, 최대 10)
    expect(body.elements).toEqual([0, 3, 9, 0, 3, 0, 0, 0, 5, 0, 0, 0]);
    expect(body.skillSlotsMax).toBe(10);
    expect(body.skillSlotUnlocks).toEqual([2, 3, 4, 5, 6, 7]);
    // 시안은 Lv 23이라 K·처음 값이 없다(D-449)
    expect(body.growth).toBeNull();
    // 1차 출처(핵심 사양 상세): 몸 값 + 장비 칸 아이템마다. 더하면 base + bonus(시험 반지 = 장신구 STR, 시험 심장 = 인공장기 VIT)
    for (const stat of ["str", "vit", "int", "wis", "dex", "agi"] as const) {
      const sum = body.primarySources[stat].reduce((total, source) => total + source.value, 0);
      expect(sum).toBe(body.stats.primaries[stat].base + body.stats.primaries[stat].bonus);
      expect(body.primarySources[stat][0]).toEqual({ kind: "body", value: body.stats.primaries[stat].base });
    }
    expect(body.primarySources.vit.some((source) => source.kind === "item" && source.slot === "organ")).toBe(
      true,
    );
    expect(
      body.primarySources.str.some((source) => source.kind === "item" && source.slot === "accessory"),
    ).toBe(true);
  });

  it("만든 사이보그: K·처음 값은 만렙(N7)에서만 보낸다(D-449), 그 밖에는 null(D-417 숨김)", () => {
    const record: CyborgRecord = {
      userId: "u-player",
      name: "새싹로봇",
      nameKey: "새싹로봇",
      temperament: "balanced",
      initial: { str: 12, dex: 9, agi: 10, vit: 11, int: 8, wis: 10 },
      kPm: { str: 1100, dex: 950, agi: 1000, vit: 1050, int: 900, wis: 1000 },
      appearance: DEFAULT_CYBORG_APPEARANCE,
      look: null,
      factionId: 1,
      startCityId: 1,
      unitId: 7,
      level: 1,
      exp: 0,
      rebirths: 0,
      faith: 0,
      createdAtMs: NOW,
      elements: { ...zeroElements(), fire: 6, wind: 4 },
      religion: null,
      faithPoints: 0,
      startGrant: 108n,
      nationChangedAtMs: null,
      standings: new Map(),
    };
    const fresh = realCyborgBody(catalog, record, false);
    // 속성값(D-450) = 저장된 생성 값(12칸, 차례 = ELEMENT_CODES). 분배 전(null)이면 모두 0
    expect(fresh.elements).toEqual([0, 0, 6, 0, 4, 0, 0, 0, 0, 0, 0, 0]);
    expect(realCyborgBody(catalog, { ...record, elements: null }, false).elements).toEqual(
      Array.from({ length: 12 }, () => 0),
    );
    // 생활비를 못 냈으면 효율 불이익(D-453, N38 출발값 700‰)
    expect(fresh.living).toEqual({ unpaid: false, efficiencyPm: 1000 });
    expect(realCyborgBody(catalog, record, true).living).toEqual({ unpaid: true, efficiencyPm: 700 });
    expect(fresh.growth).toBeNull();
    expect(fresh.stats.primaries.str).toEqual({ base: 12, bonus: 0 });
    const max = catalog.society.cyborg.maxLevel;
    const top = realCyborgBody(catalog, { ...record, level: max }, false);
    expect(top.growth).toEqual({ initial: record.initial, kPm: record.kPm });
    // 성장값 = 처음 값 × (1000 + 100 × K × (Lv − 1) ÷ 1000) ÷ 1000(D-417, 성장률 100‰)
    expect(top.stats.primaries.str.base).toBe(
      Math.floor((12 * (1000 + Math.floor((100 * 1100 * (max - 1)) / 1000))) / 1000),
    );
    expect(realCyborgBody(catalog, { ...record, level: max - 1 }, false).growth).toBeNull();
    // 1차 출처: 평소 몸 값 하나, 만렙이면 처음 값 + 레벨 성장(K‰). 더하면 base + bonus
    expect(fresh.primarySources.str).toEqual([{ kind: "body", value: 12 }]);
    expect(top.primarySources.str).toEqual([
      { kind: "initial", value: 12 },
      { kind: "growth", value: top.stats.primaries.str.base - 12, kPm: 1100 },
    ]);
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
    type: "test_unit",
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
    // 1(없앤 시험 일꾼 — 부팅이 옛 행을 지운다)은 따로 이름이 없다
    expect(unitTypeOf(1)).toBe("test_unit");
    expect(unitTypeOf(2)).toBe("test_unit");
    expect(unitTypeOf(4)).toBe("human");
    expect(jobOf(1, 0)).toEqual({ kind: "test_gather", phase: "work" });
    expect(jobOf(2, 1)).toEqual({ kind: "test_hunt", phase: "rest" });
    expect(jobOf(0, 0)).toBeNull();
    // 노랑: 다음 단계(흰) 시각, 흰 1일 뒤 초록(D-521 자연 치유)
    expect(injuryOf(2, NOW + 1000, NOW)).toEqual({
      stage: 2,
      untilMs: NOW + 1000,
      greenAtMs: NOW + 1000 + DAY,
    });
    // 노랑의 끝이 지났으면 한 단계 내려가 흰(그 끝 + 1일)
    expect(injuryOf(2, NOW - 1, NOW)).toMatchObject({ stage: 1, untilMs: NOW - 1 + DAY });
    // 흰의 끝이 지났으면 초록
    expect(injuryOf(1, NOW - 1, NOW)).toEqual({ stage: 0, untilMs: null });
    // 병원 치료 배율은 함께 보인다
    expect(injuryOf(1, NOW + 1000, NOW, 4000)).toMatchObject({ stage: 1, healPm: 4000 });
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
    type: "test_unit",
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

  it("사이보그: 이름·유닛 수는 실제, 본체는 시안에서만, 환생 조건·비용·다시 굴리기 횟수는 팩 설정값으로 늘(D-440·D-441·D-444, N7·N9·N34)", async () => {
    const mine = await services.cyborg(player, own);
    expect(mine).toMatchObject({ name: "Player1", body: null, unitCount: 1, preview: false });
    // 환생 분포는 생성 때처럼 성향을 골라 다시 굴린다: 다시 굴리기 횟수는 생성과 같은 N9 값(5, 사용자 요청 2026-11-11)
    expect(mine.rebirth).toEqual({ maxLevel: 50, faith: 50, currency: "10000", rerolls: 5 });
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
    holdings: NO_HOLDINGS,
    vitals: NO_VITALS,
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
