// 파티·군단 명령 — 기획 D-545("파티가 모여 군단 단위로 명령")·D-549(1461 명령 추가, 1462 유닛 명령 위층, 1463 정원 밖은 군단 명령 안 받음)·
// D-558(집결·따라가기·대형 고르기·AI 전개 방식 8가지, 지휘관 자동 승계), docs/adr/2026-10-31-combat-core.md "바뀜 (2026-11-14, 파티·군단
// 명령)"·"바뀜 (D-558)". battle.ts가 입력을 넣고 틱마다 묶음을 준비한다.
// - 파티 명령은 그 파티에, 군단 명령은 편(= 군단, 지휘관 하나)의 지휘 정원 안 파티(D-179·D-331 side.uncommanded 밖)에 간다.
// - 지휘관이 쓰러지면(D-558 1545 자동 승계) 군단 명령을 받은 적 있는 편은 그 틱에 바로 다시 고른다(작위 → 전투 랭킹 순, battleState.ts
//   electCommander). 새 정원 밖이 된 파티는 군단 명령을 내려놓고 AI로 돌아간다. 군단 명령을 받은 적 없는 편은 넣을 때 고른다(옛 판정 그대로).
// - 명령을 내리면 그 파티 유닛들의 대기 명령(D-180)을 비운다(1462). 그 뒤 유닛 명령을 받은 유닛은 유닛 명령을 먼저 따르고, 끝나면 다시
//   파티 명령을 따른다.
// - 다시 넣기 막기는 파티마다·편마다 따로 유닛 명령과 같은 시간(C5 commandLockMs)이다.
// - 명령 순위(기획 D-574, 질문 2110): 파티 명령(소유주) 1순위, 군단 명령(군단장) 2순위. 파티 명령은 군단 명령을 언제든 덮어쓰고(뒤에 내린 쪽),
//   파티 명령이 서 있는 동안 군단 명령은 그 파티를 건너뛴다(덮는 방식은 기술 기본값 — 질문 2263). 모든 대상 파티가 건너뛰어지면 거절.
// - 군단장의 분대별 명령(기획 D-574, 질문 2265 나): 군단 입력에 party가 있으면 정원 안 그 파티 하나에만 군단 명령(2순위)을 준다. 같은 거르기를
//   지나지 못하면(소유주 명령이 서 있음·정원 밖·퇴각 중) 거절. 다시 넣기 막기는 군단 명령과 같은 편 단위다.
// - 진형 지키기(advance·목표가 안 보이는 attack): 같은 명령 묶음에서 가장 뒤처진 유닛보다 FORMATION_LEASH_CELLS 칸 넘게 앞선 유닛은 걷지
//   않고 기다린다(치기·스킬은 한다). 틱 시작에 한 번 센다. 전개 방식·집결·따라가기는 기다리지 않는다.
// - 집결·대형 고르기는 대형 자리(formation.ts)를 내릴 때 정하고, 따라가기는 틱마다 앞 파티 뒤 FOLLOW_GAP_CELLS 칸에 대형 자리를 다시 센다.
// 정수·결정적 계산만 쓴다(평균은 정수 나눗셈). 명령을 받은 적 없는 전투는 상태 모양·결과가 옛 판정 그대로다.
import { active, electCommander } from "./battleState.ts";
import type {
  BattleInput,
  BattleState,
  PartyOrder,
  PartyOrderInput,
  PartyState,
  UnitState,
} from "./battleTypes.ts";
import type { CombatCoefficients } from "./coefficients.ts";
import { UNREACHABLE } from "./fields.ts";
import {
  DEFAULT_FORMATION,
  centroidOf,
  edgeProgress,
  facingDelta,
  formationSlots,
  isFormationShape,
} from "./formation.ts";
import { isTactic } from "./tactics.ts";

export { edgeProgress, oppositeEdgeCells } from "./formation.ts";

/** [임시] 진형 지키기 간격(칸): 묶음에서 가장 뒤처진 유닛보다 이만큼 넘게 앞서면 기다린다(질문 1542) */
export const FORMATION_LEASH_CELLS = 2;
/** [임시] 따라가기: 앞 파티 가운데에서 이만큼 뒤에 대형 앞줄을 둔다(질문 1964) */
export const FOLLOW_GAP_CELLS = 2;

/** 명령 넣기에 판정이 빌려 주는 것 */
export interface OrderWorld {
  readonly state: BattleState;
  readonly size: number;
  readonly c: CombatCoefficients;
  /** 그 편이 그 칸을 지나갈 수 있나(지금 부서진 건물 기준) */
  passable(cell: number, side: number): boolean;
  /** 파티 퇴각(battle.ts orderRetreat — 파티를 퇴각 중으로, 산 유닛에 퇴각 명령) */
  orderRetreat(partyId: number): void;
}

/** 틱마다 준비한 명령 묶음: 파티 → 명령, 진형 때문에 이번 틱 걷지 않는 유닛, 따라가기 유닛의 이번 틱 설 칸 */
export interface OrderTick {
  readonly orders: ReadonlyMap<number, PartyOrder> | null;
  readonly waiting: ReadonlySet<number>;
  readonly goals: ReadonlyMap<number, number>;
}

export const NO_ORDERS: OrderTick = { orders: null, waiting: new Set(), goals: new Map() };

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

const sideEdge = (state: BattleState, side: number) =>
  state.sides.find((entry) => entry.id === side)?.edge ?? 3;

/** 명령 모양 검사(목표는 다른 편의 산 유닛, 칸은 지도 안, 따라갈 파티는 같은 편의 다른 남은 파티) */
function validOrder(world: OrderWorld, order: PartyOrderInput, side: number, self?: number): boolean {
  const inMap = (cell: number | undefined): boolean =>
    cell === undefined || (Number.isInteger(cell) && cell >= 0 && cell < world.size * world.size);
  switch (order.kind) {
    case "attack": {
      const target = world.state.units.find((unit) => unit.id === order.target);
      return target !== undefined && active(target) && target.side !== side;
    }
    case "advance":
    case "rally":
      return inMap(order.cell);
    case "follow": {
      const leader = world.state.parties.find((party) => party.id === order.party);
      return leader !== undefined && leader.side === side && !leader.retreated && leader.id !== self;
    }
    case "formation":
      return isFormationShape(order.shape);
    case "tactic":
      return isTactic(order.tactic);
    default:
      return true;
  }
}

/** 칸 전진: 묶음의 지금 모양(정수 평균 자리 기준)을 목표 칸으로 옮긴 자리. 못 서는 칸이면 목표 칸 */
function slotsOf(
  world: OrderWorld,
  members: readonly UnitState[],
  cell: number,
): { unit: number; cell: number }[] {
  if (members.length === 0) return [];
  const { size } = world;
  const { x: ax, y: ay } = centroidOf(members);
  const cx = cell % size;
  const cy = (cell - cx) / size;
  return members.map((unit) => {
    const x = clamp(cx + unit.x - ax, 0, size - 1);
    const y = clamp(cy + unit.y - ay, 0, size - 1);
    const slot = y * size + x;
    return { unit: unit.id, cell: unit.air || world.passable(slot, unit.side) ? slot : cell };
  });
}

/** 묶음의 대형 자리(집결·대형 고르기). 가운데 = 칸(없으면 지휘관 자리 또는 묶음 가운데) */
function shapeSlots(
  world: OrderWorld,
  members: readonly UnitState[],
  parties: readonly PartyState[],
  cell: number | undefined,
  legion: boolean,
): { unit: number; cell: number }[] {
  const first = members[0];
  if (!first) return [];
  const { size, state } = world;
  let center = centroidOf(members);
  if (cell !== undefined) center = { x: cell % size, y: Math.floor(cell / size) };
  else if (legion) {
    const side = state.sides.find((entry) => entry.id === first.side);
    const commander = members.find((unit) => unit.id === side?.commander);
    if (commander) center = { x: commander.x, y: commander.y };
  }
  const shape = parties[0]?.shape ?? DEFAULT_FORMATION;
  return formationSlots(members, shape, sideEdge(state, first.side), center, size, (slot, unit) =>
    world.passable(slot, unit.side),
  );
}

const ownSlots = (
  slots: readonly { unit: number; cell: number }[],
  members: readonly UnitState[],
  party: number,
): { unit: number; cell: number }[] => {
  const own = new Set(members.filter((unit) => unit.party === party).map((unit) => unit.id));
  return slots.filter((slot) => own.has(slot.unit));
};

/** 파티들에 명령을 준다(파티 명령이면 하나, 군단 명령이면 정원 안 파티 모두) */
function issue(
  world: OrderWorld,
  parties: readonly PartyState[],
  order: PartyOrderInput,
  legion: boolean,
): void {
  if (order.kind === "retreat") {
    for (const party of parties) {
      delete party.order;
      world.orderRetreat(party.id);
    }
    return;
  }
  if (order.kind === "free") {
    for (const party of parties) delete party.order;
    return;
  }
  if (order.kind === "formation") for (const party of parties) party.shape = order.shape;
  const ids = new Set(parties.map((party) => party.id));
  const members = world.state.units.filter((unit) => ids.has(unit.party) && active(unit));
  // 1462: 파티·군단 명령이 그 유닛들의 대기 명령을 채운다(유닛 명령을 비우고 파티 명령을 따르게)
  for (const unit of members) unit.command = null;
  let slots: { unit: number; cell: number }[] | null = null;
  if (order.kind === "advance" && order.cell !== undefined) slots = slotsOf(world, members, order.cell);
  else if (order.kind === "rally") slots = shapeSlots(world, members, parties, order.cell, legion);
  else if (order.kind === "formation") slots = shapeSlots(world, members, parties, undefined, false);
  else if (order.kind === "tactic" && order.tactic === "defend")
    slots = members.map((unit) => ({ unit: unit.id, cell: unit.y * world.size + unit.x }));
  for (const party of parties) {
    const own = slots ? ownSlots(slots, members, party.id) : undefined;
    switch (order.kind) {
      case "hold":
        party.order = { kind: "hold", legion };
        break;
      case "attack":
        party.order = { kind: "attack", legion, target: order.target };
        break;
      case "follow":
        party.order = { kind: "follow", legion, party: order.party };
        break;
      case "tactic":
        party.order = own
          ? { kind: "tactic", legion, tactic: order.tactic, slots: own }
          : { kind: "tactic", legion, tactic: order.tactic };
        break;
      case "rally":
      case "formation":
        party.order = { kind: "rally", legion, slots: own ?? [] };
        break;
      default:
        party.order = own ? { kind: "advance", legion, slots: own } : { kind: "advance", legion };
    }
  }
}

/** 파티 명령·군단 명령 입력 하나를 넣는다(거절하면 state.rejected를 센다) */
export function applyOrderInput(
  world: OrderWorld,
  input: Extract<BattleInput, { kind: "order" | "legion" }>,
): void {
  const { state, c } = world;
  const nowMs = state.tick * c.tickMs;
  const locked = (ms: number | undefined): boolean => ms !== undefined && nowMs - ms < c.commandLockMs;
  const reject = (): void => {
    state.rejected += 1;
  };
  if (input.kind === "order") {
    const party = state.parties.find((entry) => entry.id === input.party);
    // 퇴각 중인 파티는 되돌리지 않는다([임시] — 퇴각 명령은 끝까지 간다)
    if (!party || party.retreated || party.retreating || locked(party.orderMs)) return reject();
    if (!validOrder(world, input.order, party.side, party.id)) return reject();
    party.orderMs = nowMs;
    issue(world, [party], input.order, false);
    return;
  }
  const side = state.sides.find((entry) => entry.id === input.side);
  if (!side || locked(side.orderMs) || !validOrder(world, input.order, input.side)) return reject();
  // 지휘관이 쓰러졌으면 승계 순서로 다시 고른다(D-331·D-558). 명령 없는 전투의 상태는 건드리지 않게 여기서만
  const commander = state.units.find((unit) => unit.id === side.commander);
  if (!commander || !active(commander)) electCommander(state, side);
  // 1463: 지휘 정원 밖 파티는 군단 명령을 받지 않는다(각자 AI 작전). 따라가기는 앞 파티 자신을 뺀다
  // 명령 순위(기획 D-574 — 질문 2110 "소유주 명령이 1순위, 군단장 명령은 2순위"): 파티 명령(주인이 내린 것 — 서버는 파티 유닛이 모두 제 것일 때만
  // 넣는다)이 서 있는 파티는 군단 명령을 받지 않는다. 주인이 자유(free)로 풀거나 그 명령이 끝나면(목표 쓰러짐·앞 파티 없어짐) 다시 받는다
  const leader = input.order.kind === "follow" ? input.order.party : undefined;
  const reached = state.parties.filter(
    (party) =>
      party.side === side.id &&
      !party.retreated &&
      !party.retreating &&
      !side.uncommanded.includes(party.id) &&
      party.order?.legion !== false &&
      party.id !== leader &&
      (input.party === undefined || party.id === input.party),
  );
  if (reached.length === 0 || side.commander === 0) return reject();
  side.orderMs = nowMs;
  issue(world, reached, input.order, true);
}

/**
 * 지휘관 자동 승계(D-558 1545): 군단 명령을 받은 적 있는 편의 지휘관이 쓰러졌으면(퇴각은 battle.ts checkRetreats가 같은 순서로 다시 고르고
 * 같은 dropUncommanded를 부른다 — D-571) 바로 다시 고르고, 새 정원 밖이 된 파티의 군단 명령을 거둔다. 받은 적 없는 편은 건드리지 않는다
 */
export function succeedCommanders(state: BattleState): void {
  for (const side of state.sides) {
    if (side.orderMs === undefined || side.commander === 0) continue;
    const commander = state.units.find((unit) => unit.id === side.commander);
    if (commander && active(commander)) continue;
    electCommander(state, side);
    dropUncommanded(state, side);
  }
}

/**
 * 새 정원 밖이 된 파티의 군단 명령을 거둔다(쓰러짐 승계와 퇴각 승계가 같은 규칙 — D-571 답 1967 "퇴각도 같은 순서"). 군단 명령을 받은 적
 * 없는 편은 건드리지 않는다(옛 상태 모양)
 */
export function dropUncommanded(state: BattleState, side: BattleState["sides"][number]): void {
  if (side.orderMs === undefined) return;
  for (const party of state.parties)
    if (party.side === side.id && party.order?.legion === true && side.uncommanded.includes(party.id))
      delete party.order;
}

/** 따라가기 묶음의 이번 틱 설 칸(앞 파티 가운데에서 뒤로 FOLLOW_GAP_CELLS, 대형 앞줄 기준) */
function followGoals(
  world: OrderWorld,
  members: readonly UnitState[],
  leader: number,
  shape: PartyState["shape"],
  goals: Map<number, number>,
): boolean {
  const { state, size } = world;
  const ahead = state.units.filter((unit) => unit.party === leader && active(unit));
  const first = members[0];
  if (ahead.length === 0 || !first) return false;
  const edge = sideEdge(state, first.side);
  const lead = centroidOf(ahead);
  const { dx, dy } = facingDelta(edge, -FOLLOW_GAP_CELLS, 0);
  const center = { x: clamp(lead.x + dx, 0, size - 1), y: clamp(lead.y + dy, 0, size - 1) };
  const slots = formationSlots(
    members,
    shape ?? DEFAULT_FORMATION,
    edge,
    center,
    size,
    (cell, unit) => world.passable(cell, unit.side),
    "front",
  );
  for (const slot of slots) goals.set(slot.unit, slot.cell);
  return true;
}

/**
 * 틱 시작 준비: 쓰러진 목표의 공격 명령·없어진 파티의 따라가기를 거두고, 진형 지키기로 기다릴 유닛과 따라가기 설 칸을 센다.
 * slotField = 칸까지 거리장(battle.ts 캐시). 명령 받은 파티가 없으면 NO_ORDERS(옛 판정과 같은 길)
 */
export function prepareOrders(
  world: OrderWorld,
  slotField: (unit: UnitState, cell: number) => Int32Array,
): OrderTick {
  const { state, size } = world;
  if (!state.parties.some((party) => party.order !== undefined)) return NO_ORDERS;
  const orders = new Map<number, PartyOrder>();
  for (const party of state.parties) {
    const order = party.order;
    if (!order) continue;
    if (order.kind === "attack") {
      const target = state.units.find((unit) => unit.id === order.target);
      if (!target || !active(target)) {
        delete party.order;
        continue;
      }
    }
    orders.set(party.id, order);
  }
  // 따라가기: 묶음(군단 명령 = 편·앞 파티, 파티 명령 = 파티)마다 설 칸
  const goals = new Map<number, number>();
  const followers = new Map<string, { leader: number; shape: PartyState["shape"]; parties: number[] }>();
  for (const party of state.parties) {
    const order = orders.get(party.id);
    if (order?.kind !== "follow") continue;
    const key = order.legion ? `s${party.side}:${order.party}` : `p${party.id}`;
    const group = followers.get(key) ?? { leader: order.party, shape: party.shape, parties: [] };
    group.parties.push(party.id);
    followers.set(key, group);
  }
  for (const group of followers.values()) {
    const ids = new Set(group.parties);
    const members = state.units.filter((unit) => ids.has(unit.party) && active(unit));
    if (followGoals(world, members, group.leader, group.shape, goals)) continue;
    // 앞 파티가 없어졌다(쓰러짐·퇴각): 명령이 끝난다
    for (const party of state.parties)
      if (ids.has(party.id)) {
        delete party.order;
        orders.delete(party.id);
      }
  }
  // 묶음(파티 명령 = 파티, 군단 명령 = 편)마다 유닛의 "앞섬" 점수(전진·목표 공격만)
  const groups = new Map<string, { id: number; ahead: number }[]>();
  for (const unit of state.units) {
    const order = orders.get(unit.party);
    if (!order || (order.kind !== "advance" && order.kind !== "attack") || !active(unit)) continue;
    if (unit.command !== null) continue;
    let ahead: number;
    if (order.kind === "advance" && order.slots) {
      const slot = order.slots.find((entry) => entry.unit === unit.id);
      if (!slot) continue;
      const left = slotField(unit, slot.cell)[unit.y * size + unit.x] ?? UNREACHABLE;
      if (left === UNREACHABLE) continue;
      ahead = -left;
    } else ahead = edgeProgress(sideEdge(state, unit.side), unit.x, unit.y, size);
    const key = order.legion ? `s${unit.side}` : `p${unit.party}`;
    const list = groups.get(key) ?? [];
    list.push({ id: unit.id, ahead });
    groups.set(key, list);
  }
  const waiting = new Set<number>();
  for (const list of groups.values()) {
    let rear = Number.POSITIVE_INFINITY;
    for (const entry of list) rear = Math.min(rear, entry.ahead);
    for (const entry of list) if (entry.ahead - rear > FORMATION_LEASH_CELLS) waiting.add(entry.id);
  }
  return { orders, waiting, goals };
}

/**
 * 서서 싸우는 명령의 설 칸: 자리 지키기 = null(움직이지 않음), 칸 전진·집결 = 자기 자리, 따라가기 = 이번 틱 설 칸.
 * 서서 싸우는 명령이 아니면 undefined(전진·목표 공격·전개 방식은 AI 길)
 */
export function standGoal(order: PartyOrder, unit: UnitState, tick: OrderTick): number | null | undefined {
  switch (order.kind) {
    case "hold":
      return null;
    case "rally":
      return order.slots.find((slot) => slot.unit === unit.id)?.cell ?? null;
    case "follow":
      return tick.goals.get(unit.id) ?? null;
    case "advance":
      return order.slots ? (order.slots.find((slot) => slot.unit === unit.id)?.cell ?? null) : undefined;
    default:
      return undefined;
  }
}
