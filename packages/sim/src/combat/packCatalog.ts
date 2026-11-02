// 콘텐츠 팩 항목 → 전투 자료 — 실행 도구(cli/common.ts)와 서버가 같이 쓴다. docs/adr/2026-10-31-combat-core.md 7절
// 팩 형식(zod)은 모른다: 이미 검증·파싱한 항목을 받는다(타입만 가져온다). 켜진 항목만, 참조는 ID 문자열로.
// 꺼진(또는 없는) 참조는 거른다(docs/adr/2026-11-01-skill-editor.md 2절): 켜진 장비가 가리키는 꺼진 스킬 ID, 켜진 스킬이 가리키는
// 꺼진 효과 줄. 편집기로 스킬·효과를 꺼도 그것을 주는 장비·스킬로 전투 사양을 만들 때 던지지 않게 한다(뺀 것은 droppedReferences).
// 행 식(stat_rows formula)과 전투 계산식(formulas)은 읽은 식 나무로 바꾼다(팩 검사가 이미 본 식, 틀리면 던진다).
// 장비 전투 칸(아이템 편집기 WP-5): 속성값·저항·고정 방어·관통·양손·입을 수 있는 유닛 종류를 장비 정의로 옮긴다. 무기의 1차 적정
// 스탯(D-502)은 무기 사양에 그대로 싣는다(판정이 1차 스탯과 바로 견준다). 크리쳐 보유·내구도·무기 종류·탄약 연결은 전투가 아직 읽지
// 않아 옮기지 않는다(조우·내구도·탄약 실행 줄기).
import type {
  EffectEntry,
  FormulaEntry,
  ItemEntry,
  SkillEntry,
  StatRowEntry,
  UnitKindEntry,
} from "@terra/content";
import { STAT_FORMULA_VARS, compileFormulaOrThrow } from "@terra/shared/formula";
import type { CombatCatalog } from "./catalog.ts";
import type { EffectDef, ModifierStat } from "./effects.ts";
import type { EquipDef, GearCombat } from "./equipment.ts";
import { type CombatFormulaSet, combatFormulaSetFrom } from "./formulas.ts";
import type { SkillData } from "./skills.ts";
import type { StatRow } from "./stats.ts";
import type { WeaponSpec } from "./unitSpec.ts";

type PackWeapon = NonNullable<NonNullable<ItemEntry["equip"]>["weapon"]>;
type PackEquip = NonNullable<ItemEntry["equip"]>;

/**
 * 팩 무기 사양 → 전투 무기 사양(숫자 칸과 1차 적정 스탯 D-502). 양손은 장비 정의(EquipDef twoHanded)로 옮기고, 탄약 연결은 전투가
 * 아직 읽지 않아 뺀다(전투 사양·저장된 전투 시작 자료에 섞이지 않게)
 */
export function weaponSpecOf(weapon: PackWeapon): WeaponSpec {
  const { twoHanded: _twoHanded, ammo: _ammo, ...spec } = weapon;
  return spec;
}

const COMBAT_STATS: readonly string[] = [
  "attack",
  "defense_rate",
  "evade",
  "penetration",
  "crit_multiplier",
  "move_speed",
  "shield_regen",
] satisfies readonly ModifierStat[];
const isCombatStat = (stat: string): stat is ModifierStat => COMBAT_STATS.includes(stat);

/** 효과의 수치 → 전투 수치(1차 스탯 버프는 전투가 아직 읽지 않아 없음) */
function combatStatOf(stat: EffectEntry["stat"]): ModifierStat | undefined {
  return stat !== undefined && isCombatStat(stat) ? stat : undefined;
}

/** 팩 장비의 전투 칸(적은 것만): 속성값 출처(칸 ID → 값)·저항·고정 방어·관통·양손·입을 수 있는 유닛 종류 */
function gearCombatOfPack(equip: PackEquip): GearCombat {
  const combat = equip.combat;
  return {
    ...(equip.elements && equip.elements.length > 0
      ? { elements: Object.fromEntries(equip.elements.map((cell) => [cell.element, cell.value])) }
      : {}),
    ...(combat?.resistPm === undefined ? {} : { resistPm: combat.resistPm }),
    ...(combat?.defenseFlat === undefined ? {} : { defenseFlat: combat.defenseFlat }),
    ...(combat?.penetrationPm === undefined ? {} : { penetrationPm: combat.penetrationPm }),
    ...(equip.weapon?.twoHanded === true ? { twoHanded: true } : {}),
    ...(equip.kinds === undefined ? {} : { kinds: equip.kinds.map((kind) => kind.id) }),
  };
}

const idOf = (ref: { readonly id: string }): string => ref.id;
const STAT_VARS = STAT_FORMULA_VARS.map((item) => item.name);

/** 팩 행(켜진 것) → sim 가중치 표 행. formula가 있으면 읽은 식을 싣는다 */
export function statRowFrom(row: StatRowEntry): StatRow {
  const formula = row.formula === undefined ? undefined : compileFormulaOrThrow(row.formula, STAT_VARS);
  const extra = formula ? { formula } : {};
  return row.shape === "quantity"
    ? { id: row.id, shape: "quantity", base: row.base, weights: row.weights, ...extra }
    : {
        id: row.id,
        shape: "probability",
        cap: row.cap,
        halfConstant: row.halfConstant,
        weights: row.weights,
        ...extra,
      };
}

/** 팩 formulas 항목 → 전투 계산식 묶음(빠진 칸은 기본 식) */
export function combatFormulasFromPack(entries: readonly FormulaEntry[]): CombatFormulaSet {
  return combatFormulaSetFrom(Object.fromEntries(entries.map((entry) => [entry.id, entry.expression])));
}

/** 전투 자료로 옮기는 팩 분류 */
export interface CombatPackEntries {
  readonly statRows: readonly StatRowEntry[];
  readonly effects: readonly EffectEntry[];
  readonly skills: readonly SkillEntry[];
  readonly items: readonly ItemEntry[];
  readonly unitKinds: readonly UnitKindEntry[];
}

/** 거른 참조: 켜진 장비 → 꺼졌거나 없는 스킬, 켜진 스킬 → 꺼졌거나 없는 효과 */
export interface DroppedReferences {
  readonly itemSkills: readonly { readonly item: string; readonly skill: string }[];
  readonly skillEffects: readonly { readonly skill: string; readonly effect: string }[];
}

/** 켜진 장비·스킬이 가리키는 꺼진(또는 없는) 스킬·효과(서버가 스냅숏마다 한 번 기록한다) */
export function droppedReferences(pack: CombatPackEntries): DroppedReferences {
  const enabledSkills = new Set(pack.skills.filter((entry) => entry.enabled).map((entry) => entry.id));
  const enabledEffects = new Set(pack.effects.filter((entry) => entry.enabled).map((entry) => entry.id));
  return {
    itemSkills: pack.items.flatMap((item) =>
      item.enabled && item.equip
        ? (item.equip.skills ?? [])
            .map(idOf)
            .filter((skill) => !enabledSkills.has(skill))
            .map((skill) => ({ item: item.id, skill }))
        : [],
    ),
    skillEffects: pack.skills.flatMap((skill) =>
      skill.enabled
        ? skill.effects
            .map((part) => idOf(part.effect))
            .filter((effect) => !enabledEffects.has(effect))
            .map((effect) => ({ skill: skill.id, effect }))
        : [],
    ),
  };
}

/**
 * 팩 아이템 하나 → 장비 정의(장비가 아니면 undefined). 꺼진(또는 없는) 스킬은 뺀다(skillsOf가 모르는 스킬에서 던지지 않게).
 * 아이템 편집기 미리 보기(서버)가 저장 전 초안에 같은 변환을 쓴다
 */
export function equipDefOf(item: ItemEntry, enabledSkills: ReadonlySet<string>): EquipDef | undefined {
  const equip = item.equip;
  if (!equip) return undefined;
  const weapon = equip.weapon ? weaponSpecOf(equip.weapon) : undefined;
  return {
    id: item.id,
    slot: equip.slot,
    stats: equip.stats.map((range) => ({
      stat: typeof range.stat === "string" ? range.stat : idOf(range.stat),
      min: range.min,
      max: range.max,
    })),
    weapon,
    skills: (equip.skills ?? []).map(idOf).filter((skill) => enabledSkills.has(skill)),
    ...gearCombatOfPack(equip),
  };
}

export function combatCatalogFrom(pack: CombatPackEntries): CombatCatalog {
  const enabledSkills = new Set(pack.skills.filter((entry) => entry.enabled).map((entry) => entry.id));
  const enabledEffects = new Set(pack.effects.filter((entry) => entry.enabled).map((entry) => entry.id));
  const statTable = pack.statRows.filter((row) => row.enabled).map(statRowFrom);
  const effects = pack.effects
    .filter((entry) => entry.enabled)
    .map(
      (entry): EffectDef => ({
        id: entry.id,
        kind: entry.kind,
        // 1차 스탯 버프(요리 버프 D-472)는 전투가 아직 읽지 않는다: 수치 없는 버프로 둔다(modifiersOf가 건너뜀)
        stat: combatStatOf(entry.stat),
        valueMode: entry.valueMode,
        durationMs: entry.durationMs,
        tickMs: entry.tickMs,
        stacking: entry.stacking,
        maxStacks: entry.maxStacks,
        status: entry.status,
        resist: entry.resist,
      }),
    );
  const skills = pack.skills
    .filter((entry) => entry.enabled)
    .map(
      (entry): SkillData => ({
        id: entry.id,
        shape: entry.shape,
        trigger: entry.trigger,
        resource: entry.resource,
        cost: entry.cost,
        castMs: entry.castMs,
        cooldownMs: entry.cooldownMs,
        target: entry.target,
        range: entry.range,
        radius: entry.radius,
        chain: entry.chain,
        damage: entry.damage,
        base: entry.base,
        weaponField: entry.weaponField,
        bareHand: entry.bareHand,
        formula: entry.formula,
        conditions: entry.conditions.map((part) =>
          part.part === "target_has" ? { part: "target_has", effect: idOf(part.effect) } : part,
        ),
        // 꺼진(또는 없는) 효과 줄은 뺀다(skillFromData가 모르는 효과에서 던지지 않게)
        effects: entry.effects
          .filter((part) => enabledEffects.has(idOf(part.effect)))
          .map((part) => ({
            effect: idOf(part.effect),
            value: part.value,
            chancePm: part.chancePm,
            durationMs: part.durationMs,
          })),
        gradePm: entry.gradePm,
      }),
    );
  const equipment = pack.items.flatMap((item): EquipDef[] => {
    const def = item.enabled ? equipDefOf(item, enabledSkills) : undefined;
    return def ? [def] : [];
  });
  const unitKinds = pack.unitKinds
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      id: entry.id,
      slots: entry.slots,
      skillSlots: entry.skillSlots,
      naturalWeapon: entry.naturalWeapon,
      naturalElementalWeapon: entry.naturalElementalWeapon,
      // 적지 않았으면 무기 칸이 없는 종류(크리쳐)만 타고난 무기를 무기로 친다(D-490 기술 기본값)
      naturalWeaponIsWeapon: entry.naturalWeaponIsWeapon ?? !entry.slots.includes("weapon"),
    }));
  return { statTable, effects, skills, equipment, unitKinds };
}
