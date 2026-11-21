// 전투 판정 코어 — docs/adr/2026-10-31-combat-core.md, ADR 35(전투맵 인스턴스)
// 한 틱(tickMs, 100ms) = 입력 적용 → 편마다 시야(틱 시작 위치) → 흐름장(fieldMs마다) → 파티 퇴각 기준 → 유닛마다(틱마다 (시드, 틱)으로
// 섞은 차례, SIM_VERSION 4) 행동(공격 또는 한 걸음) → 퇴각 판정 → 끝 판정. 행동 시각은 ms로 들고, 그 시각이 된 첫 틱 경계에서 한다(D-418 실시간).
// 공격 = 다음 행동 시각이 됐고 스태미나(속성이면 MP도)가 충분할 때(탄을 쓰는 무기면 탄도, D-497). 걷기는 자원이 없다. 스태미나·MP·
// 쉴드·HP·아머는 분당 회복(2차 스탯 D-458·D-514, 아머는 최대 × 설정 칸)대로 틱마다 찬다. 피해는 두 몫이다(D-459): 물리 몫은 아머 HP부터,
// 속성 몫은 쉴드 HP부터 깎는다. HP가 문턱 아래면 가진 물약을 저절로 마신다(287·D-510, consumables.ts).
// 정수·시드 굴림만 쓴다(굴림 하나 = 0~9999, (시드, 틱)마다 새 흐름, 공격마다 셋: 명중·회피·크리, D-419).
// 실시간·빨리감기·재생이 같은 함수다. 상태는 직렬화할 수 있는 값만 들고(스냅숏), 흐름장은 상태에서 다시 나오는 캐시다.
// [임시] 파티 AI는 "보이는 가장 가까운 적"과 퇴각 기준선(⑦)만 한다. 작전 슬라이더 ①~⑥은 R5(D-5040).
// 파티·군단 명령(D-549, orders.ts): 유닛 대기 명령이 없는 유닛은 파티 명령(진형 전진·자리 지키기·목표 공격)을 따르고, 없으면 AI다.
// 움직임(docs/adr/2026-11-15-combat-moves.md, moves.ts): 달리기(AI 고리 wantsRun, 초당 스태미나)·이동 부품 스킬(돌진·도약·점멸·뒷걸음·
// 은신·감지·밀치기·끌어오기·묶기)·은신 들킴(틱 처음, 시야 전). 새 부품이 없는 전투는 옛 판정과 바이트까지 같다.
import { createRng } from "@terra/shared";
import { mix32 } from "../math/hash.ts";
import { type BattleMap, createBattleMap } from "./battleMap.ts";
import { breachField, breachTarget, hasBreakable } from "./breach.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS, msToTicks, regenOnTick } from "./coefficients.ts";
import { NEIGHBORS, UNREACHABLE, distanceField, stepAllowed } from "./fields.ts";
import { hasStatus, modifiersOf, moveIntervalMs, shieldRegenPerMinute, tickEffects } from "./effects.ts";
import { buildingDamage, resolveAttack, withAttackModifiers, withDefenseModifiers } from "./formula.ts";
import { lineClear } from "./los.ts";
import { visibleEnemies } from "./sight.ts";
import { pickSkill, resolveSkill, singleAlly, skillReaches, startSkill, takeDamage } from "./skills.ts";
import type { BattleTrace } from "./battleTrace.ts";
import { newAttackStages, recordApplied } from "./attackStages.ts";
import { active, electCommander, initialState, ready, spend, unitFrom } from "./battleState.ts";
import { drinkPotion } from "./consumables.ts";
import { wantsRun } from "./moveAi.ts";
import {
  type MoveWorld,
  breakStealth,
  drainRun,
  fireMoveSkill,
  setRunning,
  updateStealth,
  walkIntervalMs,
} from "./moves.ts";
import {
  NO_ORDERS,
  type OrderTick,
  type OrderWorld,
  applyOrderInput,
  dropUncommanded,
  oppositeEdgeCells,
  prepareOrders,
  standGoal,
  succeedCommanders,
} from "./orders.ts";
import { ownEdgeCells } from "./formation.ts";
import { planTactic } from "./tactics.ts";
import type {
  BattleInit,
  BattleInput,
  UnitState,
  PartyState,
  BattleResult,
  BattleState,
  Battle,
  PartyOrder,
} from "./battleTypes.ts";

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(ax > bx ? ax - bx : bx - ax, ay > by ? ay - by : by - ay);

/**
 * 한 틱의 유닛 행동 차례(상태 배열 자리): (시드, 틱)에서 만든 흐름으로 섞는다(피셔-예이츠). 공격 굴림 흐름과 따로라 굴림 수는 그대로다.
 * 상태에 들지 않고 시드·틱에서 다시 나오므로 스냅숏 재생이 바이트까지 같다
 */
export function actionOrder(count: number, seed: number, tick: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  const rng = createRng(mix32(seed ^ Math.imul(tick + 1, 0x85eb_ca6b) ^ 0x2c1b_3c6d));
  for (let i = count - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const swap = order[i] ?? i;
    order[i] = order[j] ?? j;
    order[j] = swap;
  }
  return order;
}

export function snapshotBattle(state: BattleState): string {
  return JSON.stringify(state);
}

/**
 * trace = 리플레이 기록용 관찰자(battleTrace.ts). 상태·굴림에 손대지 않으므로 있어도 없어도 결과가 같다
 * (docs/adr/2026-11-01-battle-replay.md 1절, 시험 replay.test.ts)
 */
export function createBattle(
  init: BattleInit,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
  trace?: BattleTrace,
): Battle {
  return makeBattle(init, initialState(init, c), c, trace);
}

/** 스냅숏에서 다시 켠다(같은 시작 자료가 있어야 한다: 지도는 스냅숏에 넣지 않는다) */
export function restoreBattle(
  init: BattleInit,
  snapshot: string,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
): Battle {
  const parsed: unknown = JSON.parse(snapshot);
  if (typeof parsed !== "object" || parsed === null || !("tick" in parsed) || !("units" in parsed))
    throw new Error("bad battle snapshot");
  // 흐름장은 fieldMs마다 새로 하므로 그 경계의 스냅숏만 같은 결과로 이어진다(snapshotMs는 fieldMs의 배수)
  if (typeof parsed.tick !== "number" || parsed.tick % msToTicks(c.fieldMs, c) !== 0)
    throw new Error("battle snapshot is not on a field boundary");
  // 스냅숏은 snapshotBattle이 만든 JSON이다(모양은 BattleState 그대로)
  return makeBattle(init, Object.assign(initialState(init, c), parsed), c);
}

function makeBattle(
  init: BattleInit,
  state: BattleState,
  c: CombatCoefficients,
  trace?: BattleTrace,
): Battle {
  const map: BattleMap = createBattleMap(init.map);
  const size = map.size;
  const nexusCells = new Map<number, number[]>();
  for (const building of map.buildings) nexusCells.set(building.id, [...building.cells]);
  const destroyed = (): Set<number> =>
    new Set(state.buildings.filter((b) => b.durability <= 0).map((b) => b.id));
  /** 흐름장 캐시(상태에서 다시 나온다) */
  let attackFields = new Map<number, Int32Array | null>();
  const staticFields = new Map<string, Int32Array>();
  let destroyedKey = "";
  // 성벽·성문이 있는 공성이면 공격 편은 넥서스까지 뚫기 거리장을 쓴다(breach.ts, 질문 1048 가). 없으면 옛 판정 그대로
  const breakable = hasBreakable(map);
  const breachFields = new Map<string, Int32Array | null>();
  const breachTo = (side: number, gone: ReadonlySet<number>): Int32Array | null => {
    const key = `${side}|${destroyedKey}`;
    if (!breachFields.has(key)) {
      const nexus = map.buildings.find((building) => building.nexus && !gone.has(building.id));
      breachFields.set(key, nexus ? breachField(map, nexus.cells, side, gone) : null);
    }
    return breachFields.get(key) ?? null;
  };

  const passFor = (side: number, gone: ReadonlySet<number>) => (cell: number) =>
    map.passableFor(cell, side, gone);
  const staticField = (
    key: string,
    sources: () => number[],
    side: number,
    gone: ReadonlySet<number>,
  ): Int32Array => {
    const full = `${key}|${destroyedKey}`;
    let field = staticFields.get(full);
    if (!field) {
      field = distanceField(map, sources(), passFor(side, gone));
      staticFields.set(full, field);
    }
    return field;
  };
  const edgeCells = (): number[] => {
    const out: number[] = [];
    for (let cell = 0; cell < size * size; cell++) if (map.inEdgeBand(cell, c.retreatBand)) out.push(cell);
    return out;
  };

  const unitById = (id: number): UnitState | undefined => state.units.find((unit) => unit.id === id);
  /**
   * 밀치기 부딪힘 피해를 건물에(D-570 1803 "건물 포함"): 시전자 편 건물(성문은 그 편, 공성의 다른 건물은 수비 편)은 받지 않는다. 일반
   * 전투의 건물은 주인이 없어 누가 밀어도 받는다. 내구도에서 빼고 관찰자에게 건물 피해로 알린다(attackBuilding과 같다)
   */
  const pushIntoBuilding = (source: UnitState, buildingId: number, amount: number): void => {
    const building = state.buildings.find((entry) => entry.id === buildingId);
    if (!building || building.durability <= 0) return;
    const owner =
      map.buildings.find((entry) => entry.id === buildingId)?.gateSide ??
      (state.kind === "siege" ? state.sides.find((side) => side.defender)?.id : undefined);
    if (owner === source.side) return;
    building.durability -= amount;
    if (trace) trace.building(source, buildingId, amount, building.durability);
  };
  /** 이번 틱의 점유 격자(틱 처음에 만든다 — 이동 부품이 고친다) */
  let tickOccupied = new Int32Array(size * size);
  const moveWorld = (gone: ReadonlySet<number>, nowMs: number): MoveWorld => ({
    map,
    gone,
    occupied: tickOccupied,
    units: state.units,
    c,
    nowMs,
    trace,
    reach: (from, goal, range) => reach(from, gone)(goal, range),
    hitBuilding: pushIntoBuilding,
  });
  /** 이번 틱의 파티·군단 명령 묶음(틱 시작에 준비) */
  let orderTick: OrderTick = NO_ORDERS;
  const orderWorld: OrderWorld = {
    state,
    size,
    c,
    passable: (cell, side) => map.passableFor(cell, side, destroyed()),
    orderRetreat: (partyId) => orderRetreat(partyId),
  };

  const applyInput = (input: BattleInput): void => {
    if (input.kind === "order" || input.kind === "legion") {
      applyOrderInput(orderWorld, input);
      return;
    }
    if (input.kind === "join") {
      if (!state.sides.some((side) => side.id === input.side.id))
        state.sides = [
          ...state.sides,
          { ...input.side, commander: 0, uncommanded: [], visible: [], lastSeen: [] },
        ].toSorted((a, b) => a.id - b.id);
      const added = input.units.map(unitFrom);
      state.units = [...state.units, ...added].toSorted((a, b) => a.id - b.id);
      state.parties = [
        ...state.parties,
        {
          ...input.party,
          maxHpSum: added.reduce((sum, unit) => sum + unit.maxHp, 0),
          retreating: false,
          retreated: false,
        },
      ].toSorted((a, b) => a.id - b.id);
      const side = state.sides.find((entry) => entry.id === input.side.id);
      if (side) electCommander(state, side);
      return;
    }
    const unit = unitById(input.unit);
    if (!unit || !active(unit) || state.tick * c.tickMs - unit.lastCommandMs < c.commandLockMs) {
      state.rejected += 1;
      return;
    }
    if (input.command.kind === "attack") {
      const target = input.command.target;
      const visible = state.sides.find((side) => side.id === unit.side)?.visible ?? [];
      if (target > 0 && !visible.includes(target)) {
        state.rejected += 1;
        return;
      }
    }
    unit.command = input.command;
    unit.cast = null;
    unit.lastCommandMs = state.tick * c.tickMs;
    // 퇴각은 파티 행동이다(D-205·D-207): 파티를 퇴각 중으로 두고 산 동료도 함께 물러난다([임시] 기술 해석)
    if (input.command.kind === "retreat") orderRetreat(unit.party);
  };

  const orderRetreat = (partyId: number): void => {
    const party = state.parties.find((entry) => entry.id === partyId);
    if (!party || party.retreated) return;
    party.retreating = true;
    for (const member of state.units)
      if (member.party === partyId && active(member)) {
        member.command = { kind: "retreat" };
        member.cast = null;
      }
  };

  const computeSight = (gone: ReadonlySet<number>): void => {
    const live = state.units.filter(active);
    for (const side of state.sides) {
      side.visible = visibleEnemies(map, side.id, live, live, state.tick * c.tickMs, gone, c);
      const memory = new Set(side.lastSeen);
      for (const id of side.visible) {
        const enemy = unitById(id);
        if (enemy) memory.add(enemy.y * size + enemy.x);
      }
      // 보이는 적이 있으면 기억을 그 자리로 새로 한다(오래된 자리는 버린다)
      side.lastSeen =
        side.visible.length > 0
          ? side.visible
              .map((id) => {
                const enemy = unitById(id);
                return enemy ? enemy.y * size + enemy.x : 0;
              })
              .toSorted((a, b) => a - b)
          : [...memory].toSorted((a, b) => a - b);
    }
  };

  const siegeAttacker = (unit: UnitState): boolean =>
    state.kind === "siege" && state.sides.some((side) => side.id === unit.side && !side.defender);

  const nexusOf = (gone: ReadonlySet<number>): number | undefined =>
    map.buildings.find((building) => building.nexus && !gone.has(building.id))?.id;

  const refreshAttackFields = (gone: ReadonlySet<number>): void => {
    attackFields = new Map();
    for (const side of state.sides) {
      // 공성 공격 쪽은 보이는 적이 없으면 넥서스로 간다(기억한 자리보다 목표가 먼저)
      let sources = side.lastSeen;
      if (side.visible.length === 0 && state.kind === "siege" && !side.defender) {
        if (breakable) {
          attackFields.set(side.id, breachTo(side.id, gone));
          continue;
        }
        const nexus = nexusOf(gone);
        sources = nexus === undefined ? [] : (nexusCells.get(nexus) ?? []);
      }
      attackFields.set(
        side.id,
        sources.length === 0 ? null : distanceField(map, sources, passFor(side.id, gone)),
      );
    }
  };

  /** 그 칸까지 거리장을 따라 한 걸음 */
  const stepAlong = (
    unit: UnitState,
    field: Int32Array | null,
    occupied: Int32Array,
    gone: ReadonlySet<number>,
  ): void => {
    if (!field) return;
    const here = unit.y * size + unit.x;
    let bestCell = -1;
    let bestValue = field[here] ?? UNREACHABLE;
    if (bestValue === UNREACHABLE) bestValue = 0x7fff_ffff;
    const pass = passFor(unit.side, gone);
    for (const [dx, dy] of NEIGHBORS) {
      if (!stepAllowed(size, unit.x, unit.y, dx, dy, unit.air ? () => true : pass)) continue;
      const to = (unit.y + dy) * size + unit.x + dx;
      const value = field[to] ?? UNREACHABLE;
      if (value === UNREACHABLE || value >= bestValue) continue;
      if (!unit.air && occupied[to] !== 0) continue;
      bestValue = value;
      bestCell = to;
    }
    if (bestCell < 0) return;
    if (!unit.air) {
      occupied[here] = 0;
      occupied[bestCell] = unit.id;
    }
    unit.x = bestCell % size;
    unit.y = (bestCell - unit.x) / size;
    // 느리게·빠르게(효과 move_speed)는 다음 걸음까지의 간격에 든다. 달리는 중이면 달리기 간격(moves.ts)
    unit.nextMoveMs = state.tick * c.tickMs + moveIntervalMs(unit, walkIntervalMs(unit, c));
  };

  /**
   * 성벽 뚫기: 사거리 안 넥서스 쪽 막음을 치고(준비가 안 됐으면 기다린다), 없으면 뚫기 장을 따라 걷는다. 건물을 부수지 못하는 유닛(건물 피해
   * 배율 0 — 마법형 크리쳐, D-5043)은 막음을 치지 않고 넥서스까지 걸어 닿는 길로 간다(길이 없으면 뚫기 장을 따라 막음 앞까지)
   */
  const breach = (
    unit: UnitState,
    occupied: Int32Array,
    gone: ReadonlySet<number>,
    canMove: boolean,
  ): void => {
    const field = breachTo(unit.side, gone);
    if (!field) return;
    if (unit.buildingMulPm <= 0) {
      if (!canMove) return;
      const nexus = nexusOf(gone);
      const walk =
        nexus === undefined
          ? null
          : staticField(`nexus:${unit.side}:${nexus}`, () => nexusCells.get(nexus) ?? [], unit.side, gone);
      const reachable = walk !== null && (walk[unit.y * size + unit.x] ?? UNREACHABLE) !== UNREACHABLE;
      stepAlong(unit, reachable ? walk : field, occupied, gone);
      return;
    }
    const nowMs = state.tick * c.tickMs;
    const wall = breachTarget(map, field, unit, gone);
    if (wall !== undefined) {
      if (ready(unit, nowMs, c)) attackBuilding(unit, wall, nowMs);
    } else if (canMove) stepAlong(unit, field, occupied, gone);
  };

  const inRangeOfBuilding = (unit: UnitState, buildingId: number): boolean =>
    (nexusCells.get(buildingId) ?? []).some((cell) => {
      const bx = cell % size;
      return chebyshev(unit.x, unit.y, bx, (cell - bx) / size) <= unit.range;
    });

  const attackUnit = (
    attacker: UnitState,
    target: UnitState,
    rng: { nextInt(n: number): number },
    gone: ReadonlySet<number>,
    nowMs: number,
  ): boolean => {
    if (chebyshev(attacker.x, attacker.y, target.x, target.y) > attacker.range) return false;
    if (attacker.range > 1 && !attacker.arc && !lineClear(map, attacker, target, gone)) return false;
    const rolls = {
      hit: rng.nextInt(10_000),
      evade: rng.nextInt(10_000),
      crit: rng.nextInt(10_000),
      critPos: rng.nextInt(10_000),
    };
    // 단계 기록은 관찰자가 원할 때만(전투 보고서 피해 흐름). 값·굴림은 그대로다
    const stages = trace?.attackStages ? newAttackStages("attack") : undefined;
    const hit = resolveAttack(
      withAttackModifiers(attacker.attack, modifiersOf(attacker)),
      withDefenseModifiers(target.defense, modifiersOf(target)),
      rolls,
      c,
      stages,
    );
    spend(attacker, nowMs, c);
    breakStealth(attacker, "attack", trace);
    if (!attacker.air && map.cover[attacker.y * size + attacker.x] === 1)
      attacker.revealUntilMs = nowMs + c.bushRevealMs;
    const before = stages ? { armor: target.armor, shield: target.shield, hp: target.hp } : undefined;
    takeDamage(target, hit.physical, hit.elemental);
    if (trace) trace.attack(attacker, target, hit);
    if (stages && before) {
      recordApplied(stages, before, target, hit.physical, hit.elemental);
      trace?.attackStages?.(attacker, target, stages);
    }
    return true;
  };

  const attackBuilding = (attacker: UnitState, buildingId: number, nowMs: number): boolean => {
    if (!inRangeOfBuilding(attacker, buildingId)) return false;
    const building = state.buildings.find((entry) => entry.id === buildingId);
    if (!building || building.durability <= 0) return false;
    const damage = buildingDamage(attacker.attack, attacker.buildingMulPm, c);
    building.durability -= damage;
    spend(attacker, nowMs, c);
    if (trace) trace.building(attacker, buildingId, damage, building.durability);
    return true;
  };

  const nearestVisible = (unit: UnitState): UnitState | undefined => {
    const visible = state.sides.find((side) => side.id === unit.side)?.visible ?? [];
    let best: UnitState | undefined;
    let bestD = 0;
    for (const id of visible) {
      const enemy = unitById(id);
      if (!enemy || !active(enemy)) continue;
      const d = chebyshev(unit.x, unit.y, enemy.x, enemy.y);
      if (!best || d < bestD) {
        best = enemy;
        bestD = d;
      }
    }
    return best;
  };

  /** 스킬 사거리·시선(사거리 1 넘으면 직선이 열려야 한다, [임시] 곡사 스킬 없음). 적·아군 대상 모두 */
  const reach = (unit: UnitState, gone: ReadonlySet<number>) => (goal: UnitState, range: number) =>
    chebyshev(unit.x, unit.y, goal.x, goal.y) <= range && (range <= 1 || lineClear(map, unit, goal, gone));

  const fire = (
    unit: UnitState,
    index: number,
    goal: UnitState,
    rng: { nextInt(n: number): number },
    nowMs: number,
  ): void => {
    const skill = unit.skills[index];
    if (!skill) return;
    if (skill.target === "enemy") {
      if (!unit.air && map.cover[unit.y * size + unit.x] === 1) unit.revealUntilMs = nowMs + c.bushRevealMs;
      breakStealth(unit, "attack", trace);
    }
    if (trace) trace.skill(unit, index, goal);
    if (skill.move || skill.displace) fireMoveSkill(moveWorld(destroyed(), nowMs), unit, skill, goal, rng);
    else resolveSkill(unit, skill, goal, state.units, rng, nowMs, c, trace);
  };

  /** 스킬을 고르고 쓴다(시전이 없으면 바로 푼다). 썼으면 true */
  const useSkill = (
    unit: UnitState,
    goal: UnitState,
    rng: { nextInt(n: number): number },
    gone: ReadonlySet<number>,
    nowMs: number,
  ): boolean => {
    if (unit.skills.length === 0) return false;
    const pick = pickSkill(unit, goal, nowMs, reach(unit, gone), c, state.units);
    if (!pick) return false;
    if (startSkill(unit, pick.index, pick.target.id, nowMs, c))
      fire(unit, pick.index, pick.target, rng, nowMs);
    return true;
  };

  /** 시전이 끝났다: 목표가 아직 보이고 닿으면 푼다(아군 하나는 닿으면. 아니면 빗나감, 자원·쿨은 이미 썼다) */
  const finishCast = (
    unit: UnitState,
    rng: { nextInt(n: number): number },
    gone: ReadonlySet<number>,
    nowMs: number,
  ): void => {
    const cast = unit.cast;
    unit.cast = null;
    const skill = cast ? unit.skills[cast.skill] : undefined;
    const goal = cast ? unitById(cast.target) : undefined;
    if (!cast || !skill || !goal || !active(goal)) return;
    if (skill.target === "enemy") {
      const visible = state.sides.find((side) => side.id === unit.side)?.visible ?? [];
      if (!visible.includes(goal.id) || !skillReaches(unit, skill, goal, reach(unit, gone))) return;
    } else if (singleAlly(skill) && !reach(unit, gone)(goal, skill.range)) return;
    fire(unit, cast.skill, goal, rng, nowMs);
  };

  const act = (
    unit: UnitState,
    rng: { nextInt(n: number): number },
    occupied: Int32Array,
    gone: ReadonlySet<number>,
  ): void => {
    const nowMs = state.tick * c.tickMs;
    const myParty = state.parties.find((entry) => entry.id === unit.party);
    // 달리기는 AI 고리가 정한다(명령 run 또는 aiTactics 슬라이더, moveAi.ts). 바뀔 때만 상태가 바뀐다
    if (wantsRun(unit, { retreating: myParty?.retreating === true }) !== (unit.running === true))
      setRunning(unit, !unit.running, c, trace);
    if (hasStatus(unit, "stun")) return;
    // 자동 물약(D-510): 스태미나·행동 시각을 쓰지 않는다(D-509). 시전·이동·공격과 같은 틱에 함께 한다
    if (unit.potions) {
      const drink = drinkPotion(unit, nowMs);
      if (drink && trace) trace.heal(unit, unit, { hp: drink.healed, shield: 0 }, "potion");
    }
    if (unit.cast) {
      if (nowMs >= unit.cast.atMs) finishCast(unit, rng, gone, nowMs);
      return;
    }
    const canMove = nowMs >= unit.nextMoveMs && !hasStatus(unit, "root");
    const command = unit.command;
    if (command?.kind === "retreat") {
      if (canMove)
        stepAlong(unit, staticField(`retreat:${unit.side}`, edgeCells, unit.side, gone), occupied, gone);
      return;
    }
    if (command?.kind === "move") {
      if (unit.y * size + unit.x === command.cell) unit.command = null;
      else if (canMove)
        stepAlong(
          unit,
          staticField(`cell:${unit.side}:${command.cell}`, () => [command.cell], unit.side, gone),
          occupied,
          gone,
        );
      return;
    }
    // 유닛 명령이 없으면 파티·군단 명령(D-549). 자리 지키기·칸 전진은 따로, 전진·목표 공격은 아래 AI 길에 진형 기다림·목표만 더한다
    const order = command === null ? orderTick.orders?.get(unit.party) : undefined;
    // 서서 싸우는 명령(자리 지키기·칸 전진·집결·따라가기)과 전개 방식(D-558)은 따로
    const standAt = order ? standGoal(order, unit, orderTick) : undefined;
    if (standAt !== undefined) {
      standOrSlot(unit, standAt, rng, occupied, gone, canMove && !orderTick.waiting.has(unit.id));
      return;
    }
    if (order?.kind === "tactic") {
      tacticAct(unit, order, rng, occupied, gone, canMove);
      return;
    }
    let target: UnitState | undefined;
    let focused = false;
    const visibleNow = (id: number): UnitState | undefined => {
      const chosen = unitById(id);
      const visible = state.sides.find((side) => side.id === unit.side)?.visible ?? [];
      return chosen && active(chosen) && visible.includes(chosen.id) ? chosen : undefined;
    };
    if (command?.kind === "attack" && command.target > 0) {
      target = visibleNow(command.target);
      if (!target) unit.command = null;
    } else if (order?.kind === "attack") {
      target = visibleNow(order.target);
      focused = target !== undefined;
    }
    target ??= nearestVisible(unit);
    // 진형 지키기: 묶음에서 너무 앞선 유닛은 걷지 않는다(목표 공격으로 목표가 보이면 쫓는다)
    const move = canMove && !(order !== undefined && !focused && orderTick.waiting.has(unit.id));
    if (target) {
      const goal = target;
      if (useSkill(unit, goal, rng, gone, nowMs)) return;
      if (ready(unit, nowMs, c) && attackUnit(unit, goal, rng, gone, nowMs)) return;
      if ((move || breakable) && chebyshev(unit.x, unit.y, goal.x, goal.y) > unit.range) {
        const cell = goal.y * size + goal.x;
        const field =
          command?.kind === "attack" || focused
            ? staticField(`cell:${unit.side}:${cell}`, () => [cell], unit.side, gone)
            : (attackFields.get(unit.side) ?? null);
        // 성벽 너머 적이라 걸어 닿지 못하면 공성 공격 편은 뚫는다
        if (
          breakable &&
          siegeAttacker(unit) &&
          (field?.[unit.y * size + unit.x] ?? UNREACHABLE) === UNREACHABLE
        )
          breach(unit, occupied, gone, move);
        else if (move) stepAlong(unit, field, occupied, gone);
      }
      return;
    }
    // 보이는 적이 없다: 공성 공격 쪽은 넥서스, 아니면 마지막 본 곳으로(없으면 그대로)
    const side = state.sides.find((entry) => entry.id === unit.side);
    if (state.kind === "siege" && side && !side.defender) {
      const nexus = nexusOf(gone);
      if (nexus !== undefined && ready(unit, nowMs, c) && attackBuilding(unit, nexus, nowMs)) return;
      if (breakable) {
        breach(unit, occupied, gone, move);
        return;
      }
    }
    // 전진 명령은 본 적이 없어도 맞은편 가장자리 쪽으로 간다
    if (move)
      stepAlong(
        unit,
        attackFields.get(unit.side) ?? (order ? advanceField(unit, gone) : null),
        occupied,
        gone,
      );
  };

  /** 맞은편 가장자리까지 거리장(전진 방향) */
  const advanceField = (unit: UnitState, gone: ReadonlySet<number>): Int32Array => {
    const edge = state.sides.find((side) => side.id === unit.side)?.edge ?? 3;
    return staticField(`advance:${unit.side}`, () => oppositeEdgeCells(edge, size), unit.side, gone);
  };

  /** 서서 싸우는 명령: 닿는 적만 치고(공성 공격 편은 닿는 넥서스도), 설 칸이 있으면 그리로 걷는다(null = 움직이지 않음). 적을 쫓지 않는다 */
  const standOrSlot = (
    unit: UnitState,
    goal: number | null,
    rng: { nextInt(n: number): number },
    occupied: Int32Array,
    gone: ReadonlySet<number>,
    canMove: boolean,
  ): void => {
    const nowMs = state.tick * c.tickMs;
    const target = nearestVisible(unit);
    if (target) {
      if (useSkill(unit, target, rng, gone, nowMs)) return;
      if (ready(unit, nowMs, c) && attackUnit(unit, target, rng, gone, nowMs)) return;
    }
    if (siegeAttacker(unit)) {
      const nexus = nexusOf(gone);
      if (nexus !== undefined && ready(unit, nowMs, c) && attackBuilding(unit, nexus, nowMs)) return;
    }
    if (goal === null || !canMove || goal === unit.y * size + unit.x) return;
    stepAlong(
      unit,
      staticField(`cell:${unit.side}:${goal}`, () => [goal], unit.side, gone),
      occupied,
      gone,
    );
  };

  /** AI 전개 방식(D-558 2차, tactics.ts planTactic): 계획대로 치고, 쫓거나 물러나거나 길을 걷는다 */
  const tacticAct = (
    unit: UnitState,
    order: Extract<PartyOrder, { kind: "tactic" }>,
    rng: { nextInt(n: number): number },
    occupied: Int32Array,
    gone: ReadonlySet<number>,
    canMove: boolean,
  ): void => {
    const nowMs = state.tick * c.tickMs;
    const side = state.sides.find((entry) => entry.id === unit.side);
    const edge = side?.edge ?? 3;
    const enemies: UnitState[] = [];
    for (const id of side?.visible ?? []) {
      const enemy = unitById(id);
      if (enemy && active(enemy)) enemies.push(enemy);
    }
    const commanders = new Set(
      state.sides.filter((entry) => entry.id !== unit.side).map((entry) => entry.commander),
    );
    const anchor = order.slots?.find((slot) => slot.unit === unit.id)?.cell;
    const plan = planTactic(unit, order.tactic, {
      size,
      edge,
      enemies,
      commanders,
      anchor,
      retreatBand: c.retreatBand,
      k: c.tactics,
    });
    const target = plan.target;
    if (target) {
      if (useSkill(unit, target, rng, gone, nowMs)) return;
      if (ready(unit, nowMs, c) && attackUnit(unit, target, rng, gone, nowMs)) return;
    } else if (siegeAttacker(unit)) {
      const nexus = nexusOf(gone);
      if (nexus !== undefined && ready(unit, nowMs, c) && attackBuilding(unit, nexus, nowMs)) return;
      if (breakable && !plan.stay) {
        breach(unit, occupied, gone, canMove);
        return;
      }
    }
    if (!canMove) return;
    if (plan.back) {
      stepAlong(
        unit,
        staticField(`back:${unit.side}`, () => ownEdgeCells(edge, size), unit.side, gone),
        occupied,
        gone,
      );
      return;
    }
    const distance = target ? chebyshev(unit.x, unit.y, target.x, target.y) : 0;
    // 닿는 적이 있으면(행동 시각 전이라 못 쳤어도) 그 자리를 지킨다
    if (target && distance <= unit.range) return;
    if (target && plan.chase) {
      // 가까운 적이면 편 공격 흐름장(옛 AI 길), 고른 적이면 그 칸까지 거리장
      const cell = target.y * size + target.x;
      const field =
        target === nearestVisible(unit)
          ? (attackFields.get(unit.side) ?? null)
          : staticField(`cell:${unit.side}:${cell}`, () => [cell], unit.side, gone);
      stepAlong(unit, field, occupied, gone);
      return;
    }
    if (plan.goal) {
      stepAlong(unit, staticField(plan.goal.key, plan.goal.cells, unit.side, gone), occupied, gone);
      return;
    }
    if (plan.stay || target) return;
    stepAlong(unit, attackFields.get(unit.side) ?? advanceField(unit, gone), occupied, gone);
  };

  /**
   * 스태미나·MP(밀리점)·쉴드·HP·아머가 틱마다 찬다: 분당 회복을 틱에 나눈 몫(regenOnTick), 최대에서 멈춘다(D-458).
   * 쉴드는 맞는 중에도 일정하게 찬다(D-490). 쉴드 재생 효과(저주·버프, 효과 사전 stat shield_regen ‰)가 분당 재생을 바꾼다.
   * HP(2차 스탯 hp_regen)·아머(최대 × n54_armor_regen ‰)도 전투 중에 쉴드처럼 찬다(D-514). 산 유닛만 부른다(쓰러진 유닛은 일어나지 않는다)
   */
  const regen = (unit: UnitState): void => {
    const tick = state.tick;
    const hpRegen = unit.hpRegen ?? 0;
    if (hpRegen > 0 && unit.hp < unit.maxHp)
      unit.hp = Math.min(unit.maxHp, unit.hp + regenOnTick(hpRegen, tick, 1, c));
    const armorRegen = unit.armorRegen ?? 0;
    if (armorRegen > 0 && unit.armor < unit.armorHp)
      unit.armor = Math.min(unit.armorHp, unit.armor + regenOnTick(armorRegen, tick, 1, c));
    if (unit.staminaMilli < unit.staminaMax * 1000)
      unit.staminaMilli = Math.min(
        unit.staminaMax * 1000,
        unit.staminaMilli + regenOnTick(unit.staminaRegen, tick, 1000, c),
      );
    if (unit.mpMilli < unit.mpMax * 1000)
      unit.mpMilli = Math.min(unit.mpMax * 1000, unit.mpMilli + regenOnTick(unit.mpRegen, tick, 1000, c));
    if (unit.shield < unit.shieldHp)
      unit.shield = Math.min(
        unit.shieldHp,
        unit.shield + regenOnTick(shieldRegenPerMinute(unit, unit.shieldRegen), tick, 1, c),
      );
    // 달리는 중이면 초당 스태미나(모자라면 달리기가 꺼진다)
    drainRun(unit, tick, c, trace);
  };

  const partyHpLow = (party: PartyState): boolean => {
    if (party.retreatHpPct <= 0 || party.retreated) return false;
    let hp = 0;
    for (const unit of state.units) if (unit.party === party.id && unit.status === "alive") hp += unit.hp;
    return hp * 100 < party.retreatHpPct * party.maxHpSum;
  };

  const checkRetreats = (): void => {
    for (const party of state.parties) {
      // 퇴각 중인 파티만 빠진다. 구역에 서 있거나 쫓아 들어온 것만으로는 빠지지 않는다(D-434)
      if (party.retreated || !party.retreating) continue;
      const members = state.units.filter((unit) => unit.party === party.id && unit.status !== "retreated");
      const living = members.filter(active);
      if (living.length === 0) continue;
      // 퇴각 구역에 들어간 시각을 적고, 산 유닛 모두가 머무는 시간(C23)을 채우면 빠진다
      const nowMs = state.tick * c.tickMs;
      for (const unit of living)
        if (!map.inEdgeBand(unit.y * size + unit.x, c.retreatBand)) unit.bandSinceMs = -1;
        else if (unit.bandSinceMs < 0) unit.bandSinceMs = nowMs;
      if (!living.every((unit) => unit.bandSinceMs >= 0 && nowMs - unit.bandSinceMs >= c.retreatDwellMs))
        continue;
      party.retreated = true;
      // 쓰러진 동료도 데리고 나간다(D-225)
      for (const unit of members) unit.status = "retreated";
      const side = state.sides.find((entry) => entry.id === party.side);
      const commander = side ? unitById(side.commander) : undefined;
      if (side && (!commander || commander.party === party.id || commander.status !== "alive")) {
        // D-571(답 1967): 퇴각 승계도 쓰러짐 승계와 같은 순서(작위 → 전투 랭킹)이고, 새 정원 밖 파티는 군단 명령을 내려놓는다
        electCommander(state, side);
        dropUncommanded(state, side);
      }
    }
  };

  const finish = (winner: number, reason: BattleResult["reason"]): void => {
    state.result = { winner, reason, endTick: state.tick };
  };

  const checkEnd = (gone: ReadonlySet<number>): void => {
    const defender = state.sides.find((side) => side.defender)?.id ?? state.sides[0]?.id ?? 0;
    const attacker = state.sides.find((side) => !side.defender)?.id ?? defender;
    if (state.kind === "siege" && map.buildings.some((b) => b.nexus) && nexusOf(gone) === undefined) {
      finish(attacker, "nexus");
      return;
    }
    // 공성 수비 쪽은 넥서스가 서 있는 동안 남아 있다(수비 쪽이 건물뿐인 공격, ADR 35 끝 조건 2)
    const nexusStands = state.kind === "siege" && nexusOf(gone) !== undefined;
    const standing = state.sides.filter(
      (side) =>
        state.units.some((unit) => unit.side === side.id && active(unit)) || (side.defender && nexusStands),
    );
    if (standing.length <= 1) {
      finish(standing[0]?.id ?? defender, "wipe");
      return;
    }
    if (state.tick >= state.limitTicks) {
      // 수비 승. 다른 편은 쓰러진 유닛까지 모두 퇴각 처리(D-210·D-231)
      for (const unit of state.units)
        if (unit.side !== defender && unit.status !== "retreated") unit.status = "retreated";
      for (const party of state.parties) if (party.side !== defender) party.retreated = true;
      finish(defender, "timeout");
    }
  };

  const step = (inputs: readonly BattleInput[]): void => {
    if (state.result) return;
    for (const input of inputs) if (input.tick === state.tick) applyInput(input);
    // 효과: 끝난 것을 지우고 지속 피해·회복을 적용한다(시야 전에, 쓰러진 유닛은 보이지 않게)
    for (const unit of state.units)
      if (active(unit))
        tickEffects(
          unit,
          state.tick * c.tickMs,
          trace
            ? (effect, change) => {
                if (effect.kind === "heal") trace.heal(null, unit, { hp: change, shield: 0 }, effect.id);
                else trace.dot(unit, effect.id, change);
              }
            : undefined,
        );
    const gone = destroyed();
    // 은신: 끝났거나 들킨 유닛의 은신을 깬다(시야 전, moves.ts)
    updateStealth(map, state.units, gone, state.tick * c.tickMs, c, trace);
    const key = [...gone].join(",");
    if (key !== destroyedKey) {
      destroyedKey = key;
      staticFields.clear();
      breachFields.clear();
    }
    computeSight(gone);
    if (state.tick % msToTicks(c.fieldMs, c) === 0 || attackFields.size === 0) refreshAttackFields(gone);
    // 파티·군단 명령 묶음(명령이 없으면 옛 길 그대로). 쓰러진 지휘관은 먼저 승계(D-558 1545, 군단 명령을 받은 편만)
    succeedCommanders(state);
    orderTick = prepareOrders(orderWorld, (unit, cell) =>
      staticField(`cell:${unit.side}:${cell}`, () => [cell], unit.side, gone),
    );
    // 파티 퇴각 기준선(⑦): 파티 ID 차례
    for (const party of state.parties) if (!party.retreating && partyHpLow(party)) orderRetreat(party.id);
    const occupied = new Int32Array(size * size);
    for (const unit of state.units) if (active(unit) && !unit.air) occupied[unit.y * size + unit.x] = unit.id;
    tickOccupied = occupied;
    const rng = createRng(mix32(state.seed ^ Math.imul(state.tick + 1, 0x9e37_79b1)));
    // 행동 차례는 틱마다 (시드, 틱)으로 섞는다(SIM_VERSION 4). ID 차례로 돌면 같은 틱에 앞 차례의 걸음을 본 뒤 차례 유닛이
    // 바로 쳐서, 같은 유닛끼리도 거리 홀짝과 ID로 선공이 정해졌다(밸런스 화면 진단, docs/adr/2026-11-01-balance-screen.md)
    for (const index of actionOrder(state.units.length, state.seed, state.tick)) {
      const unit = state.units[index];
      if (unit && active(unit)) {
        regen(unit);
        act(unit, rng, occupied, gone);
      }
    }
    checkRetreats();
    state.tick += 1;
    checkEnd(destroyed());
  };

  return {
    state,
    step,
    runToEnd(inputs, maxTicks = Number.POSITIVE_INFINITY, onSnapshot) {
      const byTick = new Map<number, BattleInput[]>();
      for (const input of inputs) {
        const list = byTick.get(input.tick) ?? [];
        list.push(input);
        byTick.set(input.tick, list);
      }
      let ran = 0;
      while (!state.result && ran < maxTicks) {
        if (onSnapshot && state.tick > 0 && state.tick % msToTicks(c.snapshotMs, c) === 0)
          onSnapshot(snapshotBattle(state), state.tick);
        step(byTick.get(state.tick) ?? []);
        ran += 1;
      }
      return { state, result: state.result, rejected: state.rejected };
    },
  };
}

/** 빨리감기: 끝까지 돌려 결과·끝 상태(JSON)를 낸다. onSnapshot은 스냅숏 간격마다, trace는 판정 관찰자(선택, 전투 실험실 통계) */
export function runBattle(
  init: BattleInit,
  inputs: readonly BattleInput[],
  onSnapshot?: (snapshot: string, tick: number) => void,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
  trace?: BattleTrace,
): { result: BattleResult; finalState: string; state: BattleState } {
  const battle = createBattle(init, c, trace);
  const { state, result } = battle.runToEnd(inputs, Number.POSITIVE_INFINITY, onSnapshot);
  if (!result) throw new Error("battle did not end");
  return { result, finalState: snapshotBattle(state), state };
}
