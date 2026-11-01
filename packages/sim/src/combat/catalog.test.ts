import {
  EQUIP_SLOT_KINDS,
  PRIMARY_STAT_CODES,
  PRIMARY_STAT_SLOTS,
  type UnitKindEntry,
  unitKindEntrySchema,
} from "@terra/content";
import { describe, expect, it } from "vitest";
import { PRIMARY_CODES, PRIMARY_SLOTS, SLOT_KINDS } from "./equipment.ts";
import { combatCatalogFrom } from "./packCatalog.ts";

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
