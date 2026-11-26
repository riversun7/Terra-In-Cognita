// 유닛 실효 몸 시험 — 입은 장비(굴린 값·무기 사양, 내구도 > 0만)·인공장기·걸린 효과가 사이보그 화면 스탯·공격 값과 전투 사양에 든다.
// 실제 팩(content/core)으로: 새 사이보그(1차 모두 10, Lv 1)에 시험 검(공격력 20·적정 STR 25·DEX 12·AGI 12)을 쥐면
// 공격력 10 → 18(D-502 사용자 예), 부서진 검은 아무것도 주지 않는다. 장신구 두 칸은 더한다(옛 utils/item/equipment.js getEquipmentTotals).
import {
  EFFECT_COMBAT_STATS,
  itemEntrySchema,
  parseJson,
  skillEntrySchema,
  unitKindEntrySchema,
} from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { DEFAULT_CHARACTER_LOOK } from "@terra/shared/characterLook";
import { zeroElements } from "@terra/shared/cyborg";
import { ROSTER_MODIFIER_STATS } from "@terra/shared/roster";
import { realStaminaRegen } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import type { CyborgRecord } from "../cyborg/state.ts";
import { type RosterContentEntries, rosterCatalogOf } from "./catalog.ts";
import { realCyborgBody } from "./cyborgBody.ts";
import {
  BASELINE_BASE,
  type BodyBase,
  type GearEffect,
  type GearItem,
  NO_GEAR,
  type UnitGear,
  combatSpecOf,
  effectiveView,
  hasGear,
  primariesOfStats,
  primaryBuffsOf,
  rosterMoveOf,
  startEffectsOf,
  walkAgiOf,
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
  look: DEFAULT_CHARACTER_LOOK,
  lookAuto: false,
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
  nationChangedAtMs: null,
  standings: new Map(),
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

describe("걷기 속도(D-540): 실효 AGI → 계산식 walk_speed", () => {
  it("레벨 성장·AGI 버프가 걷기에 들고, 부상 불이익은 깎는다(전투와 같은 AGI)", () => {
    expect(walkAgiOf(catalog, cyborg, NO_GEAR)).toBe(10);
    expect(walkAgiOf(catalog, BASELINE_BASE, NO_GEAR)).toBe(10);
    const grown = { kind: "cyborg", record: { ...record, level: 30 } } as const;
    const agi30 = walkAgiOf(catalog, grown, NO_GEAR);
    expect(agi30).toBe(combatSpecOf(catalog, grown, NO_GEAR, place, NOW).attack.agi);
    expect(agi30).toBeGreaterThan(10);
    const buffed = walkAgiOf(catalog, cyborg, gear([], [effect({ effect: "haste", stat: "agi", value: 6 })]));
    expect(buffed).toBe(16);
    expect(rosterMoveOf(catalog, buffed).walk).toBe(460);
    const hurt = walkAgiOf(catalog, cyborg, { ...NO_GEAR, injuryPm: 500 });
    expect(hurt).toBeLessThan(10);
  });
});

describe("입은 장비 → 사이보그 화면(cyborg.get 몸)", () => {
  it("시험 검을 쥐면 공격력 15 → 23, 명중·간격·크리 배율이 무기를 따른다(D-502, 물리 공격력 STR + ⌊VIT ÷ 2⌋ 2026-11-13)", () => {
    const bare = realCyborgBody(catalog, record, false);
    const armed = realCyborgBody(catalog, record, false, gear([sword()]));
    expect(bare.combat?.weapon).toBeNull();
    expect(bare.combat?.attack).toMatchObject({ statAttack: 15, weaponAttack: 0, real: 15 });
    expect(armed.combat?.weapon).toBe("test_sword");
    expect(armed.combat?.attack).toMatchObject({
      kind: "physical",
      statAttack: 15,
      weaponAttack: 20,
      part: { stat: 10, appropriateMilli: 25_000, ratioPm: 400 },
      real: 23,
    });
    // 명중 = 900 × min(1, DEX 10 ÷ 12) = 749‰, 간격 = 1,000 ÷ 0.833²(무기도 같은 꼴, 2026-11-13) = 1,443ms, 비율 줄은 적정 2배 상한
    expect(armed.combat?.hit.real).toBe(749);
    expect(armed.combat?.interval).toMatchObject({
      real: 1443,
      part: { stat: 10, appropriateMilli: 12_000, ratioPm: 833 },
    });
    // 맨손(사용자 결정 2026-11-12): 크리 = AGI + DEX = 20‰(2%), 명중 늘 1000‰. 검을 쥐면 무기 틀(맨손 표지 없음)
    expect(bare.combat?.crit).toMatchObject({ real: 20, bare: { agi: 10 }, part: { stat: 10 } });
    expect(bare.combat?.hit).toMatchObject({ real: 1000, bare: true });
    // 맨손 간격(사용자 답 1252): 2,000 ÷ (AGI 10 ÷ Lv 1 기준 10)² = 2,000ms. 검은 무기 틀(1,200ms, 맨손 표지 없음)
    expect(bare.combat?.interval).toMatchObject({ real: 2000, bare: true, part: { stat: 10 } });
    expect(armed.combat?.interval.bare).toBeUndefined();
    expect(armed.combat?.crit.bare).toBeUndefined();
    expect(armed.combat?.hit.bare).toBeUndefined();
    // 이동 속도 줄(2026-11-12, D-540): 걷기 = 계산식 walk_speed(AGI 10) = 437 단위/초, 기본(AGI 0) 397·상한 1,589, 전투 걸음 1초
    expect(bare.move).toEqual({
      walk: 437,
      agi: 10,
      walkBase: 397,
      walkCap: 1589,
      cellUnits: 1024,
      mapCells: 256,
      battleMs: 1000,
    });
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
    expect(realCyborgBody(catalog, record, false, gear([sword(1)])).combat?.attack.real).toBe(23);
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
      { kind: "item", slot: "organ_heart", item: "test_heart", value: 3 },
    ]);
    // 스탯 공격력 = STR + ⌊VIT ÷ 2⌋ = 15 + 6(2026-11-13)
    expect(body.combat?.attack.statAttack).toBe(21);
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
    const hp = (view: typeof body) => view.stats.secondary.find((entry) => entry.id === "hp")?.value ?? 0;
    expect(hp(body)).toBeLessThan(hp(fresh));
    expect(hasGear({ ...NO_GEAR, injuryPm: 400 })).toBe(false);
  });

  it("유닛 성장(docs/adr/2026-11-26-unit-growth.md): 저장된 스탯 몸에 성장 K가 있으면 레벨만큼 자란다(사이보그와 같은 식), 없으면 그대로", () => {
    const stats = { str: 20, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 };
    const k = { str: 1000, dex: 1000, agi: 1000, vit: 1000, int: 1000, wis: 1000 };
    const base = (level: number, kPm: typeof k | null): BodyBase => ({
      kind: "stats",
      unitKind: "human",
      primaries: stats,
      kPm,
      level,
      rebirths: 0,
      elements: null,
    });
    // 성장률 100‰ × K 1000‰: 레벨마다 처음 값의 10% → Lv6 STR = 20 × 1.5 = 30
    expect(walkAgiOf(catalog, base(1, k), NO_GEAR)).toBe(10);
    expect(walkAgiOf(catalog, base(6, k), NO_GEAR)).toBe(15);
    expect(primariesOfStats(effectiveView(catalog, base(6, k), NO_GEAR).stats).str).toBe(30);
    // K 없음(수호신): 레벨이 올라도 저장된 스탯 그대로
    expect(primariesOfStats(effectiveView(catalog, base(6, null), NO_GEAR).stats).str).toBe(20);
  });

  it("피로 구간 스탯 감소(사용자 결정 2026-11-26): 1차 스탯 여섯 칸을 ‰만큼 빼고(효과 출처 fatigue), 부상과 따로 세어 더한다. 걷기 AGI도 준다", () => {
    const tired: UnitGear = { ...NO_GEAR, fatiguePm: 300 };
    const body = realCyborgBody(catalog, record, false, tired);
    // 10 → −⌊10 × 0.3⌋ = −3 (여섯 칸 모두)
    for (const stat of ["str", "vit", "int", "wis", "dex", "agi"] as const)
      expect(body.stats.primaries[stat]).toEqual({ base: 10, bonus: -3 });
    expect(body.primarySources.agi).toEqual([
      { kind: "body", value: 10 },
      { kind: "effect", id: "fatigue", value: -3 },
    ]);
    // 부상 400‰ + 피로 300‰: −4, −3
    const both = realCyborgBody(catalog, record, false, { ...NO_GEAR, injuryPm: 400, fatiguePm: 300 });
    expect(both.stats.primaries.str).toEqual({ base: 10, bonus: -7 });
    expect(both.primarySources.str).toEqual([
      { kind: "body", value: 10 },
      { kind: "effect", id: "injury", value: -4 },
      { kind: "effect", id: "fatigue", value: -3 },
    ]);
    // 걷기(AGI)도 함께 느려진다
    expect(walkAgiOf(catalog, { kind: "cyborg", record }, tired)).toBe(7);
    expect(walkAgiOf(catalog, { kind: "cyborg", record }, NO_GEAR)).toBe(10);
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
    expect(armed.attackIntervalMs).toBe(1443);
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

/** 행 목록에서 그 행 값(없으면 0) */
const value = (rows: readonly { id: string; value: number }[], id: string): number =>
  rows.find((entry) => entry.id === id)?.value ?? 0;

describe("사이보그 판 버프 몫(질문 354 → D-515: 기본값과 버프를 나눠 보인다)", () => {
  it("버프가 없으면 몫은 0, 풀이는 2차 스탯과 같다", () => {
    const body = realCyborgBody(catalog, record, false, gear([sword()]), NOW);
    expect(body.buffs).toEqual({
      rows: {},
      attack: 0,
      hit: 0,
      crit: 0,
      interval: 0,
      staminaRegen: 0,
      penetration: { basePm: 0, buffPm: 0 },
      moveSpeedPm: 0,
      modifiers: {
        attack: 0,
        defense_rate: 0,
        evade: 0,
        penetration: 0,
        crit_multiplier: 0,
        move_speed: 0,
        shield_regen: 0,
      },
    });
    expect(body.breakdown.map((entry) => entry.value)).toEqual(
      body.stats.secondary.map((entry) => entry.value),
    );
  });

  it("1차 스탯 버프·전투 수치 버프: 줄 값은 버프 뺀 기본, 몫 = 판정 값 − 기본(판정과 같은 함수)", () => {
    const buffs = gear(
      [],
      [
        effect({ effect: "food_str", value: 5 }),
        effect({ effect: "atk_up", stat: "attack", valueMode: "permille", value: 300 }),
        effect({ effect: "guard", stat: "defense_rate", value: 50 }),
        effect({ effect: "dodge", stat: "evade", value: 30 }),
        effect({ effect: "pierce", stat: "penetration", value: 100 }),
        effect({ effect: "keen", stat: "crit_multiplier", value: 100 }),
        effect({ effect: "slow", kind: "debuff", stat: "move_speed", valueMode: "permille", value: 200 }),
        effect({ effect: "ward", stat: "shield_regen", valueMode: "permille", value: 500 }),
        // 끝난 효과는 몫에 들지 않는다
        effect({ effect: "gone", stat: "evade", value: 999, untilMs: NOW }),
      ],
    );
    const body = realCyborgBody(catalog, record, false, buffs, NOW);
    const shares = body.buffs;
    // 줄 값(풀이·공격 값)은 기본: STR 10 그대로의 물리 공격력 10 + ⌊10 ÷ 2⌋ = 15, 2차 스탯은 버프 든 값 15 + 5 = 20(2026-11-13 B2)
    expect(value(body.breakdown, "physical_attack")).toBe(15);
    expect(value(body.stats.secondary, "physical_attack")).toBe(20);
    expect(shares?.rows.physical_attack).toBe(5);
    // 방어율은 STR이 가중치로 바꾼 몫 + 버프 50‰(withDefenseModifiers), 회피·크리 배율은 버프 그대로
    expect(shares?.rows.defense_rate).toBe(
      value(body.stats.secondary, "defense_rate") + 50 - value(body.breakdown, "defense_rate"),
    );
    expect(shares?.rows.evade).toBe(30);
    expect(shares?.rows.crit_multiplier).toBe(100);
    // 쉴드 재생 = WIS 10 × (1000 + 500) ÷ 1000 − 10
    expect(value(body.breakdown, "shield_regen")).toBe(10);
    expect(shares?.rows.shield_regen).toBe(5);
    // 실제 공격력: 기본 15(맨손), 든 값 20 × 1.3(공격 ‰ 버프 항) = 26 → 몫 11
    expect(body.combat?.attack.real).toBe(15);
    expect(shares?.attack).toBe(11);
    expect(shares?.hit).toBe(0);
    expect(shares?.interval).toBe(0);
    expect(shares?.penetration).toEqual({ basePm: 0, buffPm: 100 });
    expect(shares?.moveSpeedPm).toBe(-200);
    expect(shares?.modifiers).toEqual({
      attack: 300,
      defense_rate: 50,
      evade: 30,
      penetration: 100,
      crit_multiplier: 100,
      move_speed: -200,
      shield_regen: 500,
    });
    // 1차 스탯 줄의 몫은 출처의 효과 칸(그대로)
    expect(body.primarySources.str).toContainEqual({ kind: "effect", id: "food_str", value: 5 });
  });

  it("부상 불이익(D-514)도 걸린 효과의 몫이다: 1차 출처 effect injury와 2차 행 몫이 같은 것을 센다", () => {
    const hurt = realCyborgBody(catalog, record, false, { equipped: [], effects: [], injuryPm: 300 }, NOW);
    // 1차: 성장값 10 − ⌊10 × 300 ÷ 1000⌋ = 7, 출처에 effect injury −3
    expect(hurt.primarySources.vit).toContainEqual({ kind: "effect", id: "injury", value: -3 });
    // 2차 풀이는 불이익 전 기본, 몫은 음수(디버프)
    const plain = realCyborgBody(catalog, record, false, NO_GEAR, NOW);
    expect(hurt.breakdown.map((entry) => entry.value)).toEqual(plain.breakdown.map((entry) => entry.value));
    expect(hurt.buffs?.rows.hp ?? 0).toBeLessThan(0);
    expect(value(hurt.breakdown, "hp") + (hurt.buffs?.rows.hp ?? 0)).toBe(value(hurt.stats.secondary, "hp"));
  });

  it("이동 속도 디버프는 판정 하한(100‰)까지만 몫이 된다", () => {
    const slow = gear(
      [],
      [effect({ effect: "frozen", kind: "debuff", stat: "move_speed", valueMode: "permille", value: 5000 })],
    );
    expect(realCyborgBody(catalog, record, false, slow, NOW).buffs?.moveSpeedPm).toBe(-900);
  });

  it("화면 전투 수치 목록은 효과 사전 목록과 같다", () => {
    expect([...ROSTER_MODIFIER_STATS]).toEqual([...EFFECT_COMBAT_STATS]);
  });
});

describe("꺼진 아이템을 입고 있으면(질문 355 → D-515·D-512)", () => {
  const source = loaded.source;
  if (!source) throw new Error("content pack");
  const entriesIn = <T>(file: string, parse: (raw: unknown) => T): T[] => {
    const parsed: unknown = parseJson(source.files.get(file) ?? "{}");
    const list: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "entries") : [];
    return Array.isArray(list) ? list.map((raw: unknown) => parse(raw)) : [];
  };
  const entries: RosterContentEntries = {
    items: entriesIn("items.json", (raw) => itemEntrySchema.parse(raw)).map((item) =>
      item.id === "test_sword" ? { ...item, enabled: false } : item,
    ),
    skills: entriesIn("skills.json", (raw) => skillEntrySchema.parse(raw)),
    unitKinds: entriesIn("unit_kinds.json", (raw) => unitKindEntrySchema.parse(raw)),
  };
  const off = rosterCatalogOf(source, undefined, undefined, () => entries);

  it("이미 입은 물건은 스탯·무기 사양을 그대로 준다(고르는 목록에는 없다)", () => {
    expect(off.combat.equipment.some((item) => item.id === "test_sword")).toBe(false);
    const body = realCyborgBody(off, record, false, gear([sword()]), NOW);
    expect(body.slots[0]?.item?.id).toBe("test_sword");
    expect(body.combat?.weapon).toBe("test_sword");
    expect(body.combat?.attack.real).toBe(23);
    expect(off.names.items.test_sword).toEqual({ ko: "시험용 검", en: "Test sword" });
    expect(combatSpecOf(off, cyborg, gear([sword()]), place, NOW).attack.weaponAttack).toBe(20);
  });
});
