// 실시간 세계 전투 명령(서버) — 기획 D-558 1546("전투맵 명령 화면"), D-571(답 1969: 다시보기에서만 되던 명령 줄을 실제 세계 전투에 잇는다),
// D-545·D-549(파티·군단 단위), D-180(다시 넣기 막기), docs/adr/2026-10-31-combat-core.md "바뀜 (D-571)". 프로토콜 57 battle_list·battle_order
// (@terra/protocol battleOrder.ts). session.ts가 연결마다 넘긴다.
// - 서버 권위: 세계 전투는 빨리감기로 끝까지 계산하고 끝 시각에 결과를 적용한다(battles.ts). 명령은 "다음 틱 경계"(지금 진행 틱 + 1)에 입력으로
//   더하고 그 틱 이하 가장 가까운 스냅숏부터 다시 계산한다(addInput) — 저장된 시작 자료 + 입력으로 늘 같은 결과(결정성).
// - 확인: 진행 중인 전투, 내 유닛이 낀 전투(유닛 주인 소유 주체의 user_id), 파티 명령 = 그 파티의 세계 유닛이 모두 내 것, 군단 명령 = 그
//   틱을 돈 뒤 그 편 지휘관(승계 포함)이 내 유닛. 판정이 거절하는 명령(다시 넣기 막기·없는 목표 등)은 넣지 않고 rejected(probe — 저장 없이
//   그 틱 한 번만 돌려 본다).
// - 같은 전투의 명령은 서버 전체에서 하나씩(스냅숏을 다시 쓰는 계산이 겹치지 않게). 연결마다 받은 순서대로, 사용자별 속도 제한(순간 10·분당
//   60 — 다시 넣기 막기 1초보다 넉넉히).
import {
  BATTLE_LIST_MAX,
  type BattleOrder,
  type BattleOrderResultCode,
  type BattleView,
  type ClientMessageOf,
  encodeMessage,
} from "@terra/protocol";
import { TEST_COMBAT_COEFFICIENTS, type BattleInput, type PartyOrderInput } from "@terra/sim";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { RunningBattle } from "./battles.ts";
import type { UnitOwnerMap } from "./defenseRenown.ts";
import type { OwnerRow } from "./persist/load.ts";
import type { World } from "./world.ts";

export type BattleOrderClientMessage = ClientMessageOf<"battle_list" | "battle_order">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 60 };
const { tickMs } = TEST_COMBAT_COEFFICIENTS;

/** 전투 서비스에서 쓰는 것(BattleService가 맞는다) */
export interface BattleOrderBattles {
  running(): Promise<readonly RunningBattle[]>;
  probe(
    battleId: number,
    input: BattleInput,
  ): Promise<
    | {
        readonly state: { readonly sides: readonly { readonly id: number; readonly commander: number }[] };
        readonly rejected: boolean;
      }
    | undefined
  >;
  addInput(battleId: number, input: BattleInput): Promise<void>;
  get(battleId: number): Promise<{ readonly endsAtMs: number } | undefined>;
}

export interface BattleOrderWorld {
  readonly battles: BattleOrderBattles;
  readonly maps: ReadonlyMap<number, UnitOwnerMap>;
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "userId">>;
  readonly hasCyborg: (userId: string) => boolean;
}

export type BattleOrderOutcome =
  | { readonly ok: true; readonly battle: number; readonly tick: number; readonly endsAtMs: number }
  | { readonly ok: false; readonly code: BattleOrderResultCode };

const fail = (code: BattleOrderResultCode) => ({ ok: false as const, code });

/** 프로토콜 명령 → 판정 명령(모양이 같다) */
export function orderInputOf(order: BattleOrder): PartyOrderInput {
  switch (order.kind) {
    case "advance":
    case "rally":
      return order.cell === undefined ? { kind: order.kind } : { kind: order.kind, cell: order.cell };
    case "attack":
      return { kind: "attack", target: order.target };
    case "follow":
      return { kind: "follow", party: order.party };
    case "formation":
      return { kind: "formation", shape: order.shape };
    case "tactic":
      return { kind: "tactic", tactic: order.tactic };
    default:
      return { kind: order.kind };
  }
}

/** 세계 유닛의 주인 사용자(띄운 2차맵 어딘가) */
function userOfUnit(world: BattleOrderWorld, unitId: number): string | null {
  for (const map of world.maps.values()) {
    const info = map.unitInfo(unitId);
    if (info) return world.owners.get(info.ownerId)?.userId ?? null;
  }
  return null;
}

/** 명령·목록 처리(연결과 상관없는 판단) */
export function createBattleOrders(world: BattleOrderWorld, now: () => number) {
  /** 전투마다 하나씩(스냅숏 다시 쓰기가 겹치지 않게) */
  const chains = new Map<number, Promise<unknown>>();
  const serial = <T>(battleId: number, work: () => Promise<T>): Promise<T> => {
    const before = chains.get(battleId) ?? Promise.resolve();
    const next = before.then(work, work);
    const tail = next.catch(() => undefined);
    chains.set(battleId, tail);
    void tail.then(() => {
      if (chains.get(battleId) === tail) chains.delete(battleId);
    });
    return next;
  };

  /** 그 전투에서 내 편(내 유닛이 가장 많은 편 — 같으면 작은 편 ID)과 내 유닛 */
  const mineIn = (battle: RunningBattle, userId: string) => {
    const mine = new Set(
      battle.units.filter((unit) => userOfUnit(world, unit.id) === userId).map((u) => u.id),
    );
    const count = new Map<number, number>();
    for (const unit of battle.units)
      if (mine.has(unit.id)) count.set(unit.side, (count.get(unit.side) ?? 0) + 1);
    let side: number | undefined;
    for (const [id, n] of [...count].toSorted((a, b) => a[0] - b[0]))
      if (side === undefined || n > (count.get(side) ?? 0)) side = id;
    return { mine, side };
  };

  const partyMine = (battle: RunningBattle, partyId: number, userId: string): boolean => {
    const units = battle.units.filter((unit) => unit.party === partyId);
    return units.length > 0 && units.every((unit) => userOfUnit(world, unit.id) === userId);
  };

  return {
    /** 내 유닛이 낀 진행 중인 전투(시작 차례, 상한 BATTLE_LIST_MAX) */
    async list(
      userId: string,
    ): Promise<{ ok: true; battles: BattleView[] } | { ok: false; code: "no_cyborg" }> {
      if (!world.hasCyborg(userId)) return { ok: false, code: "no_cyborg" };
      const nowMs = now();
      const views: BattleView[] = [];
      for (const battle of await world.battles.running()) {
        if (views.length >= BATTLE_LIST_MAX) break;
        if (battle.endsAtMs <= nowMs) continue;
        const { mine, side } = mineIn(battle, userId);
        if (side === undefined || mine.size === 0) continue;
        const tick = Math.max(0, Math.floor((nowMs - battle.startedAtMs) / tickMs));
        const probe = await world.battles.probe(battle.id, {
          tick: tick + 1,
          kind: "command",
          unit: 0,
          command: { kind: "retreat" },
        });
        const commanderId = probe?.state.sides.find((entry) => entry.id === side)?.commander ?? 0;
        views.push({
          battle: battle.id,
          kind: battle.kind,
          startedAtMs: battle.startedAtMs,
          endsAtMs: battle.endsAtMs,
          side,
          mapSize: Math.max(1, battle.mapSize),
          commander: commanderId > 0 && mine.has(commanderId),
          parties: battle.parties
            .filter((party) => party.side === side)
            .map((party) => party.id)
            .toSorted((a, b) => a - b)
            .map((id) => ({
              id,
              units: battle.units.filter((unit) => unit.party === id).map((unit) => unit.id),
              mine: partyMine(battle, id, userId),
            })),
          enemies: battle.units.filter((unit) => unit.side !== side).map((unit) => unit.id),
        });
      }
      return { ok: true, battles: views };
    },

    /** 명령 하나(다음 틱 경계에 넣는다) */
    order(
      userId: string,
      input: { readonly battle: number; readonly party: number | null; readonly order: BattleOrder },
    ): Promise<BattleOrderOutcome> {
      return serial(input.battle, async () => {
        if (!world.hasCyborg(userId)) return fail("no_cyborg");
        const battle = (await world.battles.running()).find((entry) => entry.id === input.battle);
        const nowMs = now();
        if (!battle || battle.endsAtMs <= nowMs) return fail("unknown_battle");
        const { mine, side } = mineIn(battle, userId);
        if (side === undefined || mine.size === 0) return fail("not_participant");
        const tick = Math.max(0, Math.floor((nowMs - battle.startedAtMs) / tickMs)) + 1;
        const order = orderInputOf(input.order);
        let next: BattleInput;
        if (input.party === null) next = { tick, kind: "legion", side, order };
        else {
          const party = battle.parties.find((entry) => entry.id === input.party);
          if (!party || party.side !== side || !partyMine(battle, party.id, userId))
            return fail("not_your_party");
          next = { tick, kind: "order", party: party.id, order };
        }
        const probe = await world.battles.probe(battle.id, next);
        if (!probe) return fail("unknown_battle");
        if (input.party === null) {
          const commander = probe.state.sides.find((entry) => entry.id === side)?.commander ?? 0;
          if (commander === 0 || !mine.has(commander)) return fail("not_commander");
        }
        if (probe.rejected) return fail("rejected");
        await world.battles.addInput(battle.id, next);
        const after = await world.battles.get(battle.id);
        return { ok: true, battle: battle.id, tick, endsAtMs: after?.endsAtMs ?? battle.endsAtMs };
      });
    },
  };
}

export interface BattleOrderLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

export interface BattleOrderSocket {
  handle(message: BattleOrderClientMessage): void;
  close(): void;
}

export interface BattleOrderGateway {
  open(link: BattleOrderLink): BattleOrderSocket;
}

/** 월드에서 명령 처리 자료를 고른다(세계가 준비되고 DB가 있을 때만) */
export function battleOrderWorldOf(world: World | undefined): () => BattleOrderWorld | undefined {
  let cached: BattleOrderWorld | undefined;
  return () => {
    const p = world?.status().state === "ready" ? world.persistence : undefined;
    if (!world || !p) return undefined;
    cached ??= {
      battles: p.battles,
      maps: world.maps,
      owners: p.owners,
      hasCyborg: (userId) => p.cyborgs.record(userId) !== undefined,
    };
    return cached;
  };
}

/** 연결 처리(신전·건물 게이트웨이와 같은 틀). world()가 undefined면(세계 준비 전) busy */
export function createBattleOrderGateway(options: {
  readonly world: () => BattleOrderWorld | undefined;
  readonly now: () => number;
  readonly log: { error(obj: object, message: string): void };
}): BattleOrderGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  let orders: ReturnType<typeof createBattleOrders> | undefined;
  let ordersOf: BattleOrderWorld | undefined;
  const service = (): ReturnType<typeof createBattleOrders> | undefined => {
    const world = options.world();
    if (!world) return undefined;
    if (!orders || ordersOf !== world) {
      orders = createBattleOrders(world, options.now);
      ordersOf = world;
    }
    return orders;
  };
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const replyFail = (message: BattleOrderClientMessage, code: BattleOrderResultCode): void => {
        if (closed) return;
        link.send(
          message.t === "battle_list"
            ? encodeMessage({ t: "battle_list_result", id: message.id, ok: false, code })
            : encodeMessage({ t: "battle_order_result", id: message.id, ok: false, code }),
        );
      };
      const process = async (message: BattleOrderClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return replyFail(message, "sign_in_required");
        const svc = service();
        if (!svc) return replyFail(message, "busy");
        if (!limiter.take(viewer.id)) return replyFail(message, "rate_limited");
        if (message.t === "battle_list") {
          const result = await svc.list(viewer.id);
          if (closed) return;
          if (!result.ok) return replyFail(message, result.code);
          link.send(
            encodeMessage({ t: "battle_list_result", id: message.id, ok: true, battles: result.battles }),
          );
          return;
        }
        const result = await svc.order(viewer.id, {
          battle: message.battle,
          party: message.party,
          order: message.order,
        });
        if (closed) return;
        if (!result.ok) return replyFail(message, result.code);
        link.send(encodeMessage({ t: "battle_order_result", id: message.id, ...result }));
      };
      return {
        handle(message) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            replyFail(message, "busy");
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              options.log.error({ err: error, t: message.t }, "battle order failed");
              replyFail(message, "internal_error");
            })
            .finally(() => {
              pending -= 1;
            });
        },
        close() {
          closed = true;
        },
      };
    },
  };
}
