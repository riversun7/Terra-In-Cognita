// 장비 → 전투 연결 시험(아이템 편집기 WP-5, docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-02, WP-5)")
// 속성값(D-450 출처 합·칸마다 10), 전투 직접 값(D-421·D-178 더하기), 양손 무기(보조 칸 무시, 던지지 않음), 입을 수 있는 유닛 종류
// (D-494 전용 장비), 무기 1차 적정 스탯(D-502: 몫마다 하나, 1차와 바로 견줌), 1차 합 넘침(던지지 않고 자름).
import { STAT_FORMULA_VARS, compileFormulaOrThrow } from "@terra/shared/formula";
import { elementsToArray, sumElementSources, zeroElements } from "@terra/shared/cyborg";
import { describe, expect, it } from "vitest";
import { TEST_COMBAT_CATALOG, UNARMED, withStatTable } from "./catalog.ts";
import { TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { type EquipDef, type EquippedItem, itemAt, loadoutOf } from "./equipment.ts";
import { realAttackOf } from "./formula.ts";
import { MAX_STAT_INPUT, type StatRow, TEST_STAT_TABLE } from "./stats.ts";
import { specFromStats } from "./unitSpec.ts";

const base = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };
const table = TEST_COMBAT_CATALOG.statTable;
const def = (id: string): EquipDef => {
  const found = TEST_COMBAT_CATALOG.equipment.find((item) => item.id === id);
  if (!found) throw new Error(`fixture ${id}`);
  return found;
};
const slotsOf = (id: string) => {
  const found = TEST_COMBAT_CATALOG.unitKinds.find((entry) => entry.id === id);
  if (!found) throw new Error(`fixture ${id}`);
  return found.slots;
};
const ZERO12 = Array.from({ length: 12 }, () => 0);

/** 시험 장비(시험 자료 위에 칸만 더한다) */
const organ = (id: string, elements: EquipDef["elements"]): EquipDef => ({
  id,
  slot: "organ",
  stats: [{ stat: "vit", min: 1, max: 1 }],
  skills: [],
  elements,
});
const shield: EquipDef = {
  id: "lab_shield",
  slot: "offhand",
  stats: [{ stat: "defense_rate", min: 40, max: 40 }],
  skills: ["iron_skin"],
  resistPm: Array.from({ length: 12 }, (_, i) => (i === 2 ? 200 : 0)),
  defenseFlat: 5,
};
const greatsword: EquipDef = {
  ...def("test_sword"),
  id: "lab_greatsword",
  twoHanded: true,
};

describe("속성값(D-450): 장비 출처를 더하고 칸마다 10에서 자른다", () => {
  it("자기 값 + 인공장기 둘 = sumElementSources(같은 규칙 하나)", () => {
    const own = { ...zeroElements(), fire: 7, wind: 3, light: 5 };
    const heart = organ("lab_heart", { fire: 2, frost: 3 });
    const core = organ("lab_core", { fire: 4, crystal: 12 });
    const slots = slotsOf("cyborg");
    const equipped: (EquippedItem | null)[] = slots.map(() => null);
    equipped[6] = itemAt(heart, 500);
    equipped[7] = itemAt(core, 500);
    const out = loadoutOf({ base, slots, equipped, table, unarmed: UNARMED, elements: elementsToArray(own) });
    const expected = elementsToArray(
      sumElementSources(own, [
        { fire: 2, frost: 3 },
        { fire: 4, crystal: 12 },
      ]),
    );
    expect(out.elements).toEqual(expected);
    // 불 7 + 2 + 4 → 10에서 자름, 빙결 3, 크리스탈 12 → 10
    expect(out.elements[2]).toBe(10);
    expect(out.elements[1]).toBe(3);
    expect(out.elements[7]).toBe(10);
  });

  it("장비도 자기 값도 없으면 12칸 모두 0(지금 시뮬 유닛과 같은 사양)", () => {
    const out = loadoutOf({ base, slots: [], equipped: [], table, unarmed: UNARMED });
    expect(out.elements).toEqual(ZERO12);
    expect(out.resistPm).toEqual(ZERO12);
    expect(out.defenseFlat).toBe(0);
    expect(out.penetrationPm).toBe(0);
  });
});

describe("전투 직접 값(D-421): 저항‰·고정 방어·비율 관통‰은 장비마다 더한다(D-178)", () => {
  it("자기 값 위에 방패·투구 값을 더하고, 전투 사양에 그대로 들어간다", () => {
    const helmet: EquipDef = {
      ...def("test_helmet"),
      resistPm: Array.from({ length: 12 }, (_, i) => (i === 2 ? 150 : i === 0 ? -100 : 0)),
      defenseFlat: 3,
      penetrationPm: 40,
    };
    const slots = slotsOf("human");
    const out = loadoutOf({
      base,
      slots,
      equipped: [null, itemAt(shield, 0), itemAt(helmet, 0)],
      table,
      unarmed: UNARMED,
      resistPm: Array.from({ length: 12 }, (_, i) => (i === 0 ? 50 : 0)),
      defenseFlat: 2,
      penetrationPm: 10,
    });
    expect(out.resistPm[2]).toBe(350);
    expect(out.resistPm[0]).toBe(-50);
    expect(out.defenseFlat).toBe(10);
    expect(out.penetrationPm).toBe(50);
    const spec = specFromStats({
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: out.stats,
      weapon: out.weapon,
      primaries: out.primaries,
      moveIntervalMs: 1000,
      elements: out.elements,
      resistPm: out.resistPm,
      defenseFlat: out.defenseFlat,
      penetrationPm: out.penetrationPm,
    });
    expect(spec.defense.resistPm).toEqual(out.resistPm);
    expect(spec.defense.defenseFlat).toBe(10);
    expect(spec.attack.penetrationPm).toBe(50);
  });
});

describe("양손 무기(48 §5.5): 든 동안 보조 칸 장비를 쓰지 않는다(던지지 않는다)", () => {
  it("보조 칸의 스탯·스킬·직접 값이 빠지고 ignored에 까닭을 적는다", () => {
    const slots = slotsOf("human");
    const out = loadoutOf({
      base,
      slots,
      equipped: [itemAt(greatsword, 500), itemAt(shield, 0)],
      table,
      unarmed: UNARMED,
      skillSlots: 3,
    });
    expect(out.ignored).toEqual([{ index: 1, item: "lab_shield", reason: "two_handed" }]);
    expect(out.gear.defense_rate).toBeUndefined();
    expect(out.skills).not.toContain("iron_skin");
    expect(out.defenseFlat).toBe(0);
    expect(out.resistPm).toEqual(ZERO12);
    // 한손 칼이면 방패가 든다
    const oneHand = loadoutOf({
      base,
      slots,
      equipped: [itemAt(def("test_sword"), 500), itemAt(shield, 0)],
      table,
      unarmed: UNARMED,
      skillSlots: 3,
    });
    expect(oneHand.ignored).toEqual([]);
    expect(oneHand.gear.defense_rate).toBe(40);
    expect(oneHand.skills).toContain("iron_skin");
  });
});

describe("입을 수 있는 유닛 종류(D-494 크리쳐 전용 장비 등)", () => {
  it("종류가 맞지 않으면 쓰지 않고(던지지 않는다), 종류를 모르면 거르지 않는다", () => {
    const claw: EquipDef = { ...def("test_ring"), id: "lab_claw_charm", kinds: ["creature"] };
    const slots = slotsOf("human");
    const human = loadoutOf({
      base,
      slots,
      equipped: [null, null, null, null, itemAt(claw, 1000)],
      table,
      unarmed: UNARMED,
      kind: "human",
    });
    expect(human.ignored).toEqual([{ index: 4, item: "lab_claw_charm", reason: "kind" }]);
    expect(human.primaries.str).toBe(10);
    const unknown = loadoutOf({
      base,
      slots,
      equipped: [null, null, null, null, itemAt(claw, 1000)],
      table,
      unarmed: UNARMED,
    });
    expect(unknown.ignored).toEqual([]);
    expect(unknown.primaries.str).toBe(13);
  });
});

describe("무기 1차 적정 스탯(D-502, 사용자 답 296: 몫마다 하나, 가중치 표와 무관)", () => {
  const swordWeapon = def("test_sword").weapon;
  if (!swordWeapon) throw new Error("fixture test_sword");
  const knife: EquipDef = {
    ...def("test_sword"),
    id: "lab_knife",
    weapon: { ...swordWeapon, appropriate: { str: 25, dex: 15 } },
  };

  it("적정은 무기 사양 칸 그대로 전투에 간다(2차 적정치로 셈하지 않는다)", () => {
    const out = loadoutOf({
      base,
      slots: slotsOf("human"),
      equipped: [itemAt(knife, 0)],
      table,
      unarmed: UNARMED,
    });
    expect(out.weapon.appropriate).toEqual({ str: 25, dex: 15 });
    expect(out.stats.physical_attack).toBe(10);
    const spec = specFromStats({
      id: 1,
      side: 1,
      party: 1,
      x: 0,
      y: 0,
      stats: out.stats,
      weapon: out.weapon,
      primaries: out.primaries,
      moveIntervalMs: 1000,
    });
    // 10 + 20 × 10 ÷ 25 = 18, 적정 AGI 없음 → 간격 그대로
    expect(realAttackOf(spec.attack, 1000, TEST_COMBAT_COEFFICIENTS)).toBe(18);
    expect(spec.attack.dexAppropriateMilli).toBe(15_000);
    expect(spec.attackIntervalMs).toBe(1000);
  });

  it("가중치 표가 바뀌어도(밸런스 화면·행 식) 무기 적정은 그대로이고, 같은 표면 같은 묶음", () => {
    const vars = STAT_FORMULA_VARS.map((item) => item.name);
    const doubled: StatRow[] = TEST_STAT_TABLE.map((row) =>
      row.id === "physical_attack" ? { ...row, formula: compileFormulaOrThrow("STR * 2", vars) } : row,
    );
    const catalog = withStatTable({ ...TEST_COMBAT_CATALOG, equipment: [knife] }, doubled);
    expect(catalog.statTable).toBe(doubled);
    expect(catalog.equipment[0]).toBe(knife);
    expect(withStatTable(TEST_COMBAT_CATALOG, TEST_COMBAT_CATALOG.statTable)).toBe(TEST_COMBAT_CATALOG);
  });
});

describe("1차 합 넘침: 던지지 않고 입력 범위(MAX_STAT_INPUT)에서 자른다", () => {
  it("장신구 둘이 1차를 범위 밖으로 올려도 2차 계산이 돈다", () => {
    const huge: EquipDef = {
      id: "lab_huge_ring",
      slot: "accessory",
      stats: [{ stat: "str", min: MAX_STAT_INPUT, max: MAX_STAT_INPUT }],
      skills: [],
    };
    const out = loadoutOf({
      base,
      slots: slotsOf("human"),
      equipped: [null, null, null, null, itemAt(huge, 0), itemAt(huge, 0)],
      table,
      unarmed: UNARMED,
    });
    expect(out.primaries.str).toBe(MAX_STAT_INPUT);
    expect(Number.isSafeInteger(out.stats.physical_attack)).toBe(true);
  });
});
