// 전투 판정 코어 — docs/adr/2026-10-31-combat-core.md, ADR 35(전투맵 인스턴스)
// 한 틱(200ms) = 입력 적용 → 편마다 시야(틱 시작 위치) → 흐름장(fieldTicks마다) → 파티 퇴각 기준 → 유닛마다(ID 차례) 행동
// (공격 또는 한 걸음) → 퇴각 판정 → 끝 판정. 정수·시드 굴림만 쓴다(굴림 하나 = 0~9999, (시드, 틱)마다 새 흐름).
// 실시간·빨리감기·재생이 같은 함수다. 상태는 직렬화할 수 있는 값만 들고(스냅숏), 흐름장은 상태에서 다시 나오는 캐시다.
// [임시] 파티 AI는 "보이는 가장 가까운 적"과 퇴각 기준선(⑦)만 한다. 작전 슬라이더 ①~⑥은 R5(D-5040).
import { createRng } from "@terra/shared";
import { mix32 } from "../math/hash.ts";
import { type BattleMap, type BattleMapInput, createBattleMap } from "./battleMap.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS } from "./coefficients.ts";
import { NEIGHBORS, UNREACHABLE, distanceField, stepAllowed } from "./fields.ts";
import { type AttackProfile, type DefenseProfile, buildingDamage, computeDamage } from "./formula.ts";
import { lineClear } from "./los.ts";
import { visibleEnemies } from "./sight.ts";

/** 편의 가장자리(들어오는 변): 0 북(y 작음), 1 동, 2 남, 3 서 */
export type Edge = 0 | 1 | 2 | 3;

export interface CombatUnitSpec {
  readonly id: number;
  readonly side: number;
  readonly party: number;
  readonly x: number;
  readonly y: number;
  readonly maxHp: number;
  readonly armorHp: number;
  readonly shieldHp: number;
  readonly attack: AttackProfile;
  readonly defense: DefenseProfile;
  /** 사거리(체비쇼프 칸) */
  readonly range: number;
  /** 곡사(질문 96: 차폐를 넘는다) */
  readonly arc: boolean;
  readonly attackTicks: number;
  /** 한 칸 가는 틱(전투 속도, C28 [임시] 1칸/초 이하 = 5틱 이상) */
  readonly moveTicks: number;
  readonly wis: number;
  readonly agi: number;
  /** 시선 높이(16배 cm) */
  readonly eye: number;
  readonly air: boolean;
  /** 지휘 정원(파티 수, D-179·C7) */
  readonly commandCap: number;
  readonly cyborg: boolean;
  /** 건물 피해 배율(천분율, C32) */
  readonly buildingMulPm: number;
}

export interface BattleSideSpec {
  readonly id: number;
  readonly faction: number;
  readonly defender: boolean;
  readonly edge: Edge;
}

export interface BattlePartySpec {
  readonly id: number;
  readonly side: number;
  /** 퇴각 기준(파티 HP %, ⑦). 0이면 쓰지 않는다 */
  readonly retreatHpPct: number;
}

export interface BattleInit {
  readonly id: number;
  readonly kind: "normal" | "siege";
  readonly seed: number;
  readonly map: BattleMapInput;
  readonly sides: readonly BattleSideSpec[];
  readonly parties: readonly BattlePartySpec[];
  readonly units: readonly CombatUnitSpec[];
  /** 제한 시간(틱). 없으면 종류 기본값(C2) */
  limitTicks?: number | undefined;
}

export type Command =
  | { kind: "move"; cell: number }
  | { kind: "attack"; target: number }
  | { kind: "retreat" };

/** 입력(틱 차례, 같은 틱이면 배열 차례): 대기 명령 1칸(D-177·D-180), 참전(파티 단위, D-209) */
export type BattleInput =
  | { readonly tick: number; readonly kind: "command"; readonly unit: number; readonly command: Command }
  | {
      readonly tick: number;
      readonly kind: "join";
      readonly side: BattleSideSpec;
      readonly party: BattlePartySpec;
      readonly units: readonly CombatUnitSpec[];
    };

export type UnitStatus = "alive" | "down" | "retreated";

export interface UnitState extends CombatUnitSpec {
  x: number;
  y: number;
  hp: number;
  armor: number;
  shield: number;
  status: UnitStatus;
  cooldown: number;
  moveWait: number;
  revealUntil: number;
  command: Command | null;
  lastCommandTick: number;
}

export interface PartyState extends BattlePartySpec {
  /** 들어올 때 모든 유닛의 최대 HP 합(파티 HP % 분모) */
  maxHpSum: number;
  retreated: boolean;
}

export interface SideState extends BattleSideSpec {
  /** 지휘관(없으면 0)과 지휘 없음 파티(D-331) */
  commander: number;
  uncommanded: number[];
  /** 지금 보이는 적(틱 시작) */
  visible: number[];
  /** 마지막으로 본 칸(놓친 적 찾기) */
  lastSeen: number[];
}

export interface BattleResult {
  /** 이긴 편 */
  readonly winner: number;
  readonly reason: "nexus" | "wipe" | "timeout";
  readonly endTick: number;
}

export interface BattleState {
  tick: number;
  readonly kind: "normal" | "siege";
  readonly seed: number;
  readonly limitTicks: number;
  units: UnitState[];
  parties: PartyState[];
  sides: SideState[];
  buildings: { id: number; durability: number }[];
  rejected: number;
  result: BattleResult | null;
}

export interface Battle {
  readonly state: BattleState;
  /** 한 틱(그 틱의 입력과 함께) */
  step(inputs: readonly BattleInput[]): void;
  /** 끝날 때까지(또는 maxTicks까지). 입력은 틱 차례로 넣는다 */
  runToEnd(
    inputs: readonly BattleInput[],
    maxTicks?: number,
    onSnapshot?: (snapshot: string, tick: number) => void,
  ): { state: BattleState; result: BattleResult | null; rejected: number };
}

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(ax > bx ? ax - bx : bx - ax, ay > by ? ay - by : by - ay);

/** 살아 있고 빠지지 않은 유닛 */
function active(unit: UnitState): boolean {
  return unit.status === "alive";
}

function unitFrom(spec: CombatUnitSpec): UnitState {
  return {
    ...spec,
    hp: spec.maxHp,
    armor: spec.armorHp,
    shield: spec.shieldHp,
    status: "alive",
    cooldown: 0,
    moveWait: 0,
    revealUntil: -1,
    command: null,
    lastCommandTick: -1_000_000,
  };
}

/** 지휘관 = 남은 유닛 가운데 지휘 정원이 가장 큰 유닛(같으면 작은 ID), 정원 밖 파티는 지휘 없음(D-331) */
function electCommander(state: BattleState, side: SideState): void {
  let best: UnitState | undefined;
  for (const unit of state.units) {
    if (unit.side !== side.id || unit.status !== "alive" || unit.commandCap <= 0) continue;
    if (!best || unit.commandCap > best.commandCap) best = unit;
  }
  side.commander = best?.id ?? 0;
  const parties = state.parties
    .filter((party) => party.side === side.id && !party.retreated)
    .map((party) => party.id);
  side.uncommanded = parties.slice(best ? best.commandCap : 0);
}

export function snapshotBattle(state: BattleState): string {
  return JSON.stringify(state);
}

function initialState(init: BattleInit, c: CombatCoefficients): BattleState {
  const limit = init.limitTicks ?? (init.kind === "siege" ? c.limitTicks.siege : c.limitTicks.normal);
  if (!Number.isInteger(limit) || limit < 1 || limit > c.limitTicks.max)
    throw new RangeError(`limitTicks must be in [1, ${c.limitTicks.max}]`);
  const units = init.units.map(unitFrom).toSorted((a, b) => a.id - b.id);
  const parties = init.parties
    .map((party) => ({
      ...party,
      maxHpSum: units.filter((unit) => unit.party === party.id).reduce((sum, unit) => sum + unit.maxHp, 0),
      retreated: false,
    }))
    .toSorted((a, b) => a.id - b.id);
  const state: BattleState = {
    tick: 0,
    kind: init.kind,
    seed: init.seed >>> 0,
    limitTicks: limit,
    units,
    parties,
    sides: init.sides
      .map((side) => ({ ...side, commander: 0, uncommanded: [], visible: [], lastSeen: [] }))
      .toSorted((a, b) => a.id - b.id),
    buildings: init.map.buildings.map((building) => ({ id: building.id, durability: building.durability })),
    rejected: 0,
    result: null,
  };
  for (const side of state.sides) electCommander(state, side);
  return state;
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
        { ...input.party, maxHpSum: added.reduce((sum, unit) => sum + unit.maxHp, 0), retreated: false },
      ].toSorted((a, b) => a.id - b.id);
      const side = state.sides.find((entry) => entry.id === input.side.id);
      if (side) electCommander(state, side);
      return;
    }
    const unit = unitById(input.unit);
    if (!unit || !active(unit) || state.tick - unit.lastCommandTick < c.commandLockTicks) {
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
    unit.lastCommandTick = state.tick;
  };

  const computeSight = (gone: ReadonlySet<number>): void => {
    const live = state.units.filter(active);
    for (const side of state.sides) {
      side.visible = visibleEnemies(map, side.id, live, live, state.tick, gone, c);
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
      let sources = side.lastSeen;
      if (sources.length === 0 && state.kind === "siege" && !side.defender) {
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
    unit.moveWait = unit.moveTicks;
  };

  const inRangeOfBuilding = (unit: UnitState, buildingId: number): boolean =>
    (nexusCells.get(buildingId) ?? []).some((cell) => {
      const bx = cell % size;
      return chebyshev(unit.x, unit.y, bx, (cell - bx) / size) <= unit.range;
    });

  const attackUnit = (
    attacker: UnitState,
    target: UnitState,
    roll: number,
    gone: ReadonlySet<number>,
  ): boolean => {
    if (chebyshev(attacker.x, attacker.y, target.x, target.y) > attacker.range) return false;
    if (attacker.range > 1 && !attacker.arc && !lineClear(map, attacker, target, gone)) return false;
    const hit = computeDamage(attacker.attack, target.defense, roll, c);
    let left = hit.amount;
    if (attacker.attack.kind === "physical") {
      const absorbed = Math.min(target.armor, left);
      target.armor -= absorbed;
      left -= absorbed;
    } else {
      const absorbed = Math.min(target.shield, left);
      target.shield -= absorbed;
      left -= absorbed;
    }
    target.hp -= left;
    if (target.hp <= 0) {
      target.hp = 0;
      target.status = "down";
      target.command = null;
    }
    if (!attacker.air && map.cover[attacker.y * size + attacker.x] === 1)
      attacker.revealUntil = state.tick + c.bushRevealTicks;
    attacker.cooldown = attacker.attackTicks;
    return true;
  };

  const attackBuilding = (attacker: UnitState, buildingId: number): boolean => {
    if (!inRangeOfBuilding(attacker, buildingId)) return false;
    const building = state.buildings.find((entry) => entry.id === buildingId);
    if (!building || building.durability <= 0) return false;
    building.durability -= buildingDamage(attacker.attack, attacker.buildingMulPm, c);
    attacker.cooldown = attacker.attackTicks;
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

  const act = (
    unit: UnitState,
    rng: { nextInt(n: number): number },
    occupied: Int32Array,
    gone: ReadonlySet<number>,
  ): void => {
    if (unit.cooldown > 0) unit.cooldown -= 1;
    if (unit.moveWait > 0) unit.moveWait -= 1;
    const command = unit.command;
    if (command?.kind === "retreat") {
      if (unit.moveWait === 0)
        stepAlong(unit, staticField(`retreat:${unit.side}`, edgeCells, unit.side, gone), occupied, gone);
      return;
    }
    if (command?.kind === "move") {
      if (unit.y * size + unit.x === command.cell) unit.command = null;
      else if (unit.moveWait === 0)
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
      if (unit.cooldown === 0 && attackUnit(unit, target, rng.nextInt(10_000), gone)) return;
      if (unit.moveWait === 0 && chebyshev(unit.x, unit.y, target.x, target.y) > unit.range) {
        const own =
          command?.kind === "attack"
            ? staticField(
                `cell:${unit.side}:${target.y * size + target.x}`,
                () => [target.y * size + target.x],
                unit.side,
                gone,
              )
            : (attackFields.get(unit.side) ?? null);
        stepAlong(unit, own, occupied, gone);
      }
      return;
    }
    // 보이는 적이 없다: 공성 공격 쪽은 넥서스, 아니면 마지막 본 곳으로(없으면 그대로)
    const side = state.sides.find((entry) => entry.id === unit.side);
    if (state.kind === "siege" && side && !side.defender) {
      const nexus = nexusOf(gone);
      if (nexus !== undefined && unit.cooldown === 0 && attackBuilding(unit, nexus)) return;
    }
    if (unit.moveWait === 0) stepAlong(unit, attackFields.get(unit.side) ?? null, occupied, gone);
  };

  const partyHpLow = (party: PartyState): boolean => {
    if (party.retreatHpPct <= 0 || party.retreated) return false;
    let hp = 0;
    for (const unit of state.units) if (unit.party === party.id && unit.status === "alive") hp += unit.hp;
    return hp * 100 < party.retreatHpPct * party.maxHpSum;
  };

  const checkRetreats = (): void => {
    for (const party of state.parties) {
      if (party.retreated) continue;
      const members = state.units.filter((unit) => unit.party === party.id && unit.status !== "retreated");
      const living = members.filter(active);
      if (living.length === 0) continue;
      if (!living.every((unit) => map.inEdgeBand(unit.y * size + unit.x, c.retreatBand))) continue;
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
    const gone = destroyed();
    const key = [...gone].join(",");
    if (key !== destroyedKey) {
      destroyedKey = key;
      staticFields.clear();
    }
    computeSight(gone);
    if (state.tick % c.fieldTicks === 0 || attackFields.size === 0) refreshAttackFields(gone);
    // 파티 퇴각 기준선(⑦): 파티 ID 차례
    for (const party of state.parties)
      if (partyHpLow(party))
        for (const unit of state.units)
          if (unit.party === party.id && active(unit)) unit.command = { kind: "retreat" };
    const occupied = new Int32Array(size * size);
    for (const unit of state.units) if (active(unit) && !unit.air) occupied[unit.y * size + unit.x] = unit.id;
    const rng = createRng(mix32(state.seed ^ Math.imul(state.tick + 1, 0x9e37_79b1)));
    for (const unit of state.units) if (active(unit)) act(unit, rng, occupied, gone);
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
        if (onSnapshot && state.tick > 0 && state.tick % c.snapshotTicks === 0)
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
