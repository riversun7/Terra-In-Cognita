// 실험 유닛 → 전투 사양·미리 보기(순수 함수) — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 2절
// 서버·시뮬레이터와 같은 @terra/sim 함수만 쓴다: 성장 primaryAtLevel(D-417, 성장률 = 설정 칸 N5 실효 값), 장비 loadoutOf(칸·묶음 검사
// D-422·D-423), 2차 스탯 computeSecondary·explainSecondary(가중치 표 = 실효 표, 행 식의 LV = 유닛 레벨), 사양 specFromStats(D-465 무기 칸,
// 맨손 적정의 레벨 D-502), 스킬 skillFromData. 화면 요약의 실제 공격력·명중·크리는 판정과 같은 계산식(계수표의 실효 식, realAttackOf·
// realHitPm·realCritPm)이다. 공격력 = 스탯 공격력 + 무기 몫, 명중·크리·공격 간격은 무기의 1차 적정(DEX·AGI) 대비 비율(D-502).
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
  appropriateMilliOf,
  basicFieldOf,
  bareAppropriateMilli,
  computeSecondary,
  explainSecondary,
  itemAt,
  loadoutOf,
  primaryAtLevel,
  realAttackOf,
  realCritPm,
  realHitPm,
  skillFromData,
  skillSlotCount,
  specFromStats,
  specStaminaCostMilli,
  weaponRatioPm,
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
  /** 유닛 레벨(맨손 적정 DEX·AGI, D-502) */
  readonly level: number;
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

/** 직접 값 공격력 칸 → 판정 칸(피해 방식 D-568은 적었을 때만) */
const specField = (value: LabCustomWeapon["physical"]) =>
  value ? { attack: value.attack, ...(value.damage ? { damage: value.damage } : {}) } : undefined;
/** 판정 칸 → 직접 값 공격력 칸 */
const customField = (value: WeaponSpec["physical"]) =>
  value ? { attack: value.attack, ...(value.damage ? { damage: value.damage } : {}) } : null;

/** 직접 값 1차 적정 스탯(0 = 없음) → 판정 칸(적은 칸만, 다 0이면 없음) */
function specAppropriate(value: LabCustomWeapon["appropriate"]): WeaponSpec["appropriate"] {
  const entries = (["str", "int", "dex", "agi"] as const).filter((code) => value[code] > 0);
  return entries.length === 0 ? undefined : Object.fromEntries(entries.map((code) => [code, value[code]]));
}

/** 직접 만든 무기 → 판정 무기 사양 */
export function weaponSpecOf(custom: LabCustomWeapon): WeaponSpec {
  const physical = specField(custom.physical);
  const elemental = specField(custom.elemental);
  const appropriate = specAppropriate(custom.appropriate);
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
    ...(appropriate ? { appropriate } : {}),
    hitPm: custom.hitPm,
    critPm: custom.critPm,
    intervalMs: custom.intervalMs,
    range: custom.range,
    arc: custom.arc,
    staminaCost: custom.staminaCost,
    mpCost: custom.mpCost,
    skillElementsPm: custom.elementsPm,
  };
}

/**
 * 판정 무기 사양 → 직접 값 편집 모양(타고난 무기를 출발값으로 보일 때). 맨손의 레벨 적정(D-502)과 무기 몫 0 규칙은 직접 값 무기에 없어
 * 적정 칸은 0(없음)으로 둔다(직접 값 무기는 맨손이 아닌 무기로 셈한다)
 */
export function customWeaponOf(weapon: WeaponSpec): LabCustomWeapon {
  const a = weapon.unarmed === true ? undefined : weapon.appropriate;
  return {
    physical: customField(weapon.physical),
    elemental: customField(weapon.elemental),
    basic: weapon.basic ?? (weapon.physical ? "physical" : "elemental"),
    appropriate: { str: a?.str ?? 0, int: a?.int ?? 0, dex: a?.dex ?? 0, agi: a?.agi ?? 0 },
    hitPm: weapon.hitPm,
    critPm: weapon.critPm,
    intervalMs: weapon.intervalMs,
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
  /** 유닛 자기 속성값·직접 값(장비 값은 loadoutOf가 더한다) */
  readonly own: {
    readonly elements: readonly number[];
    readonly resistPm: readonly number[];
    readonly defenseFlat: number;
    readonly penetrationPm: number;
  };
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
  const own = {
    elements: unit.elements,
    resistPm: unit.gear.resistPm,
    defenseFlat: unit.gear.defenseFlat,
    penetrationPm: unit.gear.penetrationPm,
  };
  return { kind, slots, equipped, weapon, innate, skillSlots, dropped, own };
}

function loadoutAt(kit: Kit, base: Primaries, rules: LabRules, level: number): Loadout {
  return loadoutOf({
    base,
    slots: kit.slots,
    equipped: kit.equipped,
    table: rules.catalog.statTable,
    unarmed: kit.kind.naturalWeapon,
    // 타고난 무기를 스킬용 무기로 치나(D-490, 크리쳐 참): 무기 칸이 비면 맨손 = 맨손 스킬만
    naturalIsWeapon: kit.kind.naturalWeaponIsWeapon,
    innateSkills: kit.innate.map((skill) => skill.id),
    skillSlots: kit.skillSlots,
    // 행 식의 LV(docs/adr/2026-11-01-formula-editor.md)
    level,
    // 입을 수 있는 유닛 종류(D-494), 유닛 자기 속성값·직접 값 위에 장비 값을 더한다(아이템 편집기 WP-5)
    kind: kit.kind.id,
    ...kit.own,
  });
}

/** 쓰지 않은 장비(양손 무기의 보조 칸·입을 수 없는 종류) → 화면 경고(레벨과 무관해 Lv 하나로 본다) */
const ignoredOf = (loadout: Loadout): LabDropped[] =>
  loadout.ignored.map((entry) => ({
    kind: entry.reason === "two_handed" ? "two_handed" : "unit_kind",
    id: entry.item,
  }));

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
  const loadout = loadoutAt(kit, grown, rules, unit.level);
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
      // 직접 값 무기를 들면 맨손이 아니다. 아니면 장비가 정한 맨손 여부(D-490 맨손은 스킬을 쓸 수 없다, 맨손 스킬 제외)
      bareHanded: kit.weapon ? false : loadout.bareHanded,
      naturalWeapon: kit.kind.naturalWeapon,
      naturalElementalWeapon: kit.kind.naturalElementalWeapon,
      // [임시] 한 칸 1초(C28 전투 속도, 대결·시뮬레이터와 같다)
      moveIntervalMs: 1000,
      primaries: loadout.primaries,
      // 맨손 적정 DEX·AGI의 레벨(D-502 bare_appropriate)
      level: unit.level,
      // 속성값·저항·고정 방어·관통 = 유닛 자기 값 + 장비 값(속성값은 칸마다 10에서 자름, D-450·D-178)
      elements: loadout.elements,
      resistPm: loadout.resistPm,
      defenseFlat: loadout.defenseFlat,
      penetrationPm: loadout.penetrationPm,
      cyborg: kit.kind.id === "cyborg",
      skills: skillsFor(loadout.skills, kit, rules.catalog),
      // 지휘관 정원·승계(D-558): 실험 유닛의 계급과 환생
      commandRank: unit.rank,
      commandRebirths: unit.rebirths,
      moveSpeedPm: loadout.moveSpeedPm,
    },
    rules.coefficients,
  );
  return {
    spec,
    loadout,
    level: unit.level,
    kind: kit.kind,
    initial,
    grown,
    skillSlots: kit.skillSlots,
    weapon,
    dropped: [...kit.dropped, ...ignoredOf(loadout)],
  };
}

/** 공격 사양 하나 → 화면(source = 든 무기 또는 타고난 무기): 스탯 공격력 + 무기 몫(D-502) */
function attackView(
  profile: AttackProfile,
  source: "weapon" | "natural",
  c: CombatCoefficients,
): LabAttackView {
  return {
    source,
    statAttack: profile.statAttack,
    weaponAttack: profile.weaponAttack,
    primary: profile.attackPrimary,
    appropriateMilli: profile.attackAppropriateMilli,
    ratioPm: weaponRatioPm(profile.attackPrimary, profile.attackAppropriateMilli, c.appropriateCapPm),
    realAttack: realAttackOf(profile, c.appropriateCapPm, c),
  };
}

/** 1차(DEX·AGI)·적정(밀리점) → 무기 값에 곱하는 비율(‰, D-502 weaponRatioPm과 같은 식, 상한 = 계수표 N10) */
function appropriateView(stat: number, appropriateMilli: number, c: CombatCoefficients) {
  return { stat, appropriateMilli, ratioPm: weaponRatioPm(stat, appropriateMilli, c.appropriateCapPm) };
}

function combatView(built: BuiltLabUnit, c: CombatCoefficients): LabCombatView {
  const { spec, weapon, kind } = built;
  const a = spec.attack;
  // 든 무기가 타고난 무기면(무기 없음) 기본 공격도 맨손이다. 스킬 기반은 든 무기에 그 칸이 없으면 그 스킬을 못 쓰고(D-490) 화면은
  // 맨손 자료 값을 보인다(맨손 스킬이 쓰는 값)
  const heldNatural = weapon === kind.naturalWeapon;
  const sourceOf = (field: "physical" | "elemental") =>
    !heldNatural && weapon[field] ? "weapon" : "natural";
  const skill = spec.skillAttack ?? { physical: a, elemental: a };
  // 공격 간격의 적정 AGI(밀리점): 판정(specFromStats)과 같은 규칙(맨손은 레벨 식)
  const agiAppropriate = appropriateMilliOf(
    weapon,
    basicFieldOf(weapon),
    bareAppropriateMilli(built.level, c),
  ).agi;
  return {
    attacks: {
      basic: attackView(a, heldNatural ? "natural" : "weapon", c),
      physical: attackView(skill.physical, sourceOf("physical"), c),
      elemental: attackView(skill.elemental, sourceOf("elemental"), c),
    },
    appropriate: {
      hit: appropriateView(a.dex, a.dexAppropriateMilli, c),
      crit: appropriateView(a.dex, a.dexAppropriateMilli, c),
      speed: appropriateView(built.loadout.primaries.agi, agiAppropriate, c),
    },
    maxHp: spec.maxHp,
    armorHp: spec.armorHp,
    shieldHp: spec.shieldHp,
    basic: a.kind,
    weaponAttack: a.weaponAttack,
    realAttack: realAttackOf(a, c.appropriateCapPm, c),
    hitPm: realHitPm(a, c),
    critPm: realCritPm(a, c),
    critMulPm: a.critMulPm,
    attackIntervalMs: spec.attackIntervalMs,
    range: spec.range,
    staminaMax: spec.staminaMax,
    staminaPerAttackMilli: specStaminaCostMilli(spec, spec.staminaCost, c),
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
  const secondary = explainSecondary(loadout.primaries, table, loadout.gear, {}, unit.level).map(
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
    const at = loadoutAt(kit, grownAt(unit, level, rules.growthPm), rules, level);
    const p = at.primaries;
    const values = computeSecondary(p, table, at.gear, {}, level);
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
