// 파티·군단 명령 — 기획 D-545("파티가 모여 군단 단위로 명령")·D-549(1461 명령 추가, 1462 유닛 명령 위층, 1463 정원 밖은 군단 명령 안 받음),
// docs/adr/2026-10-31-combat-core.md "바뀜 (2026-11-14, 파티·군단 명령)". battle.ts가 입력을 넣고 틱마다 묶음을 준비한다.
// - 파티 명령은 그 파티에, 군단 명령은 편(= 군단, 지휘관 하나)의 지휘 정원 안 파티(D-179·D-331 side.uncommanded 밖)에 간다.
//   지휘관이 쓰러졌으면 군단 명령을 넣을 때 다시 고른다(D-331과 같은 규칙). 지휘관이 없으면 군단 명령은 아무 파티에도 닿지 않아 거절된다.
// - 명령을 내리면 그 파티 유닛들의 대기 명령(D-180)을 비운다(1462 "그 유닛들의 명령이 채워진다"). 그 뒤 유닛 명령을 받은 유닛은 유닛 명령을
//   먼저 따르고, 끝나면(이동 도착·목표 쓰러짐) 다시 파티 명령을 따른다.
// - 다시 넣기 막기는 파티마다·편마다 따로 유닛 명령과 같은 시간(C5 commandLockMs)이다.
// - 진형 지키기(advance·목표가 안 보이는 attack): 같은 명령 묶음(파티 명령 = 그 파티, 군단 명령 = 편 전체)에서 가장 뒤처진 유닛보다
//   FORMATION_LEASH_CELLS 칸 넘게 앞선 유닛은 걷지 않고 기다린다(치기·스킬은 한다). 앞섬 = 칸 전진이면 남은 거리의 차, 아니면 자기 편
//   가장자리에서 떨어진 거리의 차. 틱 시작에 한 번 센다(유닛 차례와 상관없다).
// 정수·결정적 계산만 쓴다(평균은 정수 나눗셈). 명령을 받은 적 없는 전투는 상태 모양·결과가 옛 판정 그대로다.
import { active, electCommander } from "./battleState.ts";
import type { CombatCoefficients } from "./coefficients.ts";
import { UNREACHABLE } from "./fields.ts";
import type {
  BattleInput,
  BattleState,
  Edge,
  PartyOrder,
  PartyOrderInput,
  PartyState,
  UnitState,
} from "./battleTypes.ts";

/** [임시] 진형 지키기 간격(칸): 묶음에서 가장 뒤처진 유닛보다 이만큼 넘게 앞서면 기다린다(질문 1542) */
export const FORMATION_LEASH_CELLS = 2;

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

/** 틱마다 준비한 명령 묶음: 파티 → 명령(명령 받은 파티가 없으면 null), 진형 때문에 이번 틱 걷지 않는 유닛 */
export interface OrderTick {
  readonly orders: ReadonlyMap<number, PartyOrder> | null;
  readonly waiting: ReadonlySet<number>;
}

export const NO_ORDERS: OrderTick = { orders: null, waiting: new Set() };

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** 자기 편 가장자리에서 떨어진 거리(칸): 클수록 앞섰다 */
export function edgeProgress(edge: Edge, x: number, y: number, size: number): number {
  if (edge === 0) return y;
  if (edge === 1) return size - 1 - x;
  if (edge === 2) return size - 1 - y;
  return x;
}

/** 맞은편 가장자리 한 줄(전진 방향 — 본 적이 없을 때 걸어갈 곳) */
export function oppositeEdgeCells(edge: Edge, size: number): number[] {
  return Array.from({ length: size }, (_, i) => {
    if (edge === 0) return (size - 1) * size + i;
    if (edge === 1) return i * size;
    if (edge === 2) return i;
    return i * size + size - 1;
  });
}

/** 명령 모양 검사(목표는 다른 편의 산 유닛, 칸은 지도 안) */
function validOrder(world: OrderWorld, order: PartyOrderInput, side: number): boolean {
  if (order.kind === "attack") {
    const target = world.state.units.find((unit) => unit.id === order.target);
    return target !== undefined && active(target) && target.side !== side;
  }
  if (order.kind === "advance" && order.cell !== undefined)
    return Number.isInteger(order.cell) && order.cell >= 0 && order.cell < world.size * world.size;
  return true;
}

/** 칸 전진: 묶음의 지금 모양(정수 평균 자리 기준)을 목표 칸으로 옮긴 자리. 못 서는 칸이면 목표 칸 */
function slotsOf(
  world: OrderWorld,
  members: readonly UnitState[],
  cell: number,
): { unit: number; cell: number }[] {
  if (members.length === 0) return [];
  const { size } = world;
  let sx = 0;
  let sy = 0;
  for (const unit of members) {
    sx += unit.x;
    sy += unit.y;
  }
  const ax = Math.floor(sx / members.length);
  const ay = Math.floor(sy / members.length);
  const cx = cell % size;
  const cy = (cell - cx) / size;
  return members.map((unit) => {
    const x = clamp(cx + unit.x - ax, 0, size - 1);
    const y = clamp(cy + unit.y - ay, 0, size - 1);
    const slot = y * size + x;
    return { unit: unit.id, cell: unit.air || world.passable(slot, unit.side) ? slot : cell };
  });
}

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
  const ids = new Set(parties.map((party) => party.id));
  const members = world.state.units.filter((unit) => ids.has(unit.party) && active(unit));
  // 1462: 파티·군단 명령이 그 유닛들의 대기 명령을 채운다(유닛 명령을 비우고 파티 명령을 따르게)
  for (const unit of members) unit.command = null;
  const slots =
    order.kind === "advance" && order.cell !== undefined ? slotsOf(world, members, order.cell) : null;
  for (const party of parties) {
    if (order.kind === "hold") party.order = { kind: "hold", legion };
    else if (order.kind === "attack") party.order = { kind: "attack", legion, target: order.target };
    else if (slots) {
      const own = new Set(members.filter((unit) => unit.party === party.id).map((unit) => unit.id));
      party.order = { kind: "advance", legion, slots: slots.filter((slot) => own.has(slot.unit)) };
    } else party.order = { kind: "advance", legion };
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
    if (!validOrder(world, input.order, party.side)) return reject();
    party.orderMs = nowMs;
    issue(world, [party], input.order, false);
    return;
  }
  const side = state.sides.find((entry) => entry.id === input.side);
  if (!side || locked(side.orderMs) || !validOrder(world, input.order, input.side)) return reject();
  // 지휘관이 쓰러졌으면 남은 유닛 가운데 정원이 가장 큰 유닛이 잇는다(D-331). 명령 없는 전투의 상태는 건드리지 않게 여기서만
  const commander = state.units.find((unit) => unit.id === side.commander);
  if (!commander || !active(commander)) electCommander(state, side);
  // 1463: 지휘 정원 밖 파티는 군단 명령을 받지 않는다(각자 AI 작전)
  const reached = state.parties.filter(
    (party) =>
      party.side === side.id && !party.retreated && !party.retreating && !side.uncommanded.includes(party.id),
  );
  if (reached.length === 0) return reject();
  side.orderMs = nowMs;
  issue(world, reached, input.order, true);
}

/**
 * 틱 시작 준비: 쓰러진 목표의 공격 명령을 거두고, 진형 지키기로 기다릴 유닛을 센다. slotField = 칸까지 거리장(battle.ts 캐시).
 * 명령 받은 파티가 없으면 NO_ORDERS(옛 판정과 같은 길)
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
  // 묶음(파티 명령 = 파티, 군단 명령 = 편)마다 유닛의 "앞섬" 점수
  const groups = new Map<string, { id: number; ahead: number }[]>();
  for (const unit of state.units) {
    const order = orders.get(unit.party);
    if (!order || order.kind === "hold" || !active(unit) || unit.command !== null) continue;
    let ahead: number;
    if (order.kind === "advance" && order.slots) {
      const slot = order.slots.find((entry) => entry.unit === unit.id);
      if (!slot) continue;
      const left = slotField(unit, slot.cell)[unit.y * size + unit.x] ?? UNREACHABLE;
      if (left === UNREACHABLE) continue;
      ahead = -left;
    } else {
      const edge = state.sides.find((side) => side.id === unit.side)?.edge ?? 3;
      ahead = edgeProgress(edge, unit.x, unit.y, size);
    }
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
  return { orders, waiting };
}
