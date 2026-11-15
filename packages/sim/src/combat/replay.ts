// 전투 리플레이 기록기 — docs/adr/2026-11-01-battle-replay.md 1절. 같은 판정(createBattle)을 관찰자(battleTrace.ts)와 함께 끝까지
// 돌려 기기가 다시 그릴 기록(@terra/protocol BattleReplay)을 만든다. 판정 결과·끝 상태는 runBattle과 바이트까지 같다(시험).
// - 관찰자: 공격(굴림 결과·두 몫), 건물 공격, 스킬 발동·대상마다 결과, 회복, 지속 피해 → 그 틱 사건(일어난 차례).
// - 틱마다 차이: 걸음, 효과 켜짐·꺼짐, 시전 시작·끊김·헛시전, 쓰러짐·퇴각, 편마다 보이는 적 → 그 틱 사건(관찰자 사건 뒤).
// - 1초마다(그리고 끝에) 바뀐 자원(vitals). 키프레임은 처음 + keyframeTicks마다(그 틱의 사건 전 상태).
// 바라보는 쪽은 기록기가 정한다(걸음 방향, 공격·스킬은 목표 쪽). 판정에는 방향이 없다.
// 움직임(형식 2, docs/adr/2026-11-15-combat-moves.md 5절): 관찰자 motion·stealth·run·multishot → 그 틱 사건. 움직임 부품으로 옮긴 유닛은
// 그 틱의 걸음 사건을 따로 싣지 않는다(자리는 motion이 바꾼다). 키프레임에 은신·달리기 표지.
// 전투 실험실(work/battle-lab)도 이 함수를 부른다: 입력은 sim이 받는 BattleInit 그대로 + 선택 사항.
import {
  BATTLE_REPLAY_FORMAT_VERSION,
  type BattleReplay,
  type Facing,
  REPLAY_KEYFRAME_TICKS,
  REPLAY_VITALS_TICKS,
  type ReplayArenaRef,
  type ReplayEffect,
  type ReplayEvent,
  type ReplayHit,
  type ReplayKeyframe,
  type ReplayName,
  type ReplaySkill,
  type ReplaySkillShape,
  type ReplayUnit,
  facingBetween,
} from "@terra/protocol/battleReplay";
import { SIM_VERSION } from "../version.ts";
import { createBattle, snapshotBattle } from "./battle.ts";
import type { BattleTrace } from "./battleTrace.ts";
import type {
  BattleInit,
  BattleInput,
  BattleResult,
  BattleState,
  CombatUnitSpec,
  UnitState,
} from "./battleTypes.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import type { AttackResult } from "./formula.ts";
import type { CombatSkill, SkillShape } from "./skills.ts";

export interface RecordBattleOptions {
  /** 판정 입력(명령·참전), runBattle과 같다 */
  readonly inputs?: readonly BattleInput[] | undefined;
  readonly coefficients?: CombatCoefficients | undefined;
  /** 경기장이 2차맵 구역이면 그 참조(보기 화면이 그 지형을 받는다). 없으면 평지(통과·엄폐 층만) */
  readonly arena?: ReplayArenaRef | null | undefined;
  /** 유닛 ID → 보이는 이름·종류 코드. 없으면 이름 "", 종류 "cyborg"·"unit" */
  readonly units?: Readonly<Record<number, { readonly name?: string; readonly kind?: string }>> | undefined;
  /** 스킬·효과 ID → 이름(ko·en, 팩 이름) */
  readonly names?:
    | {
        readonly skills?: Readonly<Record<string, ReplayName>> | undefined;
        readonly effects?: Readonly<Record<string, ReplayName>> | undefined;
      }
    | undefined;
  /** 키프레임 간격(틱, 기본 300 = 30초) */
  readonly keyframeTicks?: number | undefined;
}

export interface RecordedBattle {
  readonly replay: BattleReplay;
  /** runBattle과 같은 결과·끝 상태 */
  readonly result: BattleResult;
  readonly finalState: string;
  readonly state: BattleState;
}

/** 스킬 자료의 모양 칸(팩 shape, ADR combat-core "바뀜 (2026-11-01, 마법 스킬)") → 그림 모양(single = strike) */
const SHAPE_OF: Readonly<Record<SkillShape, ReplaySkillShape>> = {
  single: "strike",
  projectile: "projectile",
  area: "area",
  chain: "chain",
  heal: "heal",
  buff: "buff",
  debuff: "debuff",
  move: "move",
};

/**
 * 스킬 그림 모양(ADR 2절): ID가 아니라 스킬 자료의 모양 칸(shape)에서. 연쇄가 튄 차례는 관찰자 skillHit 차례(= 판정이 맞힌 차례)라
 * 보기 화면이 그 차례로 잇는다
 */
export function skillShape(skill: CombatSkill): ReplaySkillShape {
  return SHAPE_OF[skill.shape];
}

/** 가장 큰 속성 계수의 속성(없으면 −1) */
function mainElement(skill: CombatSkill): number {
  let best = -1;
  let value = 0;
  skill.elementPm.forEach((pm, index) => {
    if (pm > value) {
      value = pm;
      best = index;
    }
  });
  return best;
}

const milliPoints = (milli: number): number => Math.max(0, Math.floor(milli / 1000));
/** 막대에 보이는 단계 수: 쉴드(머리 위 막대) 최대의 1/50 = 2%, MP·스태미나(유닛 판 글자) 1/20 = 5% */
const SHIELD_STEPS = 50;
const RESOURCE_STEPS = 20;

interface Vitals {
  hp: number;
  armor: number;
  shield: number;
  mp: number;
  stamina: number;
}

interface Seen {
  x: number;
  y: number;
  status: UnitState["status"] | "absent";
  cast: string | null;
  castAtMs: number;
  effects: Map<string, string>;
}

const effectKey = (effect: { stacks: number; untilMs: number }): string =>
  `${effect.stacks}:${effect.untilMs}`;

const hitOf = (target: UnitState, hit: AttackResult, physical: number, elemental: number): ReplayHit => ({
  outcome: hit.outcome === "evaded" ? "evade" : hit.outcome,
  crit: hit.crit,
  physical,
  elemental,
  hp: Math.max(0, target.hp),
  armor: target.armor,
  shield: target.shield,
});

const vitalsOf = (unit: UnitState): Vitals => ({
  hp: Math.max(0, unit.hp),
  armor: unit.armor,
  shield: unit.shield,
  mp: milliPoints(unit.mpMilli),
  stamina: milliPoints(unit.staminaMilli),
});

const seenOf = (unit: UnitState): Seen => ({
  x: unit.x,
  y: unit.y,
  status: unit.status,
  cast: unit.cast ? `${unit.cast.skill}:${unit.cast.target}:${unit.cast.atMs}` : null,
  castAtMs: unit.cast?.atMs ?? 0,
  effects: new Map(unit.effects.map((effect) => [effect.id, effectKey(effect)])),
});

export function recordBattleReplay(init: BattleInit, options: RecordBattleOptions = {}): RecordedBattle {
  const c = options.coefficients ?? TEST_COMBAT_COEFFICIENTS;
  const inputs = options.inputs ?? [];
  const keyframeTicks = options.keyframeTicks ?? REPLAY_KEYFRAME_TICKS;
  if (!Number.isInteger(keyframeTicks) || keyframeTicks < 1)
    throw new RangeError("keyframeTicks must be ≥ 1");
  const toTick = (ms: number): number => Math.ceil(ms / c.tickMs);

  // 유닛 표: 처음 유닛(ID 차례) + 참전 유닛(입력 틱·ID 차례)
  const specs: { spec: CombatUnitSpec; joinTick: number }[] = [
    ...init.units.toSorted((a, b) => a.id - b.id).map((spec) => ({ spec, joinTick: 0 })),
    ...inputs
      .flatMap((input) =>
        input.kind === "join" ? input.units.map((spec) => ({ spec, joinTick: input.tick })) : [],
      )
      .toSorted((a, b) => a.joinTick - b.joinTick || a.spec.id - b.spec.id),
  ];
  const indexOf = new Map(specs.map((entry, index) => [entry.spec.id, index]));
  const unitIndex = (id: number): number => {
    const index = indexOf.get(id);
    if (index === undefined) throw new RangeError(`replay: unknown unit ${id}`);
    return index;
  };

  // 스킬·효과 표(ID마다 한 줄, 처음 본 것)
  const skills: ReplaySkill[] = [];
  const skillIndex = new Map<string, number>();
  const effects: ReplayEffect[] = [];
  const effectIndex = new Map<string, number>();
  const addEffect = (id: string, kind: ReplayEffect["kind"]): number => {
    const found = effectIndex.get(id);
    if (found !== undefined) return found;
    effects.push({ id, kind, name: options.names?.effects?.[id] ?? null });
    effectIndex.set(id, effects.length - 1);
    return effects.length - 1;
  };
  const addSkill = (skill: CombatSkill): number => {
    const found = skillIndex.get(skill.id);
    if (found !== undefined) return found;
    skills.push({
      id: skill.id,
      shape: skillShape(skill),
      damage: skill.damage,
      element: mainElement(skill),
      range: skill.range,
      radius: skill.radius,
      castMs: skill.castMs,
      name: options.names?.skills?.[skill.id] ?? null,
    });
    skillIndex.set(skill.id, skills.length - 1);
    for (const part of skill.effects) addEffect(part.def.id, part.def.kind);
    return skills.length - 1;
  };

  const facing = new Map<number, Facing>();
  const units: ReplayUnit[] = specs.map(({ spec, joinTick }) => {
    const label = options.units?.[spec.id];
    // 처음 방향: 들어오는 변의 반대쪽(서쪽 편은 동쪽을 본다)
    const edge = [
      ...init.sides,
      ...inputs.flatMap((input) => (input.kind === "join" ? [input.side] : [])),
    ].find((side) => side.id === spec.side)?.edge;
    const start: Facing = edge === 0 ? 4 : edge === 1 ? 6 : edge === 2 ? 0 : 2;
    facing.set(spec.id, start);
    return {
      id: spec.id,
      side: spec.side,
      party: spec.party,
      name: label?.name ?? "",
      kind: label?.kind ?? (spec.cyborg ? "cyborg" : "unit"),
      joinTick,
      x: spec.x,
      y: spec.y,
      facing: start,
      maxHp: spec.maxHp,
      armorHp: spec.armorHp,
      shieldHp: spec.shieldHp,
      mpMax: spec.mpMax,
      staminaMax: spec.staminaMax,
      range: spec.range,
      attack: spec.attack.kind,
      moveIntervalMs: spec.moveIntervalMs,
      cyborg: spec.cyborg,
      air: spec.air,
      skills: spec.skills.map(addSkill),
    };
  });

  const events: ReplayEvent[] = [];
  /** 보기 화면이 아는 자원 값(사건이 바꾼 값). vitals는 이것과 다를 때만 */
  const known = new Map<number, Vitals>();
  /** 이 틱에 풀린 스킬(유닛 ID → 유닛 스킬 목록 번호): 시전이 풀렸는지·끊겼는지 가른다 */
  const fired = new Map<number, Set<number>>();
  /** 이 틱에 움직임 부품으로 옮긴 유닛(걸음 사건을 따로 싣지 않는다) */
  const motioned = new Set<number>();
  let battle: ReturnType<typeof createBattle> | undefined;
  const tickNow = (): number => battle?.state.tick ?? 0;

  const setKnown = (unit: UnitState, change: Partial<Vitals>): void => {
    const now = known.get(unit.id);
    if (now) Object.assign(now, change);
  };
  const turn = (unit: UnitState, target: { x: number; y: number }): Facing => {
    const next = facingBetween(unit.x, unit.y, target.x, target.y, facing.get(unit.id) ?? 2);
    facing.set(unit.id, next);
    return next;
  };
  const trace: BattleTrace = {
    attack(attacker, target, hit) {
      const t = tickNow();
      if (attacker.range > 1)
        events.push({
          k: "projectile",
          t,
          u: unitIndex(attacker.id),
          target: unitIndex(target.id),
          skill: -1,
        });
      const result = hitOf(target, hit, hit.physical, hit.elemental);
      events.push({
        k: "attack",
        t,
        u: unitIndex(attacker.id),
        target: unitIndex(target.id),
        facing: turn(attacker, target),
        ...result,
      });
      setKnown(target, { hp: result.hp, armor: result.armor, shield: result.shield });
    },
    building(attacker, buildingId, damage, durability) {
      events.push({
        k: "building",
        t: tickNow(),
        u: unitIndex(attacker.id),
        building: buildingId,
        damage,
        durability,
      });
    },
    skill(unit, index, primary) {
      const skill = unit.skills[index];
      if (!skill) return;
      const t = tickNow();
      const row = addSkill(skill);
      const list = fired.get(unit.id) ?? new Set<number>();
      list.add(index);
      fired.set(unit.id, list);
      const shape = skills[row]?.shape;
      const ranged = shape === "projectile" || (shape === "area" && skill.range > 1);
      if (ranged && primary.id !== unit.id)
        events.push({ k: "projectile", t, u: unitIndex(unit.id), target: unitIndex(primary.id), skill: row });
      events.push({
        k: "skill",
        t,
        u: unitIndex(unit.id),
        skill: row,
        target: unitIndex(primary.id),
        x: primary.x,
        y: primary.y,
        facing: primary.id === unit.id ? (facing.get(unit.id) ?? 2) : turn(unit, primary),
      });
    },
    skillHit(unit, skill, target, hit, physical, elemental) {
      const result = hitOf(target, hit, physical, elemental);
      events.push({
        k: "skillHit",
        t: tickNow(),
        u: unitIndex(unit.id),
        skill: addSkill(skill),
        target: unitIndex(target.id),
        ...result,
      });
      setKnown(target, { hp: result.hp, armor: result.armor, shield: result.shield });
    },
    heal(source, target, gain, effect) {
      events.push({
        k: "heal",
        t: tickNow(),
        u: source ? unitIndex(source.id) : -1,
        target: unitIndex(target.id),
        amount: gain.hp,
        hp: target.hp,
        shieldGain: gain.shield,
        shield: target.shield,
        effect: effect === null ? -1 : addEffect(effect, "heal"),
      });
      setKnown(target, { hp: target.hp, shield: target.shield });
    },
    motion(unit, kind, fromX, fromY) {
      // 자기 이동(뒷걸음 빼고)은 간 쪽을 본다. 뒷걸음·밀치기·끌어오기는 바라보는 쪽 그대로
      const keep = kind === "backstep" || kind === "knockback" || kind === "pull";
      const next = keep
        ? (facing.get(unit.id) ?? 2)
        : facingBetween(fromX, fromY, unit.x, unit.y, facing.get(unit.id) ?? 2);
      facing.set(unit.id, next);
      motioned.add(unit.id);
      events.push({
        k: "motion",
        t: tickNow(),
        u: unitIndex(unit.id),
        kind,
        fromX,
        fromY,
        x: unit.x,
        y: unit.y,
        facing: next,
      });
    },
    stealth(unit, on, cause) {
      events.push({ k: "stealth", t: tickNow(), u: unitIndex(unit.id), on, cause });
    },
    run(unit, on) {
      events.push({ k: "run", t: tickNow(), u: unitIndex(unit.id), on });
    },
    multishot(unit, skill, target, shots) {
      events.push({
        k: "multishot",
        t: tickNow(),
        u: unitIndex(unit.id),
        target: unitIndex(target.id),
        skill: addSkill(skill),
        shots,
      });
    },
    dot(target, effect, amount) {
      const hp = Math.max(0, target.hp);
      events.push({
        k: "dot",
        t: tickNow(),
        target: unitIndex(target.id),
        effect: addEffect(effect, "dot"),
        amount,
        hp,
      });
      setKnown(target, { hp });
    },
  };

  battle = createBattle(init, c, trace);
  const { state } = battle;

  const seen = new Map<number, Seen>();
  for (const unit of state.units) seen.set(unit.id, seenOf(unit));
  // 보기 화면이 처음 아는 자원 = 키프레임(처음 유닛) 또는 유닛 표 최대값(참전 유닛)
  for (const { spec } of specs) {
    const unit = state.units.find((entry) => entry.id === spec.id);
    known.set(
      spec.id,
      unit
        ? vitalsOf(unit)
        : {
            hp: spec.maxHp,
            armor: spec.armorHp,
            shield: spec.shieldHp,
            mp: spec.mpMax,
            stamina: spec.staminaMax,
          },
    );
  }
  const vision = new Map<number, Set<number>>();

  const keyframe = (): ReplayKeyframe => {
    const byId = new Map(state.units.map((unit) => [unit.id, unit]));
    return {
      tick: state.tick,
      units: specs.map(({ spec }) => {
        const unit = byId.get(spec.id);
        if (!unit)
          return {
            status: "absent",
            x: spec.x,
            y: spec.y,
            facing: facing.get(spec.id) ?? 2,
            hp: spec.maxHp,
            armor: spec.armorHp,
            shield: spec.shieldHp,
            mp: spec.mpMax,
            stamina: spec.staminaMax,
            effects: [],
            cast: null,
          };
        const castSkill = unit.cast ? unit.skills[unit.cast.skill] : undefined;
        return {
          status: unit.status,
          x: unit.x,
          y: unit.y,
          facing: facing.get(unit.id) ?? 2,
          ...vitalsOf(unit),
          effects: unit.effects
            .map((effect) => ({
              effect: addEffect(effect.id, effect.kind),
              stacks: effect.stacks,
              untilTick: effect.untilMs < 0 ? -1 : toTick(effect.untilMs),
            }))
            .toSorted((a, b) => a.effect - b.effect),
          cast:
            unit.cast && castSkill
              ? {
                  skill: addSkill(castSkill),
                  target: unitIndex(unit.cast.target),
                  endTick: toTick(unit.cast.atMs),
                }
              : null,
          ...(unit.stealthUntilMs !== undefined ? { stealth: true as const } : {}),
          ...(unit.running ? { running: true as const } : {}),
        };
      }),
    };
  };

  /** 한 틱이 끝난 뒤 차이 사건(t = 그 틱) */
  const diff = (t: number): void => {
    for (const unit of state.units) {
      const u = unitIndex(unit.id);
      const spec = specs[u]?.spec;
      // 참전 유닛을 처음 본다: 유닛 표의 처음 자리·빈 효과에서 견준다(들어온 틱에 걷거나 지속형 효과가 걸려 있다)
      const before: Seen = seen.get(unit.id) ?? {
        x: spec?.x ?? unit.x,
        y: spec?.y ?? unit.y,
        status: "alive",
        cast: null,
        castAtMs: 0,
        effects: new Map(),
      };
      if ((unit.x !== before.x || unit.y !== before.y) && !motioned.has(unit.id)) {
        const next = facingBetween(before.x, before.y, unit.x, unit.y, facing.get(unit.id) ?? 2);
        facing.set(unit.id, next);
        events.push({ k: "move", t, u, x: unit.x, y: unit.y, facing: next });
      }
      const now = seenOf(unit);
      if (now.cast !== before.cast) {
        const castSkill = before.cast === null ? -1 : Number(before.cast.split(":")[0]);
        if (castSkill >= 0 && !fired.get(unit.id)?.has(castSkill)) {
          const row = unit.skills[castSkill];
          if (row)
            events.push({
              k: t * c.tickMs >= before.castAtMs ? "fizzle" : "interrupt",
              t,
              u,
              skill: addSkill(row),
            });
        }
        if (unit.cast) {
          const row = unit.skills[unit.cast.skill];
          if (row)
            events.push({
              k: "cast",
              t,
              u,
              skill: addSkill(row),
              target: unitIndex(unit.cast.target),
              endTick: toTick(unit.cast.atMs),
            });
        }
      }
      for (const effect of unit.effects) {
        if (before.effects.get(effect.id) === effectKey(effect)) continue;
        events.push({
          k: "effectOn",
          t,
          target: u,
          effect: addEffect(effect.id, effect.kind),
          stacks: effect.stacks,
          untilTick: effect.untilMs < 0 ? -1 : toTick(effect.untilMs),
        });
      }
      for (const id of before.effects.keys())
        if (!now.effects.has(id))
          events.push({ k: "effectOff", t, target: u, effect: addEffect(id, "buff") });
      if (unit.status !== before.status) {
        if (unit.status === "down") events.push({ k: "down", t, u });
        else if (unit.status === "retreated") events.push({ k: "retreat", t, u });
      }
      seen.set(unit.id, now);
    }
    for (const side of state.sides) {
      const before = vision.get(side.id) ?? new Set<number>();
      const now = new Set(side.visible);
      for (const id of side.visible)
        if (!before.has(id)) events.push({ k: "vision", t, side: side.id, u: unitIndex(id), on: true });
      for (const id of before)
        if (!now.has(id)) events.push({ k: "vision", t, side: side.id, u: unitIndex(id), on: false });
      vision.set(side.id, now);
    }
    fired.clear();
    motioned.clear();
  };

  /**
   * 보기 화면이 아는 값과 다른 자원. exact가 아니면 체력·아머는 1이라도, 쉴드는 최대의 2%, MP·스태미나는 5% 바뀌었거나
   * 0·최대에 닿았을 때만 보낸다(1초마다 모두 보내면 리플레이의 반이 넘었다). 키프레임 앞·끝에는 exact로 맞춘다
   */
  const syncVitals = (t: number, exact: boolean): void => {
    for (const unit of state.units) {
      const now = vitalsOf(unit);
      const before = known.get(unit.id);
      const moved = (a: number, b: number, max: number, steps: number): boolean =>
        a !== b && (exact || b === 0 || b === max || Math.abs(a - b) * steps >= max);
      if (
        before &&
        before.hp === now.hp &&
        before.armor === now.armor &&
        !moved(before.shield, now.shield, unit.shieldHp, SHIELD_STEPS) &&
        !moved(before.mp, now.mp, unit.mpMax, RESOURCE_STEPS) &&
        !moved(before.stamina, now.stamina, unit.staminaMax, RESOURCE_STEPS)
      )
        continue;
      events.push({ k: "vitals", t, u: unitIndex(unit.id), ...now });
      known.set(unit.id, now);
    }
  };

  const byTick = new Map<number, BattleInput[]>();
  for (const input of inputs) {
    const list = byTick.get(input.tick) ?? [];
    list.push(input);
    byTick.set(input.tick, list);
  }
  const keyframes: ReplayKeyframe[] = [keyframe()];
  while (!state.result) {
    const t = state.tick;
    if (t > 0 && t % keyframeTicks === 0) keyframes.push(keyframe());
    battle.step(byTick.get(t) ?? []);
    diff(t);
    if ((t + 1) % keyframeTicks === 0) syncVitals(t, true);
    else if ((t + 1) % REPLAY_VITALS_TICKS === 0) syncVitals(t, false);
  }
  const result = state.result;
  syncVitals(state.tick - 1, true);
  events.push({ k: "end", t: result.endTick, winner: result.winner, reason: result.reason });

  const replay: BattleReplay = {
    formatVersion: BATTLE_REPLAY_FORMAT_VERSION,
    simVersion: SIM_VERSION,
    seed: state.seed,
    tickMs: c.tickMs,
    kind: state.kind,
    limitTicks: state.limitTicks,
    result: { winner: result.winner, reason: result.reason, endTick: result.endTick },
    arena: {
      size: init.map.size,
      ref: options.arena ?? null,
      passable: init.map.passable.slice(),
      cover: init.map.cover.slice(),
      buildings: init.map.buildings.map((building) => ({
        id: building.id,
        cells: [...building.cells].toSorted((a, b) => a - b),
        durability: building.durability,
        nexus: building.nexus,
        gateSide: building.gateSide ?? null,
      })),
    },
    sides: [...state.sides].map((side) => ({ id: side.id, defender: side.defender, edge: side.edge })),
    skills,
    effects,
    units,
    keyframes,
    events,
  };
  return { replay, result, finalState: snapshotBattle(state), state };
}
