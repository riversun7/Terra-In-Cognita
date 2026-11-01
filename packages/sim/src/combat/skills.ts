// 스킬 — docs/adr/2026-10-31-combat-core.md 7절, 기획 D-415·D-418(자원)·D-426~D-428(스킬 = 부품 조합)
// 스킬 자료(SkillData)는 콘텐츠 팩 `skills`의 모양이다: 공식 부품·조건 부품·효과 부품(효과 사전 코드)·모양 부품
// (대상·범위·사거리·시전·쿨·자원)과 등급별 값 표(‰). skillFromData가 등급을 얹어 전투용(CombatSkill)으로 바꾼다.
// 판정 쪽: 쓸 수 있는 스킬과 대상을 목록 차례로 고르고(pickSkill), 자원·쿨을 쓰고(startSkill), 시전이 끝나면 대상에게 푼다(resolveSkill).
// 대상 모양: 적 하나·목표 둘레(반지름)·연쇄(chain), 자기, 시전자 둘레 아군(반지름), 아군 하나(반지름 0·사거리 ≥ 1). 보는 쪽용 모양 칸은
// shape(ADR "바뀜 (2026-11-01, 마법 스킬)").
// [임시] 부품 종류·등급 표 적용 방식·AI(목록 앞 스킬부터)·연쇄·아군 고르기는 기술 기본안이다(질문 260~264).
// 스킬석 인챈트·유전자 추출·스킬 생성기 화면은 뒤 단계(D2)다.
import { type CombatCoefficients, staminaCostMilli } from "./coefficients.ts";
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
 * debuff = 피해 없이 적에게 효과
 */
export type SkillShape = "single" | "projectile" | "area" | "chain" | "heal" | "buff" | "debuff";

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
  };
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
      const attack = baseAttack(unit, skill);
      if (attack.attackStat < attack.attackAppropriate) return false;
    } else if (condition.part === "self_hp_below") {
      if (unit.hp * 100 >= condition.pct * unit.maxHp) return false;
    } else if (condition.part === "target_hp_below") {
      if (!target || target.hp * 100 >= condition.pct * target.maxHp) return false;
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
    if (skill.target === "enemy") {
      if (!conditionsMet(unit, enemy, skill) || !reach(enemy, skill.range)) continue;
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
  unit.nextActionMs = nowMs + Math.max(skill.castMs, unit.attackIntervalMs);
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
): void {
  for (const part of skill.effects) {
    const roll = rng.nextInt(10_000);
    if (target.status !== "alive") continue;
    const resist = part.def.kind === "status" ? statusResistPm(part.def, target.primaries) : 0;
    const chance = Math.floor((part.chancePm * (1000 - Math.min(1000, resist))) / 1000);
    if (roll >= chance * 10) continue;
    if (part.def.status === "stun") target.cast = null;
    const before = target.hp;
    applyEffect(target, part.def, part.value, part.durationMs, nowMs);
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
 * 스킬을 푼다. 적 대상: 목표와 그 둘레(반지름)·연쇄 적마다 피해(명중·회피·크리 굴림) → 맞으면 효과. 자기·아군: 회복·쉴드·효과.
 * trace는 리플레이 기록용 관찰자다(상태·굴림에 손대지 않는다). 연쇄는 튄 차례대로 skillHit을 부른다
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
      applyParts(unit, skill, ally, rng, nowMs, trace);
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
  for (let k = 0; k < targets.length; k++) {
    const target = targets[k];
    if (!target) continue;
    if (skill.damage === "none") {
      applyParts(unit, skill, target, rng, nowMs, trace);
      continue;
    }
    // 연쇄는 튈 때마다 스킬 배율에 줄임 배율을 곱한다(첫 대상은 그대로)
    const strike = skill.chain && k > 0 ? chainStrike(attack, skill.chain.falloffPm, k) : attack;
    const rolls = {
      hit: rng.nextInt(10_000),
      evade: rng.nextInt(10_000),
      crit: rng.nextInt(10_000),
      critPos: rng.nextInt(10_000),
    };
    const hit = resolveAttack(strike, withDefenseModifiers(target.defense, modifiersOf(target)), rolls, c);
    if (hit.outcome !== "hit") {
      if (trace) trace.skillHit(unit, skill, target, hit, 0, 0);
      continue;
    }
    // 고정 피해(공식 부품 flat)는 스킬 종류의 몫에 더한다(물리 → 물리 몫, 속성 → 속성 몫)
    const flat = Math.max(0, skill.flat);
    const physical = attack.kind === "physical" ? hit.physical + flat : hit.physical;
    const elemental = attack.kind === "physical" ? hit.elemental : hit.elemental + flat;
    takeDamage(target, physical, elemental);
    if (trace) trace.skillHit(unit, skill, target, hit, physical, elemental);
    applyParts(unit, skill, target, rng, nowMs, trace);
  }
}

/** 지속형(passive) 스킬의 효과를 전투 처음에 자기에게 건다(전투 내내). 든 무기로 쓸 수 없는 스킬은 걸지 않는다(D-490) */
export function applyPassives(unit: UnitState): void {
  for (const skill of unit.skills) {
    if (skill.trigger !== "passive" || !skillUsable(unit, skill)) continue;
    for (const part of skill.effects) applyEffect(unit, part.def, part.value, part.durationMs, 0);
  }
}
