// 전투 판정 코어 — docs/adr/2026-10-31-combat-core.md, ADR 35(전투맵 인스턴스)
// 한 틱(tickMs, 100ms) = 입력 적용 → 편마다 시야(틱 시작 위치) → 흐름장(fieldMs마다) → 파티 퇴각 기준 → 유닛마다(ID 차례) 행동
// (공격 또는 한 걸음) → 퇴각 판정 → 끝 판정. 행동 시각은 ms로 들고, 그 시각이 된 첫 틱 경계에서 한다(D-418 실시간).
// 공격 = 다음 행동 시각이 됐고 스태미나(속성이면 MP도)가 충분할 때. 걷기는 자원이 없다. 자원은 틱마다 조금씩 찬다.
// 정수·시드 굴림만 쓴다(굴림 하나 = 0~9999, (시드, 틱)마다 새 흐름, 공격마다 셋: 명중·회피·크리, D-419).
// 실시간·빨리감기·재생이 같은 함수다. 상태는 직렬화할 수 있는 값만 들고(스냅숏), 흐름장은 상태에서 다시 나오는 캐시다.
// [임시] 파티 AI는 "보이는 가장 가까운 적"과 퇴각 기준선(⑦)만 한다. 작전 슬라이더 ①~⑥은 R5(D-5040).
import { createRng } from "@terra/shared";
import { mix32 } from "../math/hash.ts";
import { type BattleMap, type BattleMapInput, createBattleMap } from "./battleMap.ts";
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS, msToTicks } from "./coefficients.ts";
import { NEIGHBORS, UNREACHABLE, distanceField, stepAllowed } from "./fields.ts";
import { type AttackProfile, type DefenseProfile, buildingDamage, resolveAttack } from "./formula.ts";
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
  /** 공격 간격(ms, 행동 속도에서, unitSpec.ts) */
  readonly attackIntervalMs: number;
  /** 한 칸 가는 시간(ms, 전투 속도 C28) */
  readonly moveIntervalMs: number;
  /** 스태미나·MP 최대와 공격 한 번에 드는 양(D-415·D-418) */
  readonly staminaMax: number;
  readonly staminaCost: number;
  readonly mpMax: number;
  readonly mpCost: number;
  /** 스탯 시야(칸, 가중치 표 sight 행) */
  readonly sight: number;
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
  /** 제한 시간(ms). 없으면 종류 기본값(C2) */
  limitMs?: number | undefined;
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
  /** 스태미나·MP 지금 값(×1000, 틱마다 조금씩 차게) */
  staminaMilli: number;
  mpMilli: number;
  status: UnitStatus;
  nextActionMs: number;
  nextMoveMs: number;
  revealUntilMs: number;
  command: Command | null;
  lastCommandMs: number;
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

/** 행동할 수 있나: 다음 행동 시각이 됐고 자원이 충분(D-418) */
function ready(unit: UnitState, nowMs: number): boolean {
  return (
    nowMs >= unit.nextActionMs &&
    unit.staminaMilli >= unit.staminaCost * 1000 &&
    (unit.attack.kind !== "elemental" || unit.mpMilli >= unit.mpCost * 1000)
  );
}

/** 행동을 쓴다: 자원을 쓰고 다음 행동 시각을 정한다(빗나가도 쓴다) */
function spend(unit: UnitState, nowMs: number): void {
  unit.staminaMilli -= unit.staminaCost * 1000;
  if (unit.attack.kind === "elemental") unit.mpMilli -= unit.mpCost * 1000;
  unit.nextActionMs = nowMs + unit.attackIntervalMs;
}

function unitFrom(spec: CombatUnitSpec): UnitState {
  return {
    ...spec,
    hp: spec.maxHp,
    armor: spec.armorHp,
    shield: spec.shieldHp,
    staminaMilli: spec.staminaMax * 1000,
    mpMilli: spec.mpMax * 1000,
    status: "alive",
    nextActionMs: 0,
    nextMoveMs: 0,
    revealUntilMs: -1,
    command: null,
    lastCommandMs: -1_000_000_000,
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
  const limitMs = init.limitMs ?? (init.kind === "siege" ? c.limitMs.siege : c.limitMs.normal);
  if (!Number.isInteger(limitMs) || limitMs < c.tickMs || limitMs > c.limitMs.max)
    throw new RangeError(`limitMs must be in [${c.tickMs}, ${c.limitMs.max}]`);
  const limit = msToTicks(limitMs, c);
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
    unit.lastCommandMs = state.tick * c.tickMs;
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
    const rolls = { hit: rng.nextInt(10_000), evade: rng.nextInt(10_000), crit: rng.nextInt(10_000) };
    const hit = resolveAttack(attacker.attack, target.defense, rolls, c);
    spend(attacker, nowMs);
    if (!attacker.air && map.cover[attacker.y * size + attacker.x] === 1)
      attacker.revealUntilMs = nowMs + c.bushRevealMs;
    let left = hit.amount;
    if (left <= 0) return true;
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
    return true;
  };

  const attackBuilding = (attacker: UnitState, buildingId: number, nowMs: number): boolean => {
    if (!inRangeOfBuilding(attacker, buildingId)) return false;
    const building = state.buildings.find((entry) => entry.id === buildingId);
    if (!building || building.durability <= 0) return false;
    building.durability -= buildingDamage(attacker.attack, attacker.buildingMulPm, c);
    spend(attacker, nowMs);
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
    const nowMs = state.tick * c.tickMs;
    const canMove = nowMs >= unit.nextMoveMs;
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
      if (ready(unit, nowMs) && attackUnit(unit, goal, rng, gone, nowMs)) return;
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
      if (nexus !== undefined && ready(unit, nowMs) && attackBuilding(unit, nexus, nowMs)) return;
    }
    if (canMove) stepAlong(unit, attackFields.get(unit.side) ?? null, occupied, gone);
  };

  /** 자원이 틱마다 찬다(초당 최대값의 ‰) */
  const regen = (unit: UnitState): void => {
    unit.staminaMilli = Math.min(
      unit.staminaMax * 1000,
      unit.staminaMilli + Math.floor((unit.staminaMax * c.staminaRegenPmPerSec * c.tickMs) / 1000),
    );
    unit.mpMilli = Math.min(
      unit.mpMax * 1000,
      unit.mpMilli + Math.floor((unit.mpMax * c.mpRegenPmPerSec * c.tickMs) / 1000),
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
    if (state.tick % msToTicks(c.fieldMs, c) === 0 || attackFields.size === 0) refreshAttackFields(gone);
    // 파티 퇴각 기준선(⑦): 파티 ID 차례
    for (const party of state.parties)
      if (partyHpLow(party))
        for (const unit of state.units)
          if (unit.party === party.id && active(unit)) unit.command = { kind: "retreat" };
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
