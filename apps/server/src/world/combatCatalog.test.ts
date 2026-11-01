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
import { combatCatalogOf, tuningOf } from "./combatCatalog.ts";

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
