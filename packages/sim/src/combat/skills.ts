// 스킬 — docs/adr/2026-10-31-combat-core.md 7절, 기획 D-415·D-418(자원)·D-426~D-428(스킬 = 부품 조합)
// 스킬 자료(SkillData)는 콘텐츠 팩 `skills`의 모양이다: 공식 부품·조건 부품·효과 부품(효과 사전 코드)·모양 부품
// (대상·범위·사거리·시전·쿨·자원)과 등급별 값 표(‰). skillFromData가 등급을 얹어 전투용(CombatSkill)으로 바꾼다.
// 판정 쪽: 쓸 수 있는 스킬과 대상을 목록 차례로 고르고(pickSkill), 자원·쿨을 쓰고(startSkill), 시전이 끝나면 대상에게 푼다(resolveSkill).
// 대상 모양: 적 하나·목표 둘레(반지름)·연쇄(chain), 자기, 시전자 둘레 아군(반지름), 아군 하나(반지름 0·사거리 ≥ 1). 보는 쪽용 모양 칸은
// shape(ADR "바뀜 (2026-11-01, 마법 스킬)").
// [임시] 부품 종류·등급 표 적용 방식·AI(목록 앞 스킬부터)·연쇄·아군 고르기는 기술 기본안이다(질문 260~264).
// 스킬석 인챈트·유전자 추출·스킬 생성기 화면은 뒤 단계(D2)다.
import { type CombatCoefficients, specStaminaCostMilli } from "./coefficients.ts";
import {
  type SkillCurve,
  closeShotPm,
  dotTotalPm,
  magicDistancePm,
  magicTargetsPm,
  moveCoefficientsOf,
  multishotPm,
  rangeIntervalPm,
  scalePm,
} from "./curves.ts";
import { type CombatDisplace, DISPLACE_EFFECT_IDS, type SkillDisplace, type SkillMove } from "./moveParts.ts";
import { moveSkillAllowed } from "./moveAi.ts";
import { type EffectDef, applyEffect, hasEffect, hasStatus, modifiersOf, statusResistPm } from "./effects.ts";
import {
  type AttackProfile,
  type SkillFormula,
  healAmount,
  resolveAttack,
  skillAttack,
  withAttackModifiers,
  withDefenseModifiers,
} from "./formula.ts";
import type { UnitState } from "./battleTypes.ts";
import type { BattleTrace } from "./battleTrace.ts";
import { newAttackStages, recordApplied } from "./attackStages.ts";

export type SkillFormulaPart =
  | { readonly part: "attack_mul"; readonly pm: number }
  | { readonly part: "weapon_add"; readonly value: number }
  | { readonly part: "element"; readonly element: number; readonly pm: number }
  | { readonly part: "penetration"; readonly pm: number }
  | { readonly part: "flat"; readonly value: number }
  | { readonly part: "heal"; readonly pm: number }
  | { readonly part: "shield"; readonly pm: number };

export type SkillCondition =
  | { readonly part: "appropriate_met" }
  | { readonly part: "self_hp_below"; readonly pct: number }
  | { readonly part: "target_hp_below"; readonly pct: number }
  | { readonly part: "target_has"; readonly effect: string };

export interface SkillEffectData {
  readonly effect: string;
  readonly value: number;
  readonly chancePm: number;
  /** 지속(ms, 0 = 전투 내내). 없으면 효과 사전의 기본 지속 */
  readonly durationMs?: number | undefined;
}

/**
 * 보는 쪽(전투 재생·화면)이 그림을 고르는 모양(팩 `shape`, ADR "바뀜 (2026-11-01, 마법 스킬)"). 판정은 대상·사거리·반지름·연쇄 칸으로
 * 하고, 팩 검사가 모양과 그 칸이 맞는지 본다: single = 적 하나에 바로(근접·지면), projectile = 적 하나에 날아가는 것(사거리 2 이상),
 * area = 목표 둘레 반지름 안 적 모두, chain = 적에서 적으로 튐, heal = 자기·아군 체력 회복, buff = 자기·아군 효과·쉴드 회복,
 * debuff = 피해 없이 적에게 효과, move = 피해 없이 자기 몸만 옮김(돌진·도약·점멸·뒷걸음, docs/adr/2026-11-15-combat-moves.md)
 */
export type SkillShape = "single" | "projectile" | "area" | "chain" | "heal" | "buff" | "debuff" | "move";

/** 연쇄(모양 chain): 첫 대상 포함 최대 대상 수, 튐 거리(칸, 앞 대상에서), 튈 때마다 피해 배율(‰) */
export interface SkillChain {
  readonly targets: number;
  readonly jump: number;
  readonly falloffPm: number;
}

/** 팩 `skills` 항목의 모양(참조는 ID 문자열) */
export interface SkillData {
  readonly id: string;
  readonly shape: SkillShape;
  readonly trigger: "active" | "passive";
  readonly resource: "stamina" | "mp";
  readonly cost: number;
  readonly castMs: number;
  readonly cooldownMs: number;
  readonly target: "enemy" | "self" | "ally";
  readonly range: number;
  readonly radius: number;
  /** 연쇄(모양 chain만) */
  readonly chain?: SkillChain | undefined;
  readonly damage: "physical" | "elemental" | "none";
  /** 기반(D-463): 물리 무기·물리 공격력 / 속성 무기·속성 공격력. 피해를 주면 damage와 같다 */
  readonly base: "physical" | "elemental";
  /**
   * 필요한 무기 칸(D-490): 든 무기에 이 칸이 있어야 쓴다. any = 칸 하나라도 있는 무기. 없으면 기반과 같은 칸.
   * 피해를 주는 스킬은 기반과 같아야 한다(팩 검사)
   */
  readonly weaponField?: SkillWeaponField | undefined;
  /** 맨손 스킬(D-490): 무기 없이도 쓰고, 늘 유닛 종류의 타고난 무기(물리 기반)·맨손 속성 자료(속성 기반)로 센다 */
  readonly bareHand?: boolean | undefined;
  readonly formula: readonly SkillFormulaPart[];
  readonly conditions: readonly SkillCondition[];
  readonly effects: readonly SkillEffectData[];
  /** 등급별 값 배율(‰). 등급 g는 g − 1번째, 없으면 마지막 */
  readonly gradePm: readonly number[];
  /** 자기 몸 이동 부품(돌진·도약·점멸·뒷걸음·은신·감지, docs/adr/2026-11-15-combat-moves.md 2절). 없으면 옛 스킬 */
  readonly move?: SkillMove | undefined;
  /** 맞은 대상 옮김(밀치기·끌어오기·묶기) */
  readonly displace?: SkillDisplace | undefined;
  /**
   * 고른 계수 곡선(curves.ts, ADR 3절). 칸이 없으면 공격 스킬(적 대상·피해 있음)은 DEFAULT_ATTACK_SKILL_CURVES(사거리-공속 맞바꿈 켬,
   * D-573 2009), 그 밖은 없음. 적으면 적은 목록이 전부다(빈 목록 []이면 끔 — 무기 curves와 같은 방식)
   */
  readonly curves?: readonly SkillCurve[] | undefined;
  /** 연사 수(2~8, 대상 하나 모양만). 없으면 한 발 */
  readonly shots?: number | undefined;
}

/** 스킬이 필요로 하는 무기 칸(D-490): 물리·속성 칸, 또는 아무 칸 */
export type SkillWeaponField = "physical" | "elemental" | "any";

export interface CombatSkill extends SkillFormula {
  readonly id: string;
  readonly shape: SkillShape;
  readonly trigger: "active" | "passive";
  readonly resource: "stamina" | "mp";
  readonly cost: number;
  readonly castMs: number;
  readonly cooldownMs: number;
  readonly target: "enemy" | "self" | "ally";
  readonly range: number;
  readonly radius: number;
  readonly chain: SkillChain | null;
  /** 필요한 무기 칸(D-490, 기본값 = 기반) */
  readonly weaponField: SkillWeaponField;
  /** 맨손 스킬(D-490) */
  readonly bareHand: boolean;
  readonly flat: number;
  readonly healPm: number;
  /** 쉴드 회복(대상 최대 쉴드 HP의 ‰, 공식 부품 shield) */
  readonly shieldPm: number;
  readonly conditions: readonly SkillCondition[];
  readonly effects: readonly {
    readonly def: EffectDef;
    readonly value: number;
    readonly chancePm: number;
    readonly durationMs: number;
  }[];
  /**
   * 움직임 부품·곡선(docs/adr/2026-11-15-combat-moves.md). 자료에 있을 때만 칸을 둔다(옛 스킬의 상태 JSON이 그대로 — 스냅숏·지문)
   */
  readonly move?: SkillMove | undefined;
  readonly displace?: CombatDisplace | undefined;
  readonly curves?: readonly SkillCurve[] | undefined;
  readonly shots?: number | undefined;
}

export interface CastState {
  readonly skill: number;
  readonly target: number;
  readonly atMs: number;
}

const ELEMENTS = 12;

/** 자료 + 등급 → 전투용 스킬. 등급 배율은 공식·효과 값에 곱한다(공격 배율은 1000을 넘는 몫에만) */
export function skillFromData(
  data: SkillData,
  grade: number,
  effects: ReadonlyMap<string, EffectDef>,
): CombatSkill {
  const scale = data.gradePm[Math.max(0, grade - 1)] ?? data.gradePm.at(-1) ?? 1000;
  const scaled = (value: number): number => Math.trunc((value * scale) / 1000);
  let attackMulPm = 1000;
  let weaponAdd = 0;
  let penetrationPm = 0;
  let flat = 0;
  let healPm = 0;
  let shieldPm = 0;
  const elementPm = Array.from({ length: ELEMENTS }, () => 0);
  for (const part of data.formula) {
    if (part.part === "attack_mul") attackMulPm = 1000 + scaled(part.pm - 1000);
    else if (part.part === "weapon_add") weaponAdd += scaled(part.value);
    else if (part.part === "penetration") penetrationPm += scaled(part.pm);
    else if (part.part === "flat") flat += scaled(part.value);
    else if (part.part === "heal") healPm += scaled(part.pm);
    else if (part.part === "shield") shieldPm += scaled(part.pm);
    else elementPm[part.element] = (elementPm[part.element] ?? 0) + scaled(part.pm);
  }
  return {
    id: data.id,
    shape: data.shape,
    trigger: data.trigger,
    resource: data.resource,
    cost: data.cost,
    castMs: data.castMs,
    cooldownMs: data.cooldownMs,
    target: data.target,
    range: data.range,
    radius: data.radius,
    chain: data.chain ?? null,
    weaponField: data.weaponField ?? data.base,
    bareHand: data.bareHand === true,
    damage: data.damage,
    base: data.base,
    attackMulPm,
    weaponAdd,
    penetrationPm,
    elementPm,
    flat,
    healPm,
    shieldPm,
    conditions: data.conditions,
    effects: data.effects.map((part) => {
      const def = effects.get(part.effect);
      if (!def) throw new RangeError(`skill ${data.id}: unknown effect ${part.effect}`);
      return {
        def,
        value: scaled(part.value),
        chancePm: part.chancePm,
        durationMs: part.durationMs ?? def.durationMs,
      };
    }),
    // 움직임 부품·곡선은 있을 때만(칸 단위·지속은 등급으로 바꾸지 않는다)
    ...(data.move ? { move: data.move } : {}),
    ...(data.displace ? { displace: displaceOf(data.displace, effects) } : {}),
    ...curvesOf(data),
    ...(data.shots !== undefined && data.shots > 1 ? { shots: data.shots } : {}),
  };
}

/**
 * 곡선 칸을 적지 않은 공격 스킬의 곡선(D-573 2009 "스킬 말하는거고 무기도 포함이다. 장점과 단점으로 개성을 확실히": 사거리-공속 맞바꿈은
 * 공격 스킬과 무기 모두, 물리·속성 가리지 않음). 스킬은 자기 사거리로 자기 맞바꿈을 갖는다 — 무기 몫은 기본 공격에만(D-572 2008)
 */
export const DEFAULT_ATTACK_SKILL_CURVES: readonly SkillCurve[] = ["range_interval"];

/** 공격 스킬: 적을 대상으로 피해를 주는 스킬(D-573 2009의 "스킬" — 회복·버프·피해 없는 저주는 빼고, 질문 2171) */
export function isAttackSkill(data: { readonly target: string; readonly damage: string }): boolean {
  return data.target === "enemy" && data.damage !== "none";
}

/**
 * 전투용 스킬의 곡선 칸: 자료 칸이 있으면 그대로, 없으면 사거리 2 이상 공격 스킬만 기본 곡선(사거리 1 이하는 예산 1000이라 칸을 두지 않는다 —
 * 근접 스킬의 상태 JSON 모양 그대로). 빈 목록이면 칸을 두지 않는다. 기본은 스킬을 만들 때 싣는다 — 저장된 시작 자료의 스킬(진행 중 전투)은
 * 칸이 없어 옛 셈을 이어 간다
 */
function curvesOf(data: SkillData): { curves?: readonly SkillCurve[] } {
  const curves = data.curves ?? (isAttackSkill(data) && data.range > 1 ? DEFAULT_ATTACK_SKILL_CURVES : []);
  return curves.length > 0 ? { curves } : {};
}

/**
 * 대상 옮김 부품에 효과 사전 항목(밀림 저항, 질문 1806 → D-429)을 싣는다. 항목이 없거나 꺼졌거나 종류가 다르면 def 없이(계수표 기본 저항).
 * 자료의 effect ID 칸은 싣지 않는다(def가 대신한다)
 */
function displaceOf(part: SkillDisplace, effects: ReadonlyMap<string, EffectDef>): CombatDisplace {
  const base: SkillDisplace =
    part.kind === "root"
      ? { kind: "root", durationMs: part.durationMs }
      : { kind: part.kind, cells: part.cells };
  const def = effects.get(part.effect ?? DISPLACE_EFFECT_IDS[part.kind]);
  return def && def.kind === "status" && def.status === part.kind ? { ...base, def } : base;
}

/** 스킬이 이 곡선을 골랐나 */
export function hasCurve(
  skill: { readonly curves?: readonly SkillCurve[] | undefined },
  curve: SkillCurve,
): boolean {
  return skill.curves?.includes(curve) === true;
}

const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * 이 유닛이 이 스킬을 쓸 수 있나(D-490 "맨손은 스킬을 쓸 수 없다, 맨손 스킬 제외"): 맨손 스킬은 늘, 그 밖은 든 무기에
 * 필요한 칸(weaponField, 기본값 = 기반)이 있을 때만. 무기 칸 목록이 없는 사양(시험 유닛·옛 스냅숏)은 늘 쓴다.
 * AI(pickSkill)·지속형(applyPassives)이 이것으로 거르고, 스킬 명령이 생기면 같은 검사로 거절한다
 */
export function skillUsable(
  unit: { readonly weaponFields?: readonly ("physical" | "elemental")[] | undefined },
  skill: { readonly bareHand?: boolean | undefined; readonly weaponField: SkillWeaponField },
): boolean {
  if (skill.bareHand === true || !unit.weaponFields) return true;
  return skill.weaponField === "any"
    ? unit.weaponFields.length > 0
    : unit.weaponFields.includes(skill.weaponField);
}

/**
 * 스킬 기반의 공격 사양(D-463 211): 맨손 스킬은 타고난 무기·맨손 속성 자료(bareHandAttack), 그 밖은 든 무기의 그 칸(skillAttack).
 * 사양에 없으면(시험 유닛) 기본 공격 사양
 */
function baseAttack(unit: UnitState, skill: CombatSkill): AttackProfile {
  const table = skill.bareHand && unit.bareHandAttack ? unit.bareHandAttack : unit.skillAttack;
  return (skill.base === "elemental" ? table?.elemental : table?.physical) ?? unit.attack;
}

function conditionsMet(unit: UnitState, target: UnitState | undefined, skill: CombatSkill): boolean {
  for (const condition of skill.conditions) {
    if (condition.part === "appropriate_met") {
      // 적정 스탯 이상(D-502): 그 기반 무기의 공격 몫 적정 1차(STR·INT) 이상. 적정이 없으면(맨손 포함) 만족
      const attack = baseAttack(unit, skill);
      if (attack.attackPrimary * 1000 < attack.attackAppropriateMilli) return false;
    } else if (condition.part === "self_hp_below") {
      if (unit.hp * 100 >= condition.pct * unit.maxHp) return false;
    } else if (condition.part === "target_hp_below") {
      if (!target || target.hp * 100 >= condition.pct * target.maxHp) return false;
    } else if (!target || !hasEffect(target, condition.effect)) return false;
  }
  return true;
}

/** 스킬 비용(밀리점): MP 스킬은 그대로, 스태미나 스킬은 적정 STA ÷ STA 점수 배율(N13·D-511) */
function costMilli(unit: UnitState, skill: CombatSkill, c: CombatCoefficients): number {
  return skill.resource === "mp" ? skill.cost * 1000 : specStaminaCostMilli(unit, skill.cost, c);
}

function affordable(unit: UnitState, skill: CombatSkill, c: CombatCoefficients): boolean {
  return (skill.resource === "mp" ? unit.mpMilli : unit.staminaMilli) >= costMilli(unit, skill, c);
}

/** 아군 하나 대상 스킬인가: 대상 ally, 반지름 0, 사거리 1 이상(반지름이 있으면 시전자 둘레 아군 모두) */
export function singleAlly(skill: CombatSkill): boolean {
  return skill.target === "ally" && skill.radius <= 0 && skill.range > 0;
}

/** 비율(‰): 지금 ÷ 최대. 최대가 0 이하면 가득으로 본다 */
const ratioPm = (now: number, max: number): number => (max <= 0 ? 1000 : Math.floor((now * 1000) / max));

/**
 * 아군 하나 대상 스킬의 대상([임시] 질문 260 가): 사거리 안(사거리 1 넘으면 직선이 열려야 함) 산 같은 편(자기 포함) 가운데
 * 회복(heal 부품)은 다친 아군 중 체력 비율이 가장 낮은 쪽, 쉴드 회복(shield 부품)은 쉴드가 빈 아군 중 쉴드 비율이 가장 낮은 쪽,
 * 둘 다 없으면 첫 효과가 아직 없는 아군 중 체력 비율이 가장 낮은 쪽. 같으면 가까운 쪽, 그다음 상태 배열 앞(작은 ID). 없으면 undefined
 */
function chooseAlly(
  unit: UnitState,
  skill: CombatSkill,
  units: readonly UnitState[],
  reach: (goal: UnitState, range: number) => boolean,
): UnitState | undefined {
  const firstEffect = skill.effects[0]?.def.id;
  let best: UnitState | undefined;
  let bestKey = 0;
  let bestDistance = 0;
  for (const other of units) {
    if (other.side !== unit.side || other.status !== "alive" || !reach(other, skill.range)) continue;
    let key: number;
    if (skill.healPm > 0) {
      if (other.hp >= other.maxHp) continue;
      key = ratioPm(other.hp, other.maxHp);
    } else if (skill.shieldPm > 0) {
      if (other.shieldHp <= 0 || other.shield >= other.shieldHp) continue;
      key = ratioPm(other.shield, other.shieldHp);
    } else {
      if (firstEffect !== undefined && hasEffect(other, firstEffect)) continue;
      key = ratioPm(other.hp, other.maxHp);
    }
    const distance = chebyshev(unit, other);
    if (best && (key > bestKey || (key === bestKey && distance >= bestDistance))) continue;
    best = other;
    bestKey = key;
    bestDistance = distance;
  }
  return best;
}

/**
 * 적 대상 스킬이 목표에 닿나: 도약(move leap)은 길·시선을 보지 않고 넘으므로(성벽까지, D-564 1586·D-568) 거리만 본다. 그 밖은
 * reach(사거리 + 사거리 1을 넘으면 시선)
 */
export function skillReaches(
  unit: { readonly x: number; readonly y: number },
  skill: { readonly range: number; readonly move?: SkillMove | undefined },
  goal: UnitState,
  reach: (goal: UnitState, range: number) => boolean,
): boolean {
  return skill.move?.kind === "leap" ? chebyshev(unit, goal) <= skill.range : reach(goal, skill.range);
}

/** 고른 스킬과 그 대상(적·자기·아군) */
export interface SkillPick {
  readonly index: number;
  readonly target: UnitState;
}

/**
 * 지금 쓸 스킬(목록 차례로 첫 번째)과 대상, 없으면 null. 적 대상은 enemy, 자기·아군 무리(반지름)는 자기, 아군 하나는 chooseAlly.
 * reach = 사거리·시선 확인, units = 전투의 모든 유닛(아군 하나 대상을 고를 때)
 */
export function pickSkill(
  unit: UnitState,
  enemy: UnitState,
  nowMs: number,
  reach: (goal: UnitState, range: number) => boolean,
  c: CombatCoefficients,
  units: readonly UnitState[] = [],
): SkillPick | null {
  if (nowMs < unit.nextActionMs || hasStatus(unit, "silence")) return null;
  for (let i = 0; i < unit.skills.length; i++) {
    const skill = unit.skills[i];
    if (!skill || skill.trigger !== "active" || nowMs < (unit.skillReadyMs[i] ?? 0)) continue;
    if (!skillUsable(unit, skill) || !affordable(unit, skill, c)) continue;
    // 이동 부품 스킬은 AI 고리가 막을 수 있다(지금은 늘 허락, 4단계가 슬라이더로)
    if (skill.move && !moveSkillAllowed(unit, skill, enemy, nowMs)) continue;
    if (skill.target === "enemy") {
      if (!conditionsMet(unit, enemy, skill) || !skillReaches(unit, skill, enemy, reach)) continue;
      return { index: i, target: enemy };
    }
    const target = singleAlly(skill) ? chooseAlly(unit, skill, units, reach) : unit;
    // 자기·아군 무리 스킬의 대상 조건은 옛 코드처럼 적을 본다(지금 그런 스킬이 없다), 아군 하나는 고른 아군
    if (!target || !conditionsMet(unit, singleAlly(skill) ? target : enemy, skill)) continue;
    return { index: i, target };
  }
  return null;
}

/** 자원·쿨을 쓰고 행동 시각을 민다. 시전이 있으면 시전 상태로 둔다. 바로 풀어야 하면 true */
export function startSkill(
  unit: UnitState,
  index: number,
  targetId: number,
  nowMs: number,
  c: CombatCoefficients,
): boolean {
  const skill = unit.skills[index];
  if (!skill) return false;
  if (skill.resource === "mp") unit.mpMilli -= costMilli(unit, skill, c);
  else unit.staminaMilli -= costMilli(unit, skill, c);
  unit.skillReadyMs[index] = nowMs + skill.cooldownMs;
  // 행동 간격 = max(시전, 공격 간격). 바탕은 무기 사거리 예산 전 간격(D-572 — 질문 2008 나: 무기 예산은 기본 공격에만, 스킬은 스킬 곡선만 —
  // 두 번 곱하지 않는다), 옛 시작 자료(칸 없음)는 공격 간격 그대로. 곡선 range_interval(공격 스킬은 칸이 없으면 켬, D-573 2009)이면 그 행동
  // 간격 × 스킬 사거리 예산 — 시전이 길어 공격 간격을 덮는 원거리 스킬에도 맞바꿈이 보이게 시전까지 함께 곱한다(질문 2172)
  const action = Math.max(skill.castMs, unit.skillIntervalMs ?? unit.attackIntervalMs);
  unit.nextActionMs =
    nowMs +
    (hasCurve(skill, "range_interval")
      ? scalePm(action, rangeIntervalPm(skill.range, moveCoefficientsOf(c)))
      : action);
  if (skill.castMs <= 0) return true;
  unit.cast = { skill: index, target: targetId, atMs: nowMs + skill.castMs };
  return false;
}

/**
 * 피해 두 몫(D-459): 물리 몫은 아머 HP부터, 속성 몫은 쉴드 HP부터 깎고 남은 것을 체력에서 뺀다. 맞아도 쉴드 재생은 멈추지 않는다(D-490)
 */
export function takeDamage(target: UnitState, physical: number, elemental: number): void {
  if (physical <= 0 && elemental <= 0) return;
  const toArmor = Math.min(target.armor, Math.max(0, physical));
  const toShield = Math.min(target.shield, Math.max(0, elemental));
  target.armor -= toArmor;
  target.shield -= toShield;
  target.hp -= Math.max(0, physical) - toArmor + (Math.max(0, elemental) - toShield);
  if (target.hp <= 0) {
    target.hp = 0;
    target.status = "down";
    target.command = null;
  }
}

/**
 * 효과 부품을 건다(굴림 하나씩 늘 뽑는다). 상태이상은 대상 1차 스탯 저항으로 줄인다(D-429).
 * 한 번 회복 효과(heal, 주기 없음)로 오른 체력은 관찰자에게 알린다(기록용, 상태·굴림에 손대지 않는다)
 */
function applyParts(
  source: UnitState,
  skill: CombatSkill,
  target: UnitState,
  rng: { nextInt(n: number): number },
  nowMs: number,
  trace: BattleTrace | undefined,
  c?: CombatCoefficients,
): void {
  // 지속 피해 합 줄임(곡선 dot_total을 고른 스킬만, ADR 3절)
  const dotCurve = c !== undefined && hasCurve(skill, "dot_total");
  for (const part of skill.effects) {
    const roll = rng.nextInt(10_000);
    if (target.status !== "alive") continue;
    const resist = part.def.kind === "status" ? statusResistPm(part.def, target.primaries) : 0;
    const chance = Math.floor((part.chancePm * (1000 - Math.min(1000, resist))) / 1000);
    if (roll >= chance * 10) continue;
    if (part.def.status === "stun") target.cast = null;
    const before = target.hp;
    const value =
      dotCurve && part.def.kind === "dot"
        ? scalePm(part.value, dotTotalPm(part.durationMs, moveCoefficientsOf(c)))
        : part.value;
    applyEffect(target, part.def, value, part.durationMs, nowMs);
    if (trace && target.hp > before)
      trace.heal(source, target, { hp: target.hp - before, shield: 0 }, part.def.id);
  }
}

/**
 * 연쇄 대상(모양 chain): 첫 대상에서 시작해, 앞 대상에서 튐 거리(체비쇼프) 안의 아직 맞지 않은 산 적 가운데 가장 가까운 적으로 튄다
 * (같으면 상태 배열 앞, 곧 작은 ID). 최대 대상 수까지, 다음 적이 없으면 멈춘다. 빗나가도 다음으로 튄다. 시야·시선은 보지 않는다
 * ([임시] 질문 261 가)
 */
function chainTargets(
  unit: UnitState,
  primary: UnitState,
  units: readonly UnitState[],
  chain: SkillChain,
): UnitState[] {
  if (primary.side === unit.side || primary.status !== "alive") return [];
  const hit = [primary];
  let last = primary;
  while (hit.length < chain.targets) {
    let next: UnitState | undefined;
    let best = 0;
    for (const other of units) {
      if (other.side === unit.side || other.status !== "alive" || hit.includes(other)) continue;
      const d = chebyshev(last, other);
      if (d > chain.jump || (next && d >= best)) continue;
      next = other;
      best = d;
    }
    if (!next) break;
    hit.push(next);
    last = next;
  }
  return hit;
}

/** 연쇄 k번째(0부터) 대상의 공격 사양: 스킬 배율 × 줄임 배율^k(곱할 때마다 버림) */
function chainStrike(attack: AttackProfile, falloffPm: number, k: number): AttackProfile {
  let mulPm = attack.skillMulPm;
  for (let i = 0; i < k; i++) mulPm = Math.floor((mulPm * Math.max(0, falloffPm)) / 1000);
  return { ...attack, skillMulPm: mulPm };
}

/**
 * 고른 곡선(마법 거리·마법 대상 수·가까이 쏘기)의 대상 하나 배율(‰, 곱할 때마다 버림). 곡선을 고르지 않았으면 1000
 * (docs/adr/2026-11-15-combat-moves.md 3절)
 */
function targetCurvePm(
  unit: UnitState,
  skill: CombatSkill,
  target: UnitState,
  count: number,
  c: CombatCoefficients,
): number {
  if (!skill.curves) return 1000;
  const m = moveCoefficientsOf(c);
  const distance = chebyshev(unit, target);
  let pm = 1000;
  if (hasCurve(skill, "magic_distance")) pm = scalePm(pm, magicDistancePm(distance, m));
  if (hasCurve(skill, "magic_targets")) pm = scalePm(pm, magicTargetsPm(count, m));
  if (hasCurve(skill, "close_shot")) pm = scalePm(pm, closeShotPm(skill.range, distance, m));
  return pm;
}

/**
 * 스킬을 푼다. 적 대상: 목표와 그 둘레(반지름)·연쇄 적마다 피해(명중·회피·크리 굴림) → 맞으면 효과. 자기·아군: 회복·쉴드·효과.
 * trace는 리플레이 기록용 관찰자다(상태·굴림에 손대지 않는다). 연쇄는 튄 차례대로 skillHit을 부른다.
 * 연사(shots)는 대상마다 발 수만큼 따로 굴린다(한 발 배율 multishotPm). onHit = 맞은(피해 없는 스킬은 걸린) 대상마다, 그 한 방의
 * 피해(두 몫 합, 피해 없는 스킬은 0)와 함께(이동 부품의 밀치기·끌어오기·묶기와 부딪힘 피해, moves.ts)
 */
export function resolveSkill(
  unit: UnitState,
  skill: CombatSkill,
  primary: UnitState,
  units: readonly UnitState[],
  rng: { nextInt(n: number): number },
  nowMs: number,
  c: CombatCoefficients,
  trace?: BattleTrace,
  onHit?: (target: UnitState, damage: number) => void,
): void {
  if (skill.target !== "enemy") {
    let group: readonly UnitState[];
    if (skill.target === "self") group = [unit];
    else if (singleAlly(skill))
      group = primary.side === unit.side && primary.status === "alive" ? [primary] : [];
    else
      group = units.filter(
        (other) =>
          other.side === unit.side && other.status === "alive" && chebyshev(unit, other) <= skill.radius,
      );
    for (const ally of group) {
      const hpBefore = ally.hp;
      const shieldBefore = ally.shield;
      if (skill.healPm > 0) ally.hp = Math.min(ally.maxHp, ally.hp + healAmount(ally.maxHp, skill.healPm));
      if (skill.shieldPm > 0)
        ally.shield = Math.min(ally.shieldHp, ally.shield + healAmount(ally.shieldHp, skill.shieldPm));
      if (trace && (ally.hp > hpBefore || ally.shield > shieldBefore))
        trace.heal(unit, ally, { hp: ally.hp - hpBefore, shield: ally.shield - shieldBefore }, null);
      applyParts(unit, skill, ally, rng, nowMs, trace, c);
    }
    return;
  }
  const attack = withAttackModifiers(skillAttack(baseAttack(unit, skill), skill), modifiersOf(unit));
  const targets = skill.chain
    ? chainTargets(unit, primary, units, skill.chain)
    : units.filter(
        (other) =>
          other.side !== unit.side &&
          other.status === "alive" &&
          (other.id === primary.id || chebyshev(primary, other) <= skill.radius),
      );
  const shots = skill.shots ?? 1;
  const shotPm = multishotPm(shots, moveCoefficientsOf(c));
  for (let k = 0; k < targets.length; k++) {
    const target = targets[k];
    if (!target) continue;
    if (skill.damage === "none") {
      applyParts(unit, skill, target, rng, nowMs, trace, c);
      if (onHit) onHit(target, 0);
      continue;
    }
    // 연쇄는 튈 때마다 스킬 배율에 줄임 배율을 곱한다(첫 대상은 그대로)
    let strike = skill.chain && k > 0 ? chainStrike(attack, skill.chain.falloffPm, k) : attack;
    // 고른 곡선(마법 거리·대상 수·가까이 쏘기)과 연사 한 발 배율. 고르지 않았으면 옛 사양 그대로
    const curvePm = targetCurvePm(unit, skill, target, targets.length, c);
    if (curvePm !== 1000) strike = { ...strike, skillMulPm: scalePm(strike.skillMulPm, curvePm) };
    if (shots > 1) {
      strike = { ...strike, skillMulPm: scalePm(strike.skillMulPm, shotPm) };
      trace?.multishot?.(unit, skill, target, shots);
    }
    for (let shot = 0; shot < shots; shot++) {
      if (shot > 0 && target.status !== "alive") break;
      strikeOnce(unit, skill, target, strike, shots > 1 ? shotPm : 1000, rng, nowMs, c, trace, onHit);
    }
  }
}

/** 피해 스킬 한 발(굴림 넷 → 맞으면 두 몫·고정 피해·효과·onHit). flatPm = 연사 한 발 배율(고정 피해에도 든다) */
function strikeOnce(
  unit: UnitState,
  skill: CombatSkill,
  target: UnitState,
  strike: AttackProfile,
  flatPm: number,
  rng: { nextInt(n: number): number },
  nowMs: number,
  c: CombatCoefficients,
  trace: BattleTrace | undefined,
  onHit: ((target: UnitState, damage: number) => void) | undefined,
): void {
  const rolls = {
    hit: rng.nextInt(10_000),
    evade: rng.nextInt(10_000),
    crit: rng.nextInt(10_000),
    critPos: rng.nextInt(10_000),
  };
  // 단계 기록은 관찰자가 원할 때만(전투 보고서 피해 흐름). 값·굴림은 그대로다
  const stages = trace?.attackStages ? newAttackStages("skill") : undefined;
  const hit = resolveAttack(
    strike,
    withDefenseModifiers(target.defense, modifiersOf(target)),
    rolls,
    c,
    stages,
  );
  if (hit.outcome !== "hit") {
    if (trace) trace.skillHit(unit, skill, target, hit, 0, 0);
    if (stages) trace?.attackStages?.(unit, target, stages);
    return;
  }
  // 고정 피해(공식 부품 flat)는 스킬 종류의 몫에 더한다(물리 → 물리 몫, 속성 → 속성 몫)
  const flat = flatPm === 1000 ? Math.max(0, skill.flat) : scalePm(Math.max(0, skill.flat), flatPm);
  const physical = strike.kind === "physical" ? hit.physical + flat : hit.physical;
  const elemental = strike.kind === "physical" ? hit.elemental : hit.elemental + flat;
  const before = stages ? { armor: target.armor, shield: target.shield, hp: target.hp } : undefined;
  takeDamage(target, physical, elemental);
  if (trace) trace.skillHit(unit, skill, target, hit, physical, elemental);
  if (stages && before) {
    stages.flat = flat;
    recordApplied(stages, before, target, physical, elemental);
    trace?.attackStages?.(unit, target, stages);
  }
  applyParts(unit, skill, target, rng, nowMs, trace, c);
  if (onHit) onHit(target, physical + elemental);
}

/** 지속형(passive) 스킬의 효과를 전투 처음에 자기에게 건다(전투 내내). 든 무기로 쓸 수 없는 스킬은 걸지 않는다(D-490) */
export function applyPassives(unit: UnitState): void {
  for (const skill of unit.skills) {
    if (skill.trigger !== "passive" || !skillUsable(unit, skill)) continue;
    for (const part of skill.effects) applyEffect(unit, part.def, part.value, part.durationMs, 0);
  }
}
