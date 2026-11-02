// 팩의 임시 전투 자료가 시뮬의 TEST_COMBAT_CATALOG와 같은지(둘을 함께 고치게) — 팩 파일을 읽어야 해서 서버 시험에 둔다
import { loadContentPack } from "@terra/content/node";
import {
  effectEntrySchema,
  itemEntrySchema,
  parseJson,
  skillEntrySchema,
  statRowEntrySchema,
  unitKindEntrySchema,
} from "@terra/content";
import {
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
  TEST_SOCIETY_COEFFICIENTS,
  combatCatalogFrom,
  combatCoefficientsFrom,
  droppedReferences,
  skillsOf,
  societyCoefficientsFrom,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { rosterCatalogOf } from "../roster/catalog.ts";
import { COMBAT_FORMULA_IDS, DEFAULT_COMBAT_FORMULAS } from "@terra/shared/formula";
import { combatCatalogOf, formulaEntriesOf, tuningOf } from "./combatCatalog.ts";

describe("전투 자료: 팩 = TEST_COMBAT_CATALOG", () => {
  it("스탯 표·효과 사전·스킬·장비·유닛 종류가 같다", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const catalog = combatCatalogOf(loaded.source);
    expect(catalog.statTable).toEqual(TEST_COMBAT_CATALOG.statTable);
    expect(catalog.effects).toEqual(TEST_COMBAT_CATALOG.effects);
    expect(catalog.skills).toEqual(TEST_COMBAT_CATALOG.skills);
    expect(catalog.equipment).toEqual(TEST_COMBAT_CATALOG.equipment);
    expect(catalog.unitKinds).toEqual(TEST_COMBAT_CATALOG.unitKinds);
  });

  it("설정 칸 값(tuning)으로 만든 계수표가 TEST 계수표와 같다", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const tuning = tuningOf(loaded.source);
    expect(tuning.size).toBeGreaterThan(0);
    expect(combatCoefficientsFrom(tuning)).toEqual(TEST_COMBAT_COEFFICIENTS);
    expect(societyCoefficientsFrom(tuning)).toEqual(TEST_SOCIETY_COEFFICIENTS);
  });

  it("전투 계산식(formulas)이 판정 코드의 기본 식과 같다(docs/adr/2026-11-01-formula-editor.md)", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const entries = formulaEntriesOf(loaded.source);
    expect(entries.map((entry) => entry.id)).toEqual([...COMBAT_FORMULA_IDS]);
    expect(Object.fromEntries(entries.map((entry) => [entry.id, entry.expression]))).toEqual(
      DEFAULT_COMBAT_FORMULAS,
    );
  });
});

/** 실제 팩(content/core)의 전투 분류 */
function corePack() {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  const source = loaded.source;
  const entries = <T>(file: string, parse: (raw: unknown) => T): T[] => {
    const text = source.files.get(file);
    const value: unknown = text === undefined ? { entries: [] } : parseJson(text);
    const list: unknown = typeof value === "object" && value !== null ? Reflect.get(value, "entries") : [];
    return Array.isArray(list) ? list.map(parse) : [];
  };
  return {
    statRows: entries("stat_rows.json", (raw) => statRowEntrySchema.parse(raw)),
    effects: entries("effects.json", (raw) => effectEntrySchema.parse(raw)),
    skills: entries("skills.json", (raw) => skillEntrySchema.parse(raw)),
    items: entries("items.json", (raw) => itemEntrySchema.parse(raw)),
    unitKinds: entries("unit_kinds.json", (raw) => unitKindEntrySchema.parse(raw)),
  };
}

describe("꺼진 참조 거르기(스킬 편집기로 끈 스킬·효과)", () => {
  it("켜진 장비가 가리키는 꺼진 스킬은 장비 스킬에서 빠지고, 그 장비로 스킬을 만들 때 던지지 않는다", () => {
    const pack = corePack();
    expect(droppedReferences(pack)).toEqual({ itemSkills: [], skillEffects: [] });
    const off = {
      ...pack,
      skills: pack.skills.map((skill) => (skill.id === "fire_bolt" ? { ...skill, enabled: false } : skill)),
    };
    const catalog = combatCatalogFrom(off);
    const staff = catalog.equipment.find((item) => item.id === "test_staff");
    expect(staff?.skills).toEqual([]);
    expect(() => skillsOf(catalog, staff?.skills ?? [])).not.toThrow();
    expect(droppedReferences(off).itemSkills).toEqual(
      expect.arrayContaining([{ item: "test_staff", skill: "fire_bolt" }]),
    );
  });

  it("켜진 스킬이 가리키는 꺼진 효과 줄은 빠지고, 그 스킬을 만들 때 던지지 않는다", () => {
    const pack = corePack();
    const off = {
      ...pack,
      effects: pack.effects.map((effect) => (effect.id === "burn" ? { ...effect, enabled: false } : effect)),
    };
    const catalog = combatCatalogFrom(off);
    const burst = catalog.skills.find((skill) => skill.id === "flame_burst");
    expect(burst?.effects.map((part) => part.effect)).toEqual([]);
    expect(() => skillsOf(catalog, ["flame_burst", "fire_bolt"])).not.toThrow();
    expect(droppedReferences(off).skillEffects).toEqual(
      expect.arrayContaining([
        { skill: "fire_bolt", effect: "burn" },
        { skill: "flame_burst", effect: "burn" },
      ]),
    );
  });
});

/** 팩 시험용 검(JSON)에 1차 적정 스탯(STR 25·DEX 15)·양손·속성값·직접 값·입을 수 있는 종류를 적은 항목 */
function knifePack() {
  const pack = corePack();
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  const text = loaded.source?.files.get("items.json") ?? "{}";
  const file: unknown = parseJson(text);
  const entries: unknown = typeof file === "object" && file !== null ? Reflect.get(file, "entries") : [];
  const raw: unknown = Array.isArray(entries)
    ? entries.find(
        (entry: unknown) =>
          typeof entry === "object" && entry !== null && Reflect.get(entry, "id") === "test_sword",
      )
    : undefined;
  if (typeof raw !== "object" || raw === null) throw new Error("fixture test_sword");
  const equip: unknown = Reflect.get(raw, "equip");
  const weapon: unknown = typeof equip === "object" && equip !== null ? Reflect.get(equip, "weapon") : {};
  const knife = itemEntrySchema.parse({
    ...raw,
    equip: {
      ...(typeof equip === "object" ? equip : {}),
      weapon: {
        ...(typeof weapon === "object" ? weapon : {}),
        appropriate: { str: 25, dex: 15 },
        twoHanded: true,
      },
      elements: [{ element: "fire", value: 4 }],
      combat: { defenseFlat: 2, penetrationPm: 50 },
      kinds: ["human", "cyborg"],
    },
  });
  return { ...pack, items: pack.items.map((item) => (item.id === "test_sword" ? knife : item)) };
}

describe("장비 전투 칸(아이템 편집기 WP-5)", () => {
  it("무기의 1차 적정 스탯(D-502)은 무기 사양 칸 그대로 전투 자료에 간다(2차 적정치로 셈하지 않는다)", () => {
    const catalog = combatCatalogFrom(knifePack());
    const knife = catalog.equipment.find((item) => item.id === "test_sword");
    expect(knife?.weapon?.appropriate).toEqual({ str: 25, dex: 15 });
    expect(knife?.weapon?.physical).toEqual({ attack: 20 });
    expect(knife).toMatchObject({
      twoHanded: true,
      elements: { fire: 4 },
      defenseFlat: 2,
      penetrationPm: 50,
      kinds: ["human", "cyborg"],
    });
    // 무기 사양에는 양손·탄약 연결이 없다(장비 정의로)
    expect(knife?.weapon && "twoHanded" in knife.weapon).toBe(false);
  });

  it("가중치 표가 바뀌어도(밸런스 화면) roster 전투 자료의 무기 적정은 그대로이고 표만 바뀐다", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const pack = knifePack();
    const base = combatCatalogFrom(pack);
    const table = base.statTable.map((row) =>
      row.id === "physical_attack" && row.shape === "quantity"
        ? { ...row, weights: [3000, ...row.weights.slice(1)] }
        : row,
    );
    const content = { skills: pack.skills, items: pack.items, unitKinds: pack.unitKinds };
    const roster = rosterCatalogOf(
      loaded.source,
      undefined,
      () => table,
      () => content,
    );
    const knife = roster.combat.equipment.find((item) => item.id === "test_sword");
    expect(knife?.weapon?.appropriate).toEqual({ str: 25, dex: 15 });
    expect(roster.combat.statTable).toBe(table);
  });
});
