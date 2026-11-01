import {
  EQUIP_SLOT_KINDS,
  PRIMARY_STAT_CODES,
  PRIMARY_STAT_SLOTS,
  type UnitKindEntry,
  unitKindEntrySchema,
} from "@terra/content";
import { describe, expect, it } from "vitest";
import { PRIMARY_CODES, PRIMARY_SLOTS, SLOT_KINDS } from "./equipment.ts";
import { loadContentPack } from "@terra/content/node";
import {
  effectEntrySchema,
  itemEntrySchema,
  parseJson,
  skillEntrySchema,
  statRowEntrySchema,
} from "@terra/content";
import { skillsOf } from "./catalog.ts";
import { combatCatalogFrom, droppedReferences } from "./packCatalog.ts";

const BODY = {
  hitPm: 850,
  hitAppropriate: 20,
  critPm: 50,
  critAppropriate: 20,
  intervalMs: 1000,
  speedAppropriate: 100,
  range: 1,
  arc: false,
  staminaCost: 10,
  mpCost: 0,
};
const kind = (id: string, slots: string[], flag?: boolean): UnitKindEntry =>
  unitKindEntrySchema.parse({
    id,
    name: { ko: id, en: id },
    slots,
    skillSlots: { base: 3, perRebirth: 1, max: 10 },
    naturalWeapon: { ...BODY, physical: { attack: 5, attackAppropriate: 20 } },
    naturalElementalWeapon: { ...BODY, elemental: { attack: 5, attackAppropriate: 20 } },
    ...(flag === undefined ? {} : { naturalWeaponIsWeapon: flag }),
    enabled: true,
  });

// 팩의 임시 자료 = TEST_COMBAT_CATALOG 확인은 파일을 읽어야 해서 서버 시험(apps/server/src/world/combatCatalog.test.ts)에 있다
describe("전투 자료 코드 목록", () => {
  it("칸·1차 스탯 코드 목록이 콘텐츠 스키마와 같다", () => {
    expect([...SLOT_KINDS]).toEqual([...EQUIP_SLOT_KINDS]);
    expect([...PRIMARY_CODES]).toEqual([...PRIMARY_STAT_CODES]);
    expect([...PRIMARY_SLOTS]).toEqual([...PRIMARY_STAT_SLOTS]);
  });
});

describe("유닛 종류의 타고난 무기를 스킬용 무기로 치나(D-490)", () => {
  it("적은 값을 따르고, 적지 않으면 무기 칸이 없는 종류(크리쳐)만 참", () => {
    const { unitKinds } = combatCatalogFrom({
      statRows: [],
      effects: [],
      skills: [],
      items: [],
      unitKinds: [
        kind("human", ["weapon", "head"]),
        kind("beast", ["accessory", "saddle"]),
        kind("armed_beast", ["accessory"], false),
        kind("brawler", ["weapon"], true),
      ],
    });
    expect(unitKinds.map((entry) => [entry.id, entry.naturalWeaponIsWeapon])).toEqual([
      ["human", false],
      ["beast", true],
      ["armed_beast", false],
      ["brawler", true],
    ]);
  });
});

/** 실제 팩(content/core)의 전투 분류 */
function corePack() {
  const loaded = loadContentPack(new URL("../../../../content/core", import.meta.url).pathname);
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
