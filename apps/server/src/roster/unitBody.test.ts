// 유닛 실효 몸 시험 — 입은 장비(굴린 값·무기 사양, 내구도 > 0만)·인공장기·걸린 효과가 사이보그 화면 스탯·공격 값과 전투 사양에 든다.
// 실제 팩(content/core)으로: 새 사이보그(1차 모두 10, Lv 1)에 시험 검(공격력 20·적정 STR 25·DEX 12·AGI 12)을 쥐면
// 공격력 10 → 18(D-502 사용자 예), 부서진 검은 아무것도 주지 않는다. 장신구 두 칸은 더한다(옛 utils/item/equipment.js getEquipmentTotals).
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CYBORG_APPEARANCE, zeroElements } from "@terra/shared/cyborg";
import { realStaminaRegen } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import type { CyborgRecord } from "../cyborg/state.ts";
import { rosterCatalogOf } from "./catalog.ts";
import { realCyborgBody } from "./cyborgBody.ts";
import {
  BASELINE_BASE,
  type GearEffect,
  type GearItem,
  NO_GEAR,
  type UnitGear,
  combatSpecOf,
  effectiveView,
  hasGear,
  primaryBuffsOf,
  startEffectsOf,
} from "./unitBody.ts";

const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.source) throw new Error("content pack");
const catalog = rosterCatalogOf(loaded.source);
const NOW = 1_800_000_000_000;

const ten = { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };
const record: CyborgRecord = {
  userId: "u-player",
  name: "새싹로봇",
  nameKey: "새싹로봇",
  temperament: "balanced",
  initial: ten,
  kPm: { str: 1000, dex: 1000, agi: 1000, vit: 1000, int: 1000, wis: 1000 },
  appearance: DEFAULT_CYBORG_APPEARANCE,
  factionId: 1,
  startCityId: 1,
  unitId: 7,
  level: 1,
  exp: 0,
  rebirths: 0,
  faith: 0,
  createdAtMs: NOW,
  elements: zeroElements(),
  religion: null,
  faithPoints: 0,
  startGrant: null,
};
const cyborg = { kind: "cyborg", record } as const;

/** 사이보그 칸 차례(팩 unit_kinds cyborg): 무기 0·보조 1·머리 2·몸 3·장신구 4·5·인공장기 6·7·8 */
const sword = (durability: number | null = null): GearItem => ({
  item: "test_sword",
  slot: 0,
  stats: [{ stat: "crit_multiplier", value: 50 }],
  durability,
});
const gear = (equipped: readonly GearItem[], effects: readonly GearEffect[] = []): UnitGear => ({
  equipped,
  effects,
});
const effect = (over: Partial<GearEffect> & Pick<GearEffect, "effect">): GearEffect => ({
  value: 5,
  untilMs: NOW + 60_000,
  kind: "buff",
  stat: "str",
  valueMode: "flat",
  ...over,
});
const place = { id: 7, side: 1, party: 1, x: 3, y: 4, moveIntervalMs: 1000, buildingMulPm: 2000 };
const row = (stats: { secondary: readonly { id: string; value: number }[] }, id: string) =>
  stats.secondary.find((entry) => entry.id === id)?.value;

describe("입은 장비 → 사이보그 화면(cyborg.get 몸)", () => {
  it("시험 검을 쥐면 공격력 10 → 18, 명중·간격·크리 배율이 무기를 따른다(D-502)", () => {
    const bare = realCyborgBody(catalog, record, false);
    const armed = realCyborgBody(catalog, record, false, gear([sword()]));
    expect(bare.combat?.weapon).toBeNull();
    expect(bare.combat?.attack).toMatchObject({ statAttack: 10, weaponAttack: 0, real: 10 });
    expect(armed.combat?.weapon).toBe("test_sword");
    expect(armed.combat?.attack).toMatchObject({
      kind: "physical",
      statAttack: 10,
      weaponAttack: 20,
      part: { stat: 10, appropriateMilli: 25_000, ratioPm: 400 },
      real: 18,
    });
    // 명중 = 900 × min(1, DEX 10 ÷ 12), 간격 = 1,000 ÷ 0.833(D-502 ADR 표: 749‰·1,200ms)
    expect(armed.combat?.hit.real).toBe(749);
    expect(armed.combat?.interval.real).toBe(1200);
    // 굴린 옵션 줄(크리 배율 +50)이 2차 행에 든다
    expect(row(armed.stats, "crit_multiplier")).toBe((row(bare.stats, "crit_multiplier") ?? 0) + 50);
    expect(armed.slots[0]?.item?.id).toBe("test_sword");
    expect(armed.skills.list).toEqual(bare.skills.list);
  });

  it("부서진 장비(내구도 0)는 아무것도 주지 않는다(N49 286)", () => {
    const bare = realCyborgBody(catalog, record, false);
    const broken = realCyborgBody(catalog, record, false, gear([sword(0)]));
    expect(broken.combat).toEqual(bare.combat);
    expect(broken.stats).toEqual(bare.stats);
    expect(broken.slots[0]?.item).toBeNull();
    expect(hasGear(gear([sword(0)]))).toBe(false);
    // 내구도가 남은 것은 준다
    expect(realCyborgBody(catalog, record, false, gear([sword(1)])).combat?.attack.real).toBe(18);
  });

  it("인공장기·장신구 두 칸은 1차 스탯에 더한다(D-423, 칸마다 더함)", () => {
    const body = realCyborgBody(
      catalog,
      record,
      false,
      gear([
        { item: "test_heart", slot: 6, stats: [{ stat: "vit", value: 3 }], durability: null },
        { item: "test_ring", slot: 4, stats: [{ stat: "str", value: 2 }], durability: null },
        { item: "test_ring", slot: 5, stats: [{ stat: "str", value: 3 }], durability: null },
      ]),
    );
    expect(body.stats.primaries.vit).toEqual({ base: 10, bonus: 3 });
    expect(body.stats.primaries.str).toEqual({ base: 10, bonus: 5 });
    expect(body.primarySources.vit).toEqual([
      { kind: "body", value: 10 },
      { kind: "item", slot: "organ", item: "test_heart", value: 3 },
    ]);
    // 스탯 공격력 = ⌊(STR + VIT) ÷ 2⌋ = ⌊(15 + 13) ÷ 2⌋
    expect(body.combat?.attack.statAttack).toBe(14);
  });

  it("칸 묶음에 맞지 않는 굴린 값은 빼고 읽는다(정의가 바뀐 옛 물건)", () => {
    const body = realCyborgBody(
      catalog,
      record,
      false,
      gear([{ item: "test_ring", slot: 4, stats: [{ stat: "armor_hp", value: 99 }], durability: null }]),
    );
    expect(row(body.stats, "armor_hp")).toBe(row(realCyborgBody(catalog, record, false).stats, "armor_hp"));
  });

  it("1차 스탯 버프(고정값)는 성장값 뒤에 더하고, 디버프는 빼고, ‰ 1차 버프는 넣지 않는다(질문)", () => {
    const buffs = gear(
      [],
      [
        effect({ effect: "food_str", value: 5 }),
        effect({ effect: "curse_agi", kind: "debuff", stat: "agi", value: 2 }),
        effect({ effect: "pm_int", stat: "int", valueMode: "permille", value: 500 }),
        effect({ effect: "atk_up", stat: "attack", valueMode: "permille", value: 300 }),
      ],
    );
    expect(primaryBuffsOf(buffs)).toEqual([
      { id: "curse_agi", stat: "agi", value: -2 },
      { id: "food_str", stat: "str", value: 5 },
    ]);
    const body = realCyborgBody(catalog, record, false, buffs);
    expect(body.stats.primaries.str).toEqual({ base: 10, bonus: 5 });
    expect(body.stats.primaries.agi).toEqual({ base: 10, bonus: -2 });
    expect(body.stats.primaries.int).toEqual({ base: 10, bonus: 0 });
    expect(body.primarySources.str).toEqual([
      { kind: "body", value: 10 },
      { kind: "effect", id: "food_str", value: 5 },
    ]);
  });

  it("부상 불이익(D-514): 성장값 + 버프에서 ‰만큼 빼고(효과 출처 injury), 장비 1차 보너스에는 걸지 않는다. 몸을 다시 만들 까닭은 아니다", () => {
    const injured: UnitGear = { ...gear([], [effect({ effect: "food_str", value: 5 })]), injuryPm: 400 };
    const body = realCyborgBody(catalog, record, false, injured);
    // STR: 10 + 5 = 15 → −⌊15 × 0.4⌋ = −6, 나머지 10 → −4
    expect(body.stats.primaries.str).toEqual({ base: 10, bonus: -1 });
    expect(body.stats.primaries.vit).toEqual({ base: 10, bonus: -4 });
    expect(body.primarySources.str).toEqual([
      { kind: "body", value: 10 },
      { kind: "effect", id: "food_str", value: 5 },
      { kind: "effect", id: "injury", value: -6 },
    ]);
    // 2차 스탯도 깎인 1차로 센다(HP 행)
    const fresh = realCyborgBody(catalog, record, false);
    const hp = (view: typeof body) => view.stats.secondary.find((row) => row.id === "hp")?.value ?? 0;
    expect(hp(body)).toBeLessThan(hp(fresh));
    expect(hasGear({ ...NO_GEAR, injuryPm: 400 })).toBe(false);
  });

  it("실제 스태미나 회복 = 행 값 × min(2, STA 점수 ÷ 적정 STA)(D-511 real_stamina_regen)", () => {
    const fresh = realCyborgBody(catalog, record, false);
    expect(fresh.combat?.staminaRegen).toEqual({ row: 720, score: 10, appropriateMilli: 10_000, real: 720 });
    // 같은 1차 10을 Lv 30으로 보면 적정 39 → 회복이 준다
    const low = realCyborgBody(catalog, { ...record, kPm: { ...record.kPm }, level: 30 }, false);
    const regen = low.combat?.staminaRegen;
    expect(regen?.appropriateMilli).toBe(39_000);
    expect(regen?.real).toBe(
      realStaminaRegen(720, regen?.score ?? 0, regen?.appropriateMilli ?? 0, catalog.coefficients),
    );
  });
});

describe("유닛 상세(기본 몸) · 전투 사양", () => {
  it("기본 몸(휴먼 칸)에도 입은 장비가 든다", () => {
    const vest: GearItem = {
      item: "test_vest",
      slot: 3,
      stats: [
        { stat: "defense_rate", value: 40 },
        { stat: "armor_hp", value: 30 },
      ],
      durability: null,
    };
    const plain = effectiveView(catalog, BASELINE_BASE, NO_GEAR);
    const worn = effectiveView(catalog, BASELINE_BASE, gear([vest]));
    expect(row(worn.stats, "armor_hp")).toBe((row(plain.stats, "armor_hp") ?? 0) + 30);
    expect(worn.slots[3]?.item?.id).toBe("test_vest");
  });

  it("전투 사양: 검이 실제 공격력을 올리고, 맨손이면 맨손 스킬만(D-490), 지팡이는 장비 스킬과 속성 칸을 준다", () => {
    const bare = combatSpecOf(catalog, cyborg, NO_GEAR, place, NOW);
    const armed = combatSpecOf(catalog, cyborg, gear([sword()]), place, NOW);
    expect(bare).toMatchObject({ id: 7, side: 1, party: 1, x: 3, y: 4, buildingMulPm: 2000, cyborg: true });
    expect(bare.attack.weaponAttack).toBe(0);
    expect(armed.attack.weaponAttack).toBe(20);
    expect(armed.attackIntervalMs).toBe(1200);
    expect(bare.weaponFields).toEqual([]);
    expect(armed.weaponFields).toEqual(["physical"]);
    const staff = combatSpecOf(
      catalog,
      cyborg,
      gear([{ item: "fire_staff", slot: 0, stats: [{ stat: "mp", value: 20 }], durability: null }]),
      place,
      NOW,
    );
    expect(staff.weaponFields).toEqual(["elemental"]);
    expect(staff.skills.map((skill) => skill.id)).toEqual(["flame_burst"]);
    expect(staff.mpMax).toBe(bare.mpMax + 20);
    // 부서진 검 = 맨손
    expect(combatSpecOf(catalog, cyborg, gear([sword(0)]), place, NOW)).toEqual(bare);
  });

  it("전투 수치 버프는 남은 시간으로 걸린 효과에 넣고, 끝난 것·1차 버프는 넣지 않는다", () => {
    const buffs = gear(
      [],
      [
        effect({
          effect: "atk_up",
          stat: "attack",
          valueMode: "permille",
          value: 300,
          untilMs: NOW + 90_000,
        }),
        effect({ effect: "slow", kind: "debuff", stat: "move_speed", valueMode: "permille", value: 200 }),
        effect({ effect: "gone", stat: "evade", untilMs: NOW }),
        effect({ effect: "food_str", value: 5 }),
        effect({ effect: "mend", kind: "heal", stat: undefined, valueMode: "permille", value: 300 }),
      ],
    );
    expect(startEffectsOf(buffs, NOW)).toEqual([
      { id: "atk_up", kind: "buff", stat: "attack", valueMode: "permille", value: 300, untilMs: 90_000 },
      { id: "slow", kind: "debuff", stat: "move_speed", valueMode: "permille", value: 200, untilMs: 60_000 },
    ]);
    const spec = combatSpecOf(catalog, cyborg, buffs, place, NOW);
    expect(spec.startEffects?.map((entry) => entry.id)).toEqual(["atk_up", "slow"]);
    // 1차 버프(STR +5)는 사양의 1차 스탯에 든다
    expect(spec.primaries[0]).toBe(15);
    expect(combatSpecOf(catalog, cyborg, NO_GEAR, place, NOW).startEffects).toBeUndefined();
  });
});
