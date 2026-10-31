// 전투 판정 코어 — docs/adr/2026-10-31-combat-core.md, ADR 35(전투맵 인스턴스)
// 한 틱(tickMs, 100ms) = 입력 적용 → 편마다 시야(틱 시작 위치) → 흐름장(fieldMs마다) → 파티 퇴각 기준 → 유닛마다(ID 차례) 행동
// (공격 또는 한 걸음) → 퇴각 판정 → 끝 판정. 행동 시각은 ms로 들고, 그 시각이 된 첫 틱 경계에서 한다(D-418 실시간).
// 공격 = 다음 행동 시각이 됐고 스태미나(속성이면 MP도)가 충분할 때. 걷기는 자원이 없다. 자원은 틱마다 조금씩 찬다.
// 정수·시드 굴림만 쓴다(굴림 하나 = 0~9999, (시드, 틱)마다 새 흐름, 공격마다 셋: 명중·회피·크리, D-419).
// 실시간·빨리감기·재생이 같은 함수다. 상태는 직렬화할 수 있는 값만 들고(스냅숏), 흐름장은 상태에서 다시 나오는 캐시다.
// [임시] 파티 AI는 "보이는 가장 가까운 적"과 퇴각 기준선(⑦)만 한다. 작전 슬라이더 ①~⑥은 R5(D-5040).
import { createRng } from "@terra/shared";
import { mix32 } from "../math/hash.ts";
import { type BattleMap, createBattleMap } from "./battleMap.ts";
import {
  type CombatCoefficients,
  TEST_COMBAT_COEFFICIENTS,
  msToTicks,
  staminaRegenMilli,
} from "./coefficients.ts";
import { NEIGHBORS, UNREACHABLE, distanceField, stepAllowed } from "./fields.ts";
import { hasStatus, modifiersOf, tickEffects } from "./effects.ts";
import { buildingDamage, resolveAttack, withAttackModifiers, withDefenseModifiers } from "./formula.ts";
import { lineClear } from "./los.ts";
import { visibleEnemies } from "./sight.ts";
import { pickSkill, resolveSkill, startSkill, takeDamage } from "./skills.ts";
import { active, electCommander, initialState, ready, spend, unitFrom } from "./battleState.ts";
import type {
  BattleInit,
  BattleInput,
  UnitState,
  PartyState,
  BattleResult,
  BattleState,
  Battle,
} from "./battleTypes.ts";

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(ax > bx ? ax - bx : bx - ax, ay > by ? ay - by : by - ay);

export function snapshotBattle(state: BattleState): string {
  return JSON.stringify(state);
}

export function createBattle(init: BattleInit, c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS): Battle {
  return makeBattle(init, initialState(init, c), c);
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

function makeBattle(init: BattleInit, state: BattleState, c: CombatCoefficients): Battle {
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

  const applyInput = (input: BattleInput): void => {
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

  const nexusOf = (gone: ReadonlySet<number>): number | undefined =>
    map.buildings.find((building) => building.nexus && !gone.has(building.id))?.id;

  const refreshAttackFields = (gone: ReadonlySet<number>): void => {
    attackFields = new Map();
    for (const side of state.sides) {
      // 공성 공격 쪽은 보이는 적이 없으면 넥서스로 간다(기억한 자리보다 목표가 먼저)
      let sources = side.lastSeen;
      if (side.visible.length === 0 && state.kind === "siege" && !side.defender) {
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
    unit.nextMoveMs = state.tick * c.tickMs + unit.moveIntervalMs;
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
    const hit = resolveAttack(
      withAttackModifiers(attacker.attack, modifiersOf(attacker)),
      withDefenseModifiers(target.defense, modifiersOf(target)),
      rolls,
      c,
    );
    spend(attacker, nowMs, c);
    if (!attacker.air && map.cover[attacker.y * size + attacker.x] === 1)
      attacker.revealUntilMs = nowMs + c.bushRevealMs;
    takeDamage(target, hit.amount, attacker.attack.kind);
    return true;
  };

  const attackBuilding = (attacker: UnitState, buildingId: number, nowMs: number): boolean => {
    if (!inRangeOfBuilding(attacker, buildingId)) return false;
    const building = state.buildings.find((entry) => entry.id === buildingId);
    if (!building || building.durability <= 0) return false;
    building.durability -= buildingDamage(attacker.attack, attacker.buildingMulPm, c);
    spend(attacker, nowMs, c);
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

  /** 스킬 사거리·시선(사거리 1 넘으면 직선이 열려야 한다, [임시] 곡사 스킬 없음) */
  const reach = (unit: UnitState, goal: UnitState, gone: ReadonlySet<number>) => (range: number) =>
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
    if (skill.target === "enemy" && !unit.air && map.cover[unit.y * size + unit.x] === 1)
      unit.revealUntilMs = nowMs + c.bushRevealMs;
    resolveSkill(unit, skill, goal, state.units, rng, nowMs, c);
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
    const index = pickSkill(unit, goal, nowMs, reach(unit, goal, gone), c);
    if (index < 0) return false;
    if (startSkill(unit, index, goal.id, nowMs, c)) fire(unit, index, goal, rng, nowMs);
    return true;
  };

  /** 시전이 끝났다: 목표가 아직 보이고 닿으면 푼다(아니면 빗나감, 자원·쿨은 이미 썼다) */
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
      if (!visible.includes(goal.id) || !reach(unit, goal, gone)(skill.range)) return;
    }
    fire(unit, cast.skill, goal, rng, nowMs);
  };

  const act = (
    unit: UnitState,
    rng: { nextInt(n: number): number },
    occupied: Int32Array,
    gone: ReadonlySet<number>,
  ): void => {
    const nowMs = state.tick * c.tickMs;
    if (hasStatus(unit, "stun")) return;
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
    let target: UnitState | undefined;
    if (command?.kind === "attack" && command.target > 0) {
      const chosen = unitById(command.target);
      const visible = state.sides.find((side) => side.id === unit.side)?.visible ?? [];
      if (chosen && active(chosen) && visible.includes(chosen.id)) target = chosen;
      else unit.command = null;
    }
    target ??= nearestVisible(unit);
    if (target) {
      const goal = target;
      if (useSkill(unit, goal, rng, gone, nowMs)) return;
      if (ready(unit, nowMs, c) && attackUnit(unit, goal, rng, gone, nowMs)) return;
      if (canMove && chebyshev(unit.x, unit.y, goal.x, goal.y) > unit.range) {
        const cell = goal.y * size + goal.x;
        const field =
          command?.kind === "attack"
            ? staticField(`cell:${unit.side}:${cell}`, () => [cell], unit.side, gone)
            : (attackFields.get(unit.side) ?? null);
        stepAlong(unit, field, occupied, gone);
      }
      return;
    }
    // 보이는 적이 없다: 공성 공격 쪽은 넥서스, 아니면 마지막 본 곳으로(없으면 그대로)
    const side = state.sides.find((entry) => entry.id === unit.side);
    if (state.kind === "siege" && side && !side.defender) {
      const nexus = nexusOf(gone);
      if (nexus !== undefined && ready(unit, nowMs, c) && attackBuilding(unit, nexus, nowMs)) return;
    }
    if (canMove) stepAlong(unit, attackFields.get(unit.side) ?? null, occupied, gone);
  };

  /** 자원이 틱마다 찬다(초당 최대값의 ‰) */
  const regen = (unit: UnitState): void => {
    unit.staminaMilli = Math.min(
      unit.staminaMax * 1000,
      unit.staminaMilli + staminaRegenMilli(unit.staminaScore, c),
    );
    unit.mpMilli = Math.min(
      unit.mpMax * 1000,
      unit.mpMilli + Math.floor(((unit.primaries[5] ?? 0) * c.mpRegenMilliPerWisPerSec * c.tickMs) / 1000),
    );
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
      if (side && (!commander || commander.party === party.id || commander.status !== "alive"))
        electCommander(state, side);
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
    for (const unit of state.units) if (active(unit)) tickEffects(unit, state.tick * c.tickMs);
    const gone = destroyed();
    const key = [...gone].join(",");
    if (key !== destroyedKey) {
      destroyedKey = key;
      staticFields.clear();
    }
    computeSight(gone);
    if (state.tick % msToTicks(c.fieldMs, c) === 0 || attackFields.size === 0) refreshAttackFields(gone);
    // 파티 퇴각 기준선(⑦): 파티 ID 차례
    for (const party of state.parties) if (!party.retreating && partyHpLow(party)) orderRetreat(party.id);
    const occupied = new Int32Array(size * size);
    for (const unit of state.units) if (active(unit) && !unit.air) occupied[unit.y * size + unit.x] = unit.id;
    const rng = createRng(mix32(state.seed ^ Math.imul(state.tick + 1, 0x9e37_79b1)));
    for (const unit of state.units)
      if (active(unit)) {
        regen(unit);
        act(unit, rng, occupied, gone);
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

/** 빨리감기: 끝까지 돌려 결과·끝 상태(JSON)를 낸다. onSnapshot은 스냅숏 간격마다 */
export function runBattle(
  init: BattleInit,
  inputs: readonly BattleInput[],
  onSnapshot?: (snapshot: string, tick: number) => void,
  c: CombatCoefficients = TEST_COMBAT_COEFFICIENTS,
): { result: BattleResult; finalState: string; state: BattleState } {
  const battle = createBattle(init, c);
  const { state, result } = battle.runToEnd(inputs, Number.POSITIVE_INFINITY, onSnapshot);
  if (!result) throw new Error("battle did not end");
  return { result, finalState: snapshotBattle(state), state };
}
