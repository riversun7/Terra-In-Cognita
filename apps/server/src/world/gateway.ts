// WebSocket 연결 하나의 2차맵 메시지 처리 (src/session.ts가 넘긴다) — ADR 33 "전송", ADR 7 "명령"
// - 한 연결의 요청은 받은 순서대로 하나씩 처리한다(명령의 순서 보장). 밀린 요청이 MAX_PENDING을 넘으면 busy.
// - 보기(구독)는 로그인한 사용자만, 명령은 권한 표의 secondMap 동작(지금 admin만)이 있어야 한다. 명령마다 서버가 확인한다.
// - 사용자별 속도 제한, 명령 중복 방지(같은 사용자·같은 요청 번호면 10분 동안 같은 결과를 다시 준다 —
//   끊긴 뒤 다시 보낸 명령이 두 번 실행되지 않게).
// - 볼 수 있는지는 canViewSecondMap(ADR 26 자리, S1은 모두 통과)이 정한다.
import { isCellKey } from "@terra/planet";
import { type ClientMessageOf, type ResultCode, encodeMessage } from "@terra/protocol";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { StreamSubscriber } from "./mapStream.ts";
import type { CommandResult, SecondMap } from "./secondMap.ts";
import { canViewSecondMap } from "./visibility.ts";
import type { WorldStats } from "./worldStats.ts";

export type SecondMapClientMessage = ClientMessageOf<
  "subscribe" | "unsubscribe" | "move_unit" | "place_building" | "remove_building"
>;
type CommandMessage = ClientMessageOf<"move_unit" | "place_building" | "remove_building">;

/** 한 연결에서 처리를 기다릴 수 있는 요청 수 */
const MAX_PENDING = 16;
/** 한 연결이 함께 구독할 수 있는 2차맵 수(S1은 1개, 이웃 2차맵 미리 받기를 위해 여유) */
const MAX_MAPS_PER_SOCKET = 4;
/** 명령: 사용자별 순간 30개, 초당 10개 (Assumed: 관리자가 손으로 누르는 속도의 몇 배) */
const COMMAND_LIMIT = { capacity: 30, refillPerMinute: 600 };
/** 구독: 사용자별 순간 10번, 분당 60번(스냅샷이 수백 KB라 묶는다) */
const SUBSCRIBE_LIMIT = { capacity: 10, refillPerMinute: 60 };
/** 명령 중복 방지 기간과 전체 기억 수 */
const DEDUP_TTL_MS = 10 * 60_000;
const DEDUP_MAX_ENTRIES = 20_000;
/** 다시 해 볼 수 있는 실패는 기억하지 않는다 */
const TRANSIENT_CODES: ReadonlySet<ResultCode> = new Set(["busy", "internal_error"]);

const COMMAND_ACTIONS = {
  move_unit: "move-unit",
  place_building: "place-building",
  remove_building: "remove-building",
} as const;

export interface WorldDirectory {
  map(mapKey: number): SecondMap | undefined;
  readonly stats: WorldStats;
}

/** 연결 하나가 게이트웨이에 주는 것 */
export interface SocketLink {
  send(text: string): void;
  bufferedAmount(): number;
  /** 이 연결의 로그인 사용자(정지·로그아웃이면 null) */
  viewer(): Promise<Viewer | null>;
}

export interface WorldSocket {
  handle(message: SecondMapClientMessage): void;
  close(): void;
}

export interface WorldGateway {
  open(link: SocketLink): WorldSocket;
}

export interface GatewayLog {
  error(obj: object, message: string): void;
}

/** 명령 중복 방지 — 같은 키면 처음 결과(진행 중이면 그 약속)를 돌려준다 */
export function createCommandDedup(now: () => number, ttlMs = DEDUP_TTL_MS, maxEntries = DEDUP_MAX_ENTRIES) {
  const entries = new Map<string, { at: number; result: Promise<CommandResult> }>();
  const prune = (at: number): void => {
    // 넣은 순서 = 오래된 순서
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries && at - entry.at < ttlMs) break;
      entries.delete(key);
    }
  };
  return {
    run(key: string, start: () => Promise<CommandResult>): Promise<CommandResult> {
      const at = now();
      const hit = entries.get(key);
      if (hit && at - hit.at < ttlMs) return hit.result;
      entries.delete(key);
      const result = start();
      const entry = { at, result };
      entries.set(key, entry);
      prune(at);
      void result.then((value) => {
        if (!value.ok && TRANSIENT_CODES.has(value.code) && entries.get(key) === entry) entries.delete(key);
      });
      return result;
    },
    size: () => entries.size,
  };
}

/** 로그인 사용자 조회를 ttlMs 동안 기억한다(명령마다 DB를 부르지 않게). 동시에 부르면 한 번만 조회 */
export function cacheViewer(
  load: () => Promise<Viewer | null>,
  now: () => number,
  ttlMs: number,
): () => Promise<Viewer | null> {
  let cached: { at: number; viewer: Promise<Viewer | null> } | undefined;
  return () => {
    const at = now();
    if (!cached || at - cached.at >= ttlMs) {
      const viewer = load().catch(() => null);
      cached = { at, viewer };
    }
    return cached.viewer;
  };
}

function resultText(id: number, result: CommandResult): string {
  if (result.ok) {
    return encodeMessage(
      result.buildingId === undefined
        ? { t: "result", id, ok: true }
        : { t: "result", id, ok: true, buildingId: result.buildingId },
    );
  }
  return encodeMessage({ t: "result", id, ok: false, code: result.code });
}

const fail = (code: ResultCode): CommandResult => ({ ok: false, code });

/** 명령을 2차맵에 적용한다(권한·제한 확인은 앞에서 끝났다) */
function execute(map: SecondMap, message: CommandMessage): Promise<CommandResult> {
  if (message.t === "move_unit") return map.moveUnit(message.unitId, { x: message.x, y: message.y });
  if (message.t === "place_building") {
    const { x, y, width, height, rotation } = message;
    return Promise.resolve(map.placeBuilding({ x, y, width, height, rotation }));
  }
  return Promise.resolve(map.removeBuilding(message.buildingId));
}

export function createWorldGateway(options: {
  world: WorldDirectory;
  now: () => number;
  log: GatewayLog;
}): WorldGateway {
  const { world, now, log } = options;
  const commandLimiter: RateLimiter = createRateLimiter({ ...COMMAND_LIMIT, now });
  const subscribeLimiter: RateLimiter = createRateLimiter({ ...SUBSCRIBE_LIMIT, now });
  const dedup = createCommandDedup(now);

  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const subscribed = new Map<number, SecondMap>();
      const subscriber: StreamSubscriber = {
        send: (text) => link.send(text),
        bufferedAmount: () => link.bufferedAmount(),
      };
      const reply = (id: number, result: CommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };

      const process = async (message: SecondMapClientMessage): Promise<void> => {
        const mapKey = message.mapKey;
        // 구독 해제는 로그인 여부와 상관없이 늘 된다
        if (message.t === "unsubscribe") {
          subscribed.get(mapKey)?.stream.unsubscribe(subscriber);
          subscribed.delete(mapKey);
          reply(message.id, { ok: true });
          return;
        }
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const map = isCellKey(mapKey) ? world.map(mapKey) : undefined;
        if (!map) return reply(message.id, fail("unknown_map"));
        if (!canViewSecondMap(viewer, mapKey)) return reply(message.id, fail("not_visible"));

        if (message.t === "subscribe") {
          if (!subscribed.has(mapKey) && subscribed.size >= MAX_MAPS_PER_SOCKET) {
            return reply(message.id, fail("too_many_maps"));
          }
          if (!subscribeLimiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
          // 결과를 먼저 보내고 스냅샷을 보낸다(기기는 ok 다음에 조각들이 온다고 안다)
          reply(message.id, { ok: true });
          subscribed.set(mapKey, map);
          map.stream.subscribe(subscriber);
          return;
        }

        if (!rolesAllow(viewer.roles, { secondMap: [COMMAND_ACTIONS[message.t]] })) {
          return reply(message.id, fail("forbidden"));
        }
        if (!commandLimiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        world.stats.commands += 1;
        const result = await dedup.run(`${viewer.id}:${mapKey}:${message.id}`, () => execute(map, message));
        reply(message.id, result);
      };

      return {
        handle(message) {
          if (closed) return;
          if (pending >= MAX_PENDING) {
            reply(message.id, fail("busy"));
            return;
          }
          pending += 1;
          chain = chain
            .then(() => process(message))
            .catch((error: unknown) => {
              log.error({ err: error, t: message.t }, "second map request failed");
              reply(message.id, fail("internal_error"));
            })
            .finally(() => {
              pending -= 1;
            });
        },
        close() {
          closed = true;
          for (const map of subscribed.values()) map.stream.unsubscribe(subscriber);
          subscribed.clear();
        },
      };
    },
  };
}
