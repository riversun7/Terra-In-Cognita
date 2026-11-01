// 실험 유닛 → 전투 사양·미리 보기(순수 함수) — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 2절
// 서버·시뮬레이터와 같은 @terra/sim 함수만 쓴다: 성장 primaryAtLevel(D-417, 성장률 = 설정 칸 N5 실효 값), 장비 loadoutOf(칸·묶음 검사
// D-422·D-423), 2차 스탯 computeSecondary·explainSecondary(가중치 표 = 실효 표), 사양 specFromStats(D-465 무기 칸), 스킬 skillFromData.
// 공식 수는 여기에 적지 않는다(규칙 rules가 실효 표·계수를 준다). 팩에 없는 참조·맞지 않는 칸은 빼고 dropped로 알린다.
// 직접 값 장비는 가상 칸 둘(장신구 = 1차 보너스, 몸 = 2차 행 더하기)로 loadoutOf에 넣는다: 같은 묶음 검사·같은 더하기다.
import type {
  LabAttackView,
  LabCombatView,
  LabCustomWeapon,
  LabDropped,
  LabPreviewResponse,
  LabSecondaryView,
  LabUnit,
} from "@terra/shared/battleLab";
import { PRIMARY_STATS, type PrimaryStat, RULE_STAT_ORDER } from "@terra/shared/roster";
import {
  type AttackProfile,
  type CombatCatalog,
  type CombatCoefficients,
  type CombatSkill,
  type CombatUnitSpec,
  type EquippedItem,
  type Loadout,
  type Primaries,
  type SlotKind,
  type UnitKindDef,
  type WeaponSpec,
  computeSecondary,
  explainSecondary,
  itemAt,
  loadoutOf,
  primaryAtLevel,
  skillFromData,
  skillSlotCount,
  specFromStats,
  staminaCostMilli,
  weaponScaled,
} from "@terra/sim";

/** 계산 규칙(요청 때 실효 값 한 벌): 전투 자료(실효 가중치 표)·전투 계수·성장률 N5·만렙 N7 */
export interface LabRules {
  readonly catalog: CombatCatalog;
  readonly coefficients: CombatCoefficients;
  readonly growthPm: number;
  readonly maxLevel: number;
}

/** 유닛을 만들 수 없음(모르는 종류 등). 프로시저가 BAD_REQUEST invalid_unit으로 바꾼다 */
export class LabUnitError extends Error {
  override readonly name = "LabUnitError";
}

/** 레벨·K 성장이 없는 유닛 종류(D-416 안드로이드: 1차 = 몸체 + 부품). 팩에 성장 칸이 생기면 그 값 */
export const NO_GROWTH_KINDS: ReadonlySet<string> = new Set(["android"]);

/** 직접 값 장비의 가상 장비 ID(화면·사건에는 나오지 않는다) */
const CUSTOM_PRIMARY = "lab_custom_primaries";
const CUSTOM_ROWS = "lab_custom_rows";
/** 레벨 표 줄 수 상한 */
const LEVEL_TABLE_MAX = 200;

export interface BuiltLabUnit {
  /** 자리·편·ID는 전투장이 다시 정한다(0) */
  readonly spec: CombatUnitSpec;
  readonly loadout: Loadout;
  readonly kind: UnitKindDef;
  /** 처음·성장 뒤 1차 */
  readonly initial: Primaries;
  readonly grown: Primaries;
  readonly skillSlots: number;
  /** 든 무기(무기가 없으면 유닛 종류의 타고난 무기) */
  readonly weapon: WeaponSpec;
  readonly dropped: readonly LabDropped[];
}

const toPrimaries = (value: Readonly<Record<PrimaryStat, number>>): Primaries => ({
  str: value.str,
  dex: value.dex,
  agi: value.agi,
  vit: value.vit,
  int: value.int,
  wis: value.wis,
});

/** 직접 값 공격력 칸 → 판정 칸 */
const specField = (value: LabCustomWeapon["physical"]) =>
  value ? { attack: value.attack, attackAppropriate: value.appropriate } : undefined;
/** 판정 칸 → 직접 값 공격력 칸 */
const customField = (value: WeaponSpec["physical"]) =>
  value ? { attack: value.attack, appropriate: value.attackAppropriate } : null;

/** 직접 만든 무기 → 판정 무기 사양 */
export function weaponSpecOf(custom: LabCustomWeapon): WeaponSpec {
  const physical = specField(custom.physical);
  const elemental = specField(custom.elemental);
  // 기본 칸이 무기에 없으면 있는 칸으로(두 칸 다 없으면 서버 검사가 먼저 막는다)
  const basic = (custom.basic === "physical" ? physical : elemental)
    ? custom.basic
    : physical
      ? "physical"
      : "elemental";
  return {
    physical,
    elemental,
    basic,
    hitPm: custom.hitPm,
    hitAppropriate: custom.hitAppropriate,
    critPm: custom.critPm,
    critAppropriate: custom.critAppropriate,
    intervalMs: custom.intervalMs,
    speedAppropriate: custom.speedAppropriate,
    range: custom.range,
    arc: custom.arc,
    staminaCost: custom.staminaCost,
    mpCost: custom.mpCost,
    skillElementsPm: custom.elementsPm,
  };
}

/** 판정 무기 사양 → 직접 값 편집 모양(타고난 무기를 출발값으로 보일 때) */
export function customWeaponOf(weapon: WeaponSpec): LabCustomWeapon {
  return {
    physical: customField(weapon.physical),
    elemental: customField(weapon.elemental),
    basic: weapon.basic ?? (weapon.physical ? "physical" : "elemental"),
    hitPm: weapon.hitPm,
    hitAppropriate: weapon.hitAppropriate,
    critPm: weapon.critPm,
    critAppropriate: weapon.critAppropriate,
    intervalMs: weapon.intervalMs,
    speedAppropriate: weapon.speedAppropriate,
    range: weapon.range,
    arc: weapon.arc,
    staminaCost: weapon.staminaCost,
    mpCost: weapon.mpCost,
    elementsPm: Array.from({ length: 12 }, (_, index) => weapon.skillElementsPm?.[index] ?? 0),
  };
}

/** 성장 뒤 1차(성장 없는 종류는 처음 값 그대로) */
function grownAt(unit: LabUnit, level: number, growthPm: number): Primaries {
  if (NO_GROWTH_KINDS.has(unit.kind)) return toPrimaries(unit.initial);
  const at = (stat: PrimaryStat) => primaryAtLevel(unit.initial[stat], growthPm, unit.kPm[stat], level);
  return { str: at("str"), dex: at("dex"), agi: at("agi"), vit: at("vit"), int: at("int"), wis: at("wis") };
}

interface Kit {
  readonly kind: UnitKindDef;
  readonly slots: readonly SlotKind[];
  readonly equipped: readonly (EquippedItem | null)[];
  readonly weapon: WeaponSpec | null;
  readonly innate: readonly { readonly id: string; readonly grade: number }[];
  readonly skillSlots: number;
  readonly dropped: readonly LabDropped[];
}

/** 유닛 종류·장비 칸·무기·스킬을 고른다(레벨과 무관: 레벨 표가 같은 장비로 줄마다 다시 계산한다) */
function kitOf(unit: LabUnit, rules: LabRules): Kit {
  const { catalog } = rules;
  const kind = catalog.unitKinds.find((entry) => entry.id === unit.kind);
  if (!kind) throw new LabUnitError(`unknown unit kind ${unit.kind}`);
  const dropped: LabDropped[] = [];
  const items = new Map(catalog.equipment.map((item) => [item.id, item]));
  const weaponSlot = kind.slots.indexOf("weapon");
  const equipped: (EquippedItem | null)[] = kind.slots.map(() => null);
  let weapon: WeaponSpec | null = null;
  if (unit.weapon.kind === "item") {
    const def = items.get(unit.weapon.id);
    if (!def?.weapon) dropped.push({ kind: "weapon", id: unit.weapon.id });
    else if (weaponSlot < 0) dropped.push({ kind: "slot", id: unit.weapon.id });
    else equipped[weaponSlot] = itemAt(def, unit.weapon.pm);
  } else if (unit.weapon.kind === "custom") weapon = weaponSpecOf(unit.weapon.spec);
  for (const entry of unit.equipment) {
    const def = items.get(entry.item);
    const slot = kind.slots[entry.slot];
    if (!def) dropped.push({ kind: "item", id: entry.item });
    // 무기 칸은 무기 고르기가 정한다. 칸 종류가 다르거나 이미 찬 칸이면 뺀다
    else if (slot === undefined || entry.slot === weaponSlot || def.slot !== slot || equipped[entry.slot])
      dropped.push({ kind: "slot", id: entry.item });
    else equipped[entry.slot] = itemAt(def, entry.pm);
  }
  // 직접 값: 장신구 칸 = 1차 보너스, 몸 칸 = 2차 행(공격력 두 행·모르는 행은 뺀다, D-438)
  const rowIds = new Set(catalog.statTable.map((row) => row.id));
  const rows = unit.gear.rows.filter((row) => {
    const ok = rowIds.has(row.id) && row.id !== "physical_attack" && row.id !== "elemental_attack";
    if (!ok) dropped.push({ kind: "gear_row", id: row.id });
    return ok && row.value !== 0;
  });
  const primaryValues = PRIMARY_STATS.filter((stat) => unit.gear.primaries[stat] !== 0).map((stat) => ({
    stat,
    value: unit.gear.primaries[stat],
  }));
  const slots: SlotKind[] = [...kind.slots, "accessory", "body"];
  equipped.push(
    primaryValues.length > 0
      ? { item: CUSTOM_PRIMARY, slot: "accessory", values: primaryValues, skills: [] }
      : null,
    rows.length > 0
      ? {
          item: CUSTOM_ROWS,
          slot: "body",
          values: rows.map((row) => ({ stat: row.id, value: row.value })),
          skills: [],
        }
      : null,
  );
  const known = new Set(catalog.skills.map((skill) => skill.id));
  const innate = unit.skills.filter((skill) => {
    if (!known.has(skill.id)) dropped.push({ kind: "skill", id: skill.id });
    return known.has(skill.id);
  });
  const skillSlots = skillSlotCount(
    kind.skillSlots.base,
    unit.rebirths * kind.skillSlots.perRebirth,
    kind.skillSlots.max,
  );
  return { kind, slots, equipped, weapon, innate, skillSlots, dropped };
}

function loadoutAt(kit: Kit, base: Primaries, rules: LabRules): Loadout {
  return loadoutOf({
    base,
    slots: kit.slots,
    equipped: kit.equipped,
    table: rules.catalog.statTable,
    unarmed: kit.kind.naturalWeapon,
    innateSkills: kit.innate.map((skill) => skill.id),
    skillSlots: kit.skillSlots,
  });
}

/** 스킬 ID 목록 → 전투 스킬(고유 스킬은 그 등급, 장비 스킬은 등급 1) */
function skillsFor(ids: readonly string[], kit: Kit, catalog: CombatCatalog): CombatSkill[] {
  const effects = new Map(catalog.effects.map((effect) => [effect.id, effect]));
  const data = new Map(catalog.skills.map((skill) => [skill.id, skill]));
  const grades = new Map(kit.innate.map((skill) => [skill.id, skill.grade]));
  return ids.flatMap((id) => {
    const entry = data.get(id);
    return entry ? [skillFromData(entry, grades.get(id) ?? 1, effects)] : [];
  });
}

/** 실험 유닛 하나 → 전투 사양(자리·편·ID 0). 모르는 종류는 LabUnitError */
export function buildLabUnit(unit: LabUnit, rules: LabRules): BuiltLabUnit {
  const kit = kitOf(unit, rules);
  const initial = toPrimaries(unit.initial);
  const grown = grownAt(unit, unit.level, rules.growthPm);
  const loadout = loadoutAt(kit, grown, rules);
  const weapon = kit.weapon ?? loadout.weapon;
  const spec = specFromStats(
    {
      id: 0,
      side: 0,
      party: 0,
      x: 0,
      y: 0,
      stats: loadout.stats,
      weapon,
      naturalWeapon: kit.kind.naturalWeapon,
      naturalElementalWeapon: kit.kind.naturalElementalWeapon,
      // [임시] 한 칸 1초(C28 전투 속도, 대결·시뮬레이터와 같다)
      moveIntervalMs: 1000,
      primaries: loadout.primaries,
      elements: unit.elements,
      resistPm: unit.gear.resistPm,
      defenseFlat: unit.gear.defenseFlat,
      penetrationPm: unit.gear.penetrationPm,
      cyborg: kit.kind.id === "cyborg",
      skills: skillsFor(loadout.skills, kit, rules.catalog),
    },
    rules.coefficients,
  );
  return {
    spec,
    loadout,
    kind: kit.kind,
    initial,
    grown,
    skillSlots: kit.skillSlots,
    weapon,
    dropped: kit.dropped,
  };
}

/** 공격 사양 하나 → 화면(source = 든 무기 또는 타고난 무기) */
function attackView(
  profile: AttackProfile,
  source: "weapon" | "natural",
  c: CombatCoefficients,
): LabAttackView {
  return {
    source,
    weaponAttack: profile.weaponAttack,
    attackStat: profile.attackStat,
    appropriate: profile.attackAppropriate,
    realAttack: weaponScaled(
      profile.weaponAttack,
      profile.attackStat,
      profile.attackAppropriate,
      c.appropriateCapPm,
    ),
  };
}

/** 점수·적정치 → 무기 값에 곱하는 비율(‰, 무기 틀 D-420: weaponScaled와 같은 식, 상한 = 계수표 N10) */
function appropriateView(stat: number, appropriate: number, c: CombatCoefficients) {
  const ratioPm =
    appropriate <= 0
      ? 1000
      : Math.min(c.appropriateCapPm, Math.floor((Math.max(0, stat) * 1000) / appropriate));
  return { stat, appropriate, ratioPm };
}

function combatView(built: BuiltLabUnit, c: CombatCoefficients): LabCombatView {
  const { spec, weapon, kind } = built;
  const a = spec.attack;
  // 든 무기가 타고난 무기면(무기 없음) 기본 공격도 맨손이다. 스킬 기반은 든 무기에 그 칸이 없으면 맨손·맨손 속성(D-465)
  const heldNatural = weapon === kind.naturalWeapon;
  const sourceOf = (field: "physical" | "elemental") =>
    !heldNatural && weapon[field] ? "weapon" : "natural";
  const skill = spec.skillAttack ?? { physical: a, elemental: a };
  return {
    attacks: {
      basic: attackView(a, heldNatural ? "natural" : "weapon", c),
      physical: attackView(skill.physical, sourceOf("physical"), c),
      elemental: attackView(skill.elemental, sourceOf("elemental"), c),
    },
    appropriate: {
      hit: appropriateView(a.hitStat, a.hitAppropriate, c),
      crit: appropriateView(a.critStat, a.critAppropriate, c),
      speed: appropriateView(built.loadout.stats["action_speed"] ?? 0, weapon.speedAppropriate, c),
    },
    maxHp: spec.maxHp,
    armorHp: spec.armorHp,
    shieldHp: spec.shieldHp,
    basic: a.kind,
    weaponAttack: a.weaponAttack,
    realAttack: weaponScaled(a.weaponAttack, a.attackStat, a.attackAppropriate, c.appropriateCapPm),
    hitPm: weaponScaled(a.weaponHitPm, a.hitStat, a.hitAppropriate, c.appropriateCapPm),
    critPm: weaponScaled(a.weaponCritPm, a.critStat, a.critAppropriate, c.appropriateCapPm),
    critMulPm: a.critMulPm,
    attackIntervalMs: spec.attackIntervalMs,
    range: spec.range,
    staminaMax: spec.staminaMax,
    staminaPerAttackMilli: staminaCostMilli(spec.staminaCost, spec.staminaScore, c),
    staminaRegen: spec.staminaRegen,
    mpMax: spec.mpMax,
    mpRegen: spec.mpRegen,
    shieldRegen: spec.shieldRegen,
    defenseRatePm: spec.defense.defenseRatePm,
    elementalDefenseRatePm: spec.defense.elementalDefenseRatePm,
    evadePm: spec.defense.evadePm,
    sight: spec.sight,
  };
}

/** 화면 차례(PRIMARY_STATS) 자리 */
const screenOrder = (stat: PrimaryStat): number => PRIMARY_STATS.indexOf(stat);

/** 미리 보기: 1차 출처·2차 풀이·전투 요약·스킬 칸·레벨 표(Lv 1 → max(만렙, 유닛 레벨), 상한 200) */
export function previewLabUnit(unit: LabUnit, rules: LabRules): Omit<LabPreviewResponse, "revision"> {
  const built = buildLabUnit(unit, rules);
  const kit = kitOf(unit, rules);
  const table = rules.catalog.statTable;
  const { loadout } = built;
  const source = (stat: PrimaryStat) => ({
    initial: built.initial[stat],
    grown: built.grown[stat],
    bonus: loadout.primaries[stat] - built.grown[stat],
    total: loadout.primaries[stat],
  });
  const secondary = explainSecondary(loadout.primaries, table, loadout.gear).map(
    (row): LabSecondaryView => ({
      id: row.id,
      shape: row.shape,
      value: row.value,
      base: row.base,
      terms: row.terms
        .flatMap((term) => {
          const stat = RULE_STAT_ORDER[term.index];
          return stat ? [{ stat, value: term.value, weightPm: term.weightPm }] : [];
        })
        .toSorted((a, b) => screenOrder(a.stat) - screenOrder(b.stat)),
      weighted: row.weighted,
      extra: row.extra,
      score: row.score,
      cap: row.cap,
      halfConstant: row.halfConstant,
    }),
  );
  const last = Math.min(LEVEL_TABLE_MAX, Math.max(rules.maxLevel, unit.level));
  const levels = Array.from({ length: last }, (_, index) => {
    const level = index + 1;
    const at = loadoutAt(kit, grownAt(unit, level, rules.growthPm), rules);
    const p = at.primaries;
    const values = computeSecondary(p, table, at.gear);
    return {
      level,
      primaries: { str: p.str, vit: p.vit, int: p.int, wis: p.wis, dex: p.dex, agi: p.agi },
      secondary: table.map((row) => values[row.id] ?? 0),
    };
  });
  return {
    primaries: {
      str: source("str"),
      vit: source("vit"),
      int: source("int"),
      wis: source("wis"),
      dex: source("dex"),
      agi: source("agi"),
    },
    secondary,
    combat: combatView(built, rules.coefficients),
    skills: { slots: built.skillSlots, used: [...loadout.skills] },
    dropped: built.dropped,
    levels,
  };
}
