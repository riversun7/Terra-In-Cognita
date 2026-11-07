// 유닛의 실효 몸 — 사이보그 화면(cyborg.get)·유닛 상세(units.list)·생명 수치 최대(src/vitals/)·세계 전투 시작 사양(NPC 런타임 웨이브)이
// 같은 함수 한 벌로 셈한다. docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)".
// - 바탕: 만든 사이보그(저장된 처음 값·K·레벨·환생·속성값, 성장 primaryAtLevel D-417) 또는 [임시] 기본 몸(휴먼 칸, 1차 모두 10, 레벨 1 —
//   저장된 유닛 스탯이 아직 없다, body.ts baselineBody).
// - 입은 장비(보유 물건 item_holdings, 입은 칸만): 굴린 값(N49 285) + 지금 정의의 무기 사양(공격력 칸·적정 STR·INT·DEX·AGI·명중·크리·간격,
//   D-502)·속성·저항·스킬(실효 아이템). 내구도 0인 물건은 아무것도 주지 않는다(N49 286 "0이면 장착 불가", 옛 BattleResult가 0이면 벗김).
//   인공장기·장신구는 1차, 무기·방어구는 2차 행(D-423). 칸마다 더한다(옛 utils/item/equipment.js getEquipmentTotals가 칸마다 더함).
// - 부상 불이익(D-514·D-145 "능력치 감소"): 그 시각 부상 단계의 ‰(설정 칸)만큼 성장값 + 버프를 깎는다(효과 출처 "injury").
// - 걸린 효과(unit_effects, D-501): 1차 스탯 버프·디버프(고정값)는 성장값 뒤에 더한다(48 §2.3). 전투 수치 버프(공격 ‰·방어율·회피·관통·
//   크리 배율·이동 속도·쉴드 재생)는 판정의 걸린 효과로 전투 시작 때 넣는다(sim CombatUnitSpec.startEffects — 효과 합 modifiersOf가
//   그대로 읽는다). 1차 스탯 ‰ 버프는 규칙 모양이 없어 넣지 않는다(질문, 작업 기록).
// - 셈은 모두 @terra/sim 판정 함수다(loadoutOf·computeSecondary·specFromStats·realAttackOf·realHitPm·realCritPm·weaponRatioPm). 새 식은 없다.
import { EFFECT_COMBAT_STATS, PRIMARY_STAT_CODES } from "@terra/content";
import { elementsToArray, sumElementSources, zeroElements } from "@terra/shared/cyborg";
import type { PrimaryStat, RosterCombat, RosterStats } from "@terra/shared/roster";
import {
  type CombatSkill,
  type CombatUnitSpec,
  type ModifierStat,
  type Primaries,
  type StartEffect,
  appropriateMilliOf,
  bareAppropriateMilli,
  basicFieldOf,
  realAttackOf,
  realCritPm,
  realHitPm,
  skillFromData,
  specFromStats,
  weaponRatioPm,
  wearable,
} from "@terra/sim";
import type { CyborgRecord } from "../cyborg/state.ts";
import {
  BASELINE_PRIMARY,
  type BodyParts,
  type BodySpec,
  type BodyView,
  type EquippedSpec,
  type PrimaryBuff,
  bodyParts,
} from "./body.ts";
import type { RosterCatalog } from "./catalog.ts";

/** 유닛이 입은 물건 하나(보유 물건 표 item_holdings 가운데 입은 칸) */
export interface GearItem {
  readonly item: string;
  /** 입은 칸 번호(그 유닛 칸 배치 차례) */
  readonly slot: number;
  /** 굴린 값(만들 때 정해짐) */
  readonly stats: readonly { readonly stat: string; readonly value: number }[];
  /** 내구도(장비 정의에 최대 내구도가 없으면 null = 닳지 않음) */
  readonly durability: number | null;
}

/** 유닛에 걸린 효과 하나(unit_effects + 효과 사전의 종류·수치·값 방식) */
export interface GearEffect {
  readonly effect: string;
  readonly value: number;
  /** 끝나는 실제 시각(ms) */
  readonly untilMs: number;
  readonly kind: string;
  readonly stat: string | undefined;
  readonly valueMode: "flat" | "permille";
}

/** 유닛이 지닌 것(입은 물건·걸린 효과)과 부상 불이익 — 보유 물건 서비스가 읽는다(holdings/world.ts gearOf) */
export interface UnitGear {
  readonly equipped: readonly GearItem[];
  readonly effects: readonly GearEffect[];
  /** 부상 불이익(1차 스탯 ‰ 감소, D-514 — 그 시각의 부상 단계 × 설정 칸). 없으면 0. 몸을 다시 만들 까닭(hasGear)에는 넣지 않는다 */
  readonly injuryPm?: number | undefined;
}

export const NO_GEAR: UnitGear = { equipped: [], effects: [] };

/** 몸 바탕: 만든 사이보그 또는 [임시] 기본 몸(저장된 유닛 스탯이 아직 없는 세계 유닛) */
export type BodyBase =
  | { readonly kind: "cyborg"; readonly record: CyborgRecord }
  | { readonly kind: "baseline" };

export const BASELINE_BASE: BodyBase = { kind: "baseline" };

const PRIMARY_SET: ReadonlySet<string> = new Set(PRIMARY_STAT_CODES);
const COMBAT_STAT_SET: ReadonlySet<string> = new Set(EFFECT_COMBAT_STATS);
const isPrimaryStat = (stat: string | undefined): stat is PrimaryStat =>
  stat !== undefined && PRIMARY_SET.has(stat);
const isModifierStat = (stat: string | undefined): stat is ModifierStat =>
  stat !== undefined && COMBAT_STAT_SET.has(stat);
const isBuffKind = (kind: string): kind is "buff" | "debuff" => kind === "buff" || kind === "debuff";

/** 몸에 드는 물건: 내구도가 남은(또는 닳지 않는) 입은 물건만(N49 286) */
export const usableGear = (gear: UnitGear): readonly GearItem[] =>
  gear.equipped.filter((item) => wearable(item));

/** 몸을 바꾸는 것이 있나(쓸 수 있는 입은 물건 또는 걸린 효과) */
export const hasGear = (gear: UnitGear): boolean => usableGear(gear).length > 0 || gear.effects.length > 0;

/**
 * 1차 스탯 버프(걸린 효과, 효과 ID 차례): 버프·디버프 가운데 1차 스탯을 바꾸는 고정값(flat)만. 디버프는 뺀다.
 * ‰ 버프(valueMode permille)는 1차 스탯에 거는 규칙이 없어 넣지 않는다(질문)
 */
export function primaryBuffsOf(gear: UnitGear): PrimaryBuff[] {
  return gear.effects
    .filter((entry) => isBuffKind(entry.kind) && entry.valueMode === "flat")
    .toSorted((a, b) => (a.effect < b.effect ? -1 : a.effect > b.effect ? 1 : 0))
    .flatMap((entry): PrimaryBuff[] =>
      isPrimaryStat(entry.stat)
        ? [
            {
              id: entry.effect,
              stat: entry.stat,
              value: entry.kind === "debuff" ? -entry.value : entry.value,
            },
          ]
        : [],
    );
}

/**
 * 전투 시작 때 걸려 있는 효과(효과 ID 차례): 전투 수치 버프·디버프만, 남은 시간 = 끝나는 실제 시각 − 전투 시작 시각(빨리감기 전투도
 * 실시간으로 끝나는 시각에 적용하므로 전투 시각 = 실제 시각 − 시작, D-189). 끝난 것은 뺀다
 */
export function startEffectsOf(gear: UnitGear, nowMs: number): StartEffect[] {
  return gear.effects
    .filter((entry) => entry.untilMs > nowMs)
    .toSorted((a, b) => (a.effect < b.effect ? -1 : a.effect > b.effect ? 1 : 0))
    .flatMap((entry): StartEffect[] => {
      const { kind, stat } = entry;
      return isBuffKind(kind) && isModifierStat(stat)
        ? [
            {
              id: entry.effect,
              kind,
              stat,
              valueMode: entry.valueMode,
              value: entry.value,
              untilMs: entry.untilMs - nowMs,
            },
          ]
        : [];
    });
}

const flat = (value: number): Primaries => ({
  str: value,
  dex: value,
  agi: value,
  vit: value,
  int: value,
  wis: value,
});

/** 바탕 + 지닌 것 → 몸 사양(body.ts bodyParts가 셈한다) */
export function bodySpecOf(base: BodyBase, gear: UnitGear): BodySpec {
  const equipped = new Map<number, EquippedSpec>();
  for (const item of usableGear(gear)) equipped.set(item.slot, { item: item.item, values: item.stats });
  const buffs = primaryBuffsOf(gear);
  if (base.kind === "baseline")
    return {
      kind: "human",
      initial: flat(BASELINE_PRIMARY),
      kPm: null,
      level: 1,
      rebirths: 0,
      equipped,
      innateSkills: [],
      source: "baseline",
      buffs,
      injuryPm: gear.injuryPm,
    };
  const { record } = base;
  return {
    kind: "cyborg",
    initial: record.initial,
    kPm: record.kPm,
    level: record.level,
    rebirths: record.rebirths,
    equipped,
    innateSkills: [],
    source: "computed",
    // 장비 밖 속성값(생성·환생 값, D-450). 장비·인공장기 속성값은 loadoutOf가 더한다
    elements: elementsToArray(sumElementSources(record.elements ?? zeroElements(), [])),
    buffs,
    injuryPm: gear.injuryPm,
  };
}

/** 화면 자료(스탯·장비 칸·스킬): 유닛 상세·생명 수치 최대·보유 물건 효과량의 1차 스탯 */
export function effectiveView(catalog: RosterCatalog, base: BodyBase, gear: UnitGear): BodyView {
  return bodyParts(catalog, bodySpecOf(base, gear)).view;
}

/** 화면 1차 스탯 → 판정 1차 스탯(성장값 + 장비·버프) */
export function primariesOfStats(stats: RosterStats): Primaries {
  const p = stats.primaries;
  const at = (stat: PrimaryStat) => p[stat].base + p[stat].bonus;
  return { str: at("str"), dex: at("dex"), agi: at("agi"), vit: at("vit"), int: at("int"), wis: at("wis") };
}

/** 전투 사양에서 바탕 유닛 사양 밖에서 오는 칸(자리·편·이동 간격·건물 피해 배율 등) */
export interface SpecPlace {
  readonly id: number;
  readonly side: number;
  readonly party: number;
  readonly x: number;
  readonly y: number;
  readonly moveIntervalMs: number;
  readonly buildingMulPm: number;
  readonly eye?: number | undefined;
  readonly air?: boolean | undefined;
  readonly commandCap?: number | undefined;
}

/** [임시] 한 칸 1초(C28 전투 속도, 대결·시뮬레이터·전투 실험실과 같다) — 화면 요약이 쓰는 자리 */
const SUMMARY_PLACE: SpecPlace = {
  id: 0,
  side: 0,
  party: 0,
  x: 0,
  y: 0,
  moveIntervalMs: 1000,
  buildingMulPm: 1000,
};

/** 스킬 ID → 전투 스킬(장비 스킬은 등급 1, 전투 실험실·시뮬과 같다). 모르는 ID는 뺀다 */
function skillsFor(catalog: RosterCatalog, ids: readonly string[]): CombatSkill[] {
  const combat = catalog.combat;
  const effects = new Map(combat.effects.map((effect) => [effect.id, effect]));
  const data = new Map(combat.skills.map((skill) => [skill.id, skill]));
  return ids.flatMap((id) => {
    const entry = data.get(id);
    return entry ? [skillFromData(entry, 1, effects)] : [];
  });
}

/** 몸 묶음 → 전투 사양(specFromStats, 계수표 = 실효 값) */
function specOfParts(
  catalog: RosterCatalog,
  spec: BodySpec,
  parts: BodyParts,
  place: SpecPlace,
): CombatUnitSpec {
  const { loadout, kind } = parts;
  return specFromStats(
    {
      ...place,
      stats: loadout.stats,
      weapon: loadout.weapon,
      // 맨손이면 맨손 스킬만(D-490, specFromStats weaponFields)
      bareHanded: loadout.bareHanded,
      naturalWeapon: kind?.naturalWeapon,
      naturalElementalWeapon: kind?.naturalElementalWeapon,
      primaries: loadout.primaries,
      level: spec.level,
      elements: loadout.elements,
      resistPm: loadout.resistPm,
      defenseFlat: loadout.defenseFlat,
      penetrationPm: loadout.penetrationPm,
      cyborg: spec.kind === "cyborg",
      skills: skillsFor(catalog, loadout.skills),
    },
    catalog.coefficients,
  );
}

/**
 * 세계 전투 시작 사양: 바탕 + 입은 장비(무기 사양·굴린 값)·1차 스탯 버프로 2차 스탯과 공격을 셈하고, 전투 수치 버프는 걸린 효과로 넣는다.
 * 자리·편·이동 간격·건물 피해 배율은 place 그대로
 */
export function combatSpecOf(
  catalog: RosterCatalog,
  base: BodyBase,
  gear: UnitGear,
  place: SpecPlace,
  nowMs: number,
): CombatUnitSpec {
  const spec = bodySpecOf(base, gear);
  const out = specOfParts(catalog, spec, bodyParts(catalog, spec), place);
  const startEffects = startEffectsOf(gear, nowMs);
  return startEffects.length > 0 ? { ...out, startEffects } : out;
}

/** 든 무기 아이템 ID(무기 칸의 무기, 양손·종류로 빠지지 않은 것). 맨손이면 null */
function heldWeapon(parts: BodyParts): string | null {
  if (parts.loadout.bareHanded) return null;
  const ignored = new Set(parts.loadout.ignored.map((entry) => entry.index));
  const index = parts.slots.findIndex(
    (slot, at) => slot === "weapon" && parts.equipped[at]?.weapon !== undefined && !ignored.has(at),
  );
  return index < 0 ? null : (parts.equipped[index]?.item ?? null);
}

/**
 * 화면 요약(사이보그 화면 상세 전투 스펙): 판정에 들어가는 공격·명중·크리·간격과 실제 스태미나 회복(D-511). 전투 수치 버프는 판정의 걸린
 * 효과라 여기에 넣지 않는다(보유 물건 판의 걸린 효과가 보인다)
 */
export function combatSummaryOfSpec(catalog: RosterCatalog, spec: BodySpec, parts: BodyParts): RosterCombat {
  const c = catalog.coefficients;
  const unit = specOfParts(catalog, spec, parts, SUMMARY_PLACE);
  const a = unit.attack;
  const weapon = parts.loadout.weapon;
  const cap = c.appropriateCapPm;
  const part = (stat: number, appropriateMilli: number) => ({
    stat,
    appropriateMilli,
    ratioPm: weaponRatioPm(stat, appropriateMilli, cap),
  });
  const agi = parts.loadout.primaries.agi;
  const agiAppropriate = appropriateMilliOf(
    weapon,
    basicFieldOf(weapon),
    bareAppropriateMilli(spec.level, c),
  ).agi;
  return {
    weapon: heldWeapon(parts),
    attack: {
      kind: a.kind,
      statAttack: a.statAttack,
      weaponAttack: a.weaponAttack,
      part: part(a.attackPrimary, a.attackAppropriateMilli),
      real: realAttackOf(a, cap, c),
    },
    hit: { weaponPm: a.weaponHitPm, part: part(a.dex, a.dexAppropriateMilli), real: realHitPm(a, c) },
    crit: { weaponPm: a.weaponCritPm, part: part(a.dex, a.dexAppropriateMilli), real: realCritPm(a, c) },
    interval: { weaponMs: weapon.intervalMs, part: part(agi, agiAppropriate), real: unit.attackIntervalMs },
    staminaRegen: {
      row: Math.max(0, parts.loadout.stats.stamina_regen ?? 0),
      score: unit.staminaScore,
      appropriateMilli: unit.staminaAppropriateMilli ?? unit.staminaScore * 1000,
      real: unit.staminaRegen,
    },
  };
}
