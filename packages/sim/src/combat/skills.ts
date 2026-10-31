// 스킬 — docs/adr/2026-10-31-combat-core.md 7절, 기획 D-415·D-418(자원)·D-426~D-428(스킬 = 부품 조합)
// 스킬 자료(SkillData)는 콘텐츠 팩 `skills`의 모양이다: 공식 부품·조건 부품·효과 부품(효과 사전 코드)·모양 부품
// (대상·범위·사거리·시전·쿨·자원)과 등급별 값 표(‰). skillFromData가 등급을 얹어 전투용(CombatSkill)으로 바꾼다.
// 판정 쪽: 쓸 수 있는 스킬을 목록 차례로 고르고(pickSkill), 자원·쿨을 쓰고(startSkill), 시전이 끝나면 대상에게 푼다(resolveSkill).
// [임시] 부품 종류·등급 표 적용 방식·AI(목록 앞 스킬부터)는 기획 본문 48을 받기 전 기술 기본안이다.
// 스킬석 인챈트·유전자 추출·스킬 생성기 화면은 뒤 단계(D2)다.
import { type CombatCoefficients, staminaCostMilli } from "./coefficients.ts";
import { type EffectDef, applyEffect, hasEffect, hasStatus, modifiersOf, statusResistPm } from "./effects.ts";
import {
  type SkillFormula,
  healAmount,
  resolveAttack,
  skillAttack,
  withAttackModifiers,
  withDefenseModifiers,
} from "./formula.ts";
import type { UnitState } from "./battleTypes.ts";

export type SkillFormulaPart =
  | { readonly part: "attack_mul"; readonly pm: number }
  | { readonly part: "weapon_add"; readonly value: number }
  | { readonly part: "element"; readonly element: number; readonly pm: number }
  | { readonly part: "penetration"; readonly pm: number }
  | { readonly part: "flat"; readonly value: number }
  | { readonly part: "heal"; readonly pm: number };

export type SkillCondition =
  | { readonly part: "appropriate_met" }
  | { readonly part: "self_hp_below"; readonly pct: number }
  | { readonly part: "target_has"; readonly effect: string };

export interface SkillEffectData {
  readonly effect: string;
  readonly value: number;
  readonly chancePm: number;
  /** 지속(ms, 0 = 전투 내내). 없으면 효과 사전의 기본 지속 */
  readonly durationMs?: number | undefined;
}

/** 팩 `skills` 항목의 모양(참조는 ID 문자열) */
export interface SkillData {
  readonly id: string;
  readonly trigger: "active" | "passive";
  readonly resource: "stamina" | "mp";
  readonly cost: number;
  readonly castMs: number;
  readonly cooldownMs: number;
  readonly target: "enemy" | "self" | "ally";
  readonly range: number;
  readonly radius: number;
  readonly damage: "physical" | "elemental" | "none";
  readonly formula: readonly SkillFormulaPart[];
  readonly conditions: readonly SkillCondition[];
  readonly effects: readonly SkillEffectData[];
  /** 등급별 값 배율(‰). 등급 g는 g − 1번째, 없으면 마지막 */
  readonly gradePm: readonly number[];
}

export interface CombatSkill extends SkillFormula {
  readonly id: string;
  readonly trigger: "active" | "passive";
  readonly resource: "stamina" | "mp";
  readonly cost: number;
  readonly castMs: number;
  readonly cooldownMs: number;
  readonly target: "enemy" | "self" | "ally";
  readonly range: number;
  readonly radius: number;
  readonly flat: number;
  readonly healPm: number;
  readonly conditions: readonly SkillCondition[];
  readonly effects: readonly {
    readonly def: EffectDef;
    readonly value: number;
    readonly chancePm: number;
    readonly durationMs: number;
  }[];
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
  const elementPm = Array.from({ length: ELEMENTS }, () => 0);
  for (const part of data.formula) {
    if (part.part === "attack_mul") attackMulPm = 1000 + scaled(part.pm - 1000);
    else if (part.part === "weapon_add") weaponAdd += scaled(part.value);
    else if (part.part === "penetration") penetrationPm += scaled(part.pm);
    else if (part.part === "flat") flat += scaled(part.value);
    else if (part.part === "heal") healPm += scaled(part.pm);
    else elementPm[part.element] = (elementPm[part.element] ?? 0) + scaled(part.pm);
  }
  return {
    id: data.id,
    trigger: data.trigger,
    resource: data.resource,
    cost: data.cost,
    castMs: data.castMs,
    cooldownMs: data.cooldownMs,
    target: data.target,
    range: data.range,
    radius: data.radius,
    damage: data.damage,
    attackMulPm,
    weaponAdd,
    penetrationPm,
    elementPm,
    flat,
    healPm,
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
  };
}

const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function conditionsMet(unit: UnitState, target: UnitState | undefined, skill: CombatSkill): boolean {
  for (const condition of skill.conditions) {
    if (condition.part === "appropriate_met") {
      if (unit.attack.attackStat < unit.attack.attackAppropriate) return false;
    } else if (condition.part === "self_hp_below") {
      if (unit.hp * 100 >= condition.pct * unit.maxHp) return false;
    } else if (!target || !hasEffect(target, condition.effect)) return false;
  }
  return true;
}

/** 스킬 비용(밀리점): MP 스킬은 그대로, 스태미나 스킬은 STA 점수 배율(N13) */
function costMilli(unit: UnitState, skill: CombatSkill, c: CombatCoefficients): number {
  return skill.resource === "mp" ? skill.cost * 1000 : staminaCostMilli(skill.cost, unit.staminaScore, c);
}

function affordable(unit: UnitState, skill: CombatSkill, c: CombatCoefficients): boolean {
  return (skill.resource === "mp" ? unit.mpMilli : unit.staminaMilli) >= costMilli(unit, skill, c);
}

/** 지금 쓸 스킬(목록 차례로 첫 번째), 없으면 −1. reach = 사거리·시선 확인 */
export function pickSkill(
  unit: UnitState,
  target: UnitState,
  nowMs: number,
  reach: (range: number) => boolean,
  c: CombatCoefficients,
): number {
  if (nowMs < unit.nextActionMs || hasStatus(unit, "silence")) return -1;
  for (let i = 0; i < unit.skills.length; i++) {
    const skill = unit.skills[i];
    if (!skill || skill.trigger !== "active" || nowMs < (unit.skillReadyMs[i] ?? 0)) continue;
    if (!affordable(unit, skill, c) || !conditionsMet(unit, target, skill)) continue;
    if (skill.target === "enemy" && !reach(skill.range)) continue;
    return i;
  }
  return -1;
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
  unit.nextActionMs = nowMs + Math.max(skill.castMs, unit.attackIntervalMs);
  if (skill.castMs <= 0) return true;
  unit.cast = { skill: index, target: targetId, atMs: nowMs + skill.castMs };
  return false;
}

/** 피해를 아머(물리)·쉴드(속성)부터 깎고 체력을 줄인다 */
export function takeDamage(target: UnitState, amount: number, kind: "physical" | "elemental"): void {
  let left = amount;
  if (left <= 0) return;
  const absorbed = Math.min(kind === "physical" ? target.armor : target.shield, left);
  if (kind === "physical") target.armor -= absorbed;
  else target.shield -= absorbed;
  left -= absorbed;
  target.hp -= left;
  if (target.hp <= 0) {
    target.hp = 0;
    target.status = "down";
    target.command = null;
  }
}

/** 효과 부품을 건다(굴림 하나씩 늘 뽑는다). 상태이상은 대상 1차 스탯 저항으로 줄인다(D-429) */
function applyParts(
  skill: CombatSkill,
  target: UnitState,
  rng: { nextInt(n: number): number },
  nowMs: number,
): void {
  for (const part of skill.effects) {
    const roll = rng.nextInt(10_000);
    if (target.status !== "alive") continue;
    const resist = part.def.kind === "status" ? statusResistPm(part.def, target.primaries) : 0;
    const chance = Math.floor((part.chancePm * (1000 - Math.min(1000, resist))) / 1000);
    if (roll >= chance * 10) continue;
    if (part.def.status === "stun") target.cast = null;
    applyEffect(target, part.def, part.value, part.durationMs, nowMs);
  }
}

/** 스킬을 푼다. 적 대상: 목표와 그 둘레(반지름) 적마다 피해(명중·회피·크리 굴림) → 맞으면 효과. 자기·아군: 회복·효과 */
export function resolveSkill(
  unit: UnitState,
  skill: CombatSkill,
  primary: UnitState,
  units: readonly UnitState[],
  rng: { nextInt(n: number): number },
  nowMs: number,
  c: CombatCoefficients,
): void {
  if (skill.target !== "enemy") {
    const group =
      skill.target === "self"
        ? [unit]
        : units.filter(
            (other) =>
              other.side === unit.side && other.status === "alive" && chebyshev(unit, other) <= skill.radius,
          );
    for (const ally of group) {
      if (skill.healPm > 0) ally.hp = Math.min(ally.maxHp, ally.hp + healAmount(ally.maxHp, skill.healPm));
      applyParts(skill, ally, rng, nowMs);
    }
    return;
  }
  const attack = withAttackModifiers(skillAttack(unit.attack, skill), modifiersOf(unit));
  const targets = units.filter(
    (other) =>
      other.side !== unit.side &&
      other.status === "alive" &&
      (other.id === primary.id || chebyshev(primary, other) <= skill.radius),
  );
  for (const target of targets) {
    if (skill.damage === "none") {
      applyParts(skill, target, rng, nowMs);
      continue;
    }
    const rolls = {
      hit: rng.nextInt(10_000),
      evade: rng.nextInt(10_000),
      crit: rng.nextInt(10_000),
      critPos: rng.nextInt(10_000),
    };
    const hit = resolveAttack(attack, withDefenseModifiers(target.defense, modifiersOf(target)), rolls, c);
    if (hit.outcome !== "hit") continue;
    takeDamage(target, hit.amount + Math.max(0, skill.flat), attack.kind);
    applyParts(skill, target, rng, nowMs);
  }
}

/** 지속형(passive) 스킬의 효과를 전투 처음에 자기에게 건다(전투 내내) */
export function applyPassives(unit: UnitState): void {
  for (const skill of unit.skills) {
    if (skill.trigger !== "passive") continue;
    for (const part of skill.effects) applyEffect(unit, part.def, part.value, part.durationMs, 0);
  }
}
