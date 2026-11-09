// WebSocket 연결 하나의 2차맵 메시지 처리 (src/session.ts가 넘긴다) — ADR 33 "전송", ADR 7 "명령"
// - 한 연결의 요청은 받은 순서대로 하나씩 처리한다(명령의 순서 보장). 밀린 요청이 MAX_PENDING을 넘으면 busy.
// - 보기(구독)는 로그인한 사용자만. 플레이어는 시야로 거른 전송(map.vision), 전체 보기(observe, dev·admin)는 거르지 않은
//   전송(map.stream)을 받는다(S3 ADR 3절). 이동·멈추기 명령은 자기 유닛(수호신 빼고)이거나 운영자(권한 표 move-unit = dev·admin,
//   unitControl.ts — docs/adr/2026-11-07-unit-control.md), 건물 명령은 admin, 개발 시험 명령(dev_spawn_units)은 dev-spawn(dev·admin).
//   명령마다 서버가 확인한다. 남의 유닛은 not_owner, 내 수호신은 unit_stays(프로토콜 17 연결만, 더 낮으면 forbidden).
// - 사용자별 속도 제한, 명령 중복 방지(같은 사용자·같은 요청 번호면 10분 동안 같은 결과를 다시 준다 —
//   끊긴 뒤 다시 보낸 명령이 두 번 실행되지 않게).
// - 볼 수 있는지는 canViewSecondMap(ADR 26, 내 유닛·건물 또는 탐사한 칸)이 정한다.
import { isCellKey } from "@terra/planet";
import {
  type ClientMessageOf,
  type ResultCode,
  SECOND_MAP_PROTOCOL_VERSION,
  UNIT_CONTROL_PROTOCOL_VERSION,
  encodeMessage,
} from "@terra/protocol";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { StreamSubscriber } from "./mapStream.ts";
import type { CommandResult, SecondMap } from "./secondMap.ts";
import { unavailable } from "./unitCondition.ts";
import { type UnitControlDenial, canCommandAnyUnit, unitControlDenial } from "./unitControl.ts";
import { type NationSource, nationLookupOf } from "./nationVision.ts";
import { canObserve, canViewSecondMap } from "./visibility.ts";
import type { WorldStats } from "./worldStats.ts";

export type SecondMapClientMessage = ClientMessageOf<
  | "subscribe"
  | "unsubscribe"
  | "move_unit"
  | "stop_unit"
  | "place_building"
  | "remove_building"
  | "dev_spawn_units"
>;
type CommandMessage = ClientMessageOf<"move_unit" | "stop_unit" | "place_building" | "remove_building">;

/** 한 연결에서 처리를 기다릴 수 있는 요청 수 */
const MAX_PENDING = 16;
/** 한 연결이 함께 구독할 수 있는 2차맵 수(S1은 1개, 이웃 2차맵 미리 받기를 위해 여유) */
const MAX_MAPS_PER_SOCKET = 4;
/** 운영자 모드 이동 빠르기(유닛 속도 × 이 값). 그 이동 하나에만 — 유닛 속도는 그대로. 사용자 지적 2026-11-09 "10배 더 빠르게"로 10 → 100(걷기 437 × 100 = 43,700, 프로토콜 상한 1,048,576 안) */
export const OPERATOR_SPEED_FACTOR = 100;
/** 명령: 사용자별 순간 30개, 초당 10개 (Assumed: 관리자가 손으로 누르는 속도의 몇 배) */
const COMMAND_LIMIT = { capacity: 30, refillPerMinute: 600 };
/** 구독: 사용자별 순간 10번, 분당 60번(스냅샷이 수백 KB라 묶는다) */
const SUBSCRIBE_LIMIT = { capacity: 10, refillPerMinute: 60 };
/** 명령 중복 방지 기간과 전체 기억 수 */
const DEDUP_TTL_MS = 10 * 60_000;
const DEDUP_MAX_ENTRIES = 20_000;
/** 다시 해 볼 수 있는 실패는 기억하지 않는다 */
const TRANSIENT_CODES: ReadonlySet<ResultCode> = new Set(["busy", "internal_error"]);

/** 건물 명령의 권한 표 동작(유닛 명령은 소유·운영자로 본다, unitControl.ts) */
const BUILDING_ACTIONS = {
  place_building: "place-building",
  remove_building: "remove-building",
} as const;

export interface WorldDirectory {
  map(mapKey: number): SecondMap | undefined;
  readonly stats: WorldStats;
  /** 부팅 복구가 끝났는가(없으면 늘 준비됨). 끝나기 전 요청은 busy */
  isReady?(): boolean;
  /** 사용자의 소유 주체(저장하는 월드만). 없으면 내 유닛 없음 */
  ownerOfUser?(userId: string): number | undefined;
  /** 월드 저장 층(저장하는 월드만) — 같은 나라 시야 공유의 소유 주체 → 나라(nationVision.ts) */
  readonly persistence?: NationSource["persistence"];
  /** 개발 시험 명령: 내 시험 일꾼 count개. 만든 수(저장하는 월드만) */
  devSpawn?(userId: string, mapKey: number, count: number): number;
}

/** 연결 하나가 게이트웨이에 주는 것 */
export interface SocketLink {
  send(text: string): void;
  bufferedAmount(): number;
  /** 이 연결의 로그인 사용자(정지·로그아웃이면 null) */
  viewer(): Promise<Viewer | null>;
  /** 이 연결이 인사한 프로토콜 판(새 결과 코드를 받는지). 없으면 2차맵 첫 판 — not_owner·unit_stays 대신 forbidden */
  protocolVersion?: number | undefined;
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

/** 관리자 전체 보기를 켠 기록(감사 기록, app.ts가 DB에 쓴다) */
export type ObserveAudit = (viewer: Viewer, mapKey: number) => void;

/** 운영자가 남의 유닛(또는 내 수호신)에 한 명령(감사 기록, app.ts가 DB에 쓴다 — docs/adr/2026-11-07-unit-control.md). 된 명령만 */
export type OperatorCommandAudit = (
  viewer: Viewer,
  command: {
    readonly t: "move_unit" | "stop_unit";
    readonly mapKey: number;
    readonly unitId: number;
    readonly ownerId: number | null;
  },
) => void;

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

/**
 * 멈추기(stop_unit): 지금 자리에 세운다. 포로·중태는 이동과 같이 받지 않고(invalid_request), 서버 봇은 판단 예약이 끊기지 않게 세우지 않는다
 * (halt가 거절 — invalid_request). 2차맵 사이를 가는 중이었으면 이동 서비스가 다음 확인에서 "길에서 벗어남"으로 끝낸다(WP9)
 */
function stopUnit(map: SecondMap, unitId: number, nowMs: number): CommandResult {
  const info = map.unitInfo(unitId);
  if (!info) return fail("unknown_unit");
  if (unavailable(info.condition, nowMs)) return fail("invalid_request");
  return map.halt(unitId) ? { ok: true } : fail("invalid_request");
}

/**
 * 명령을 2차맵에 적용한다(권한·제한 확인은 앞에서 끝났다). 시험 건물은 놓은 사람의 소유 주체 것이다(없으면 주인 없음) —
 * 노동 계약의 시설 주인(docs/adr/2026-11-03-labor-contracts.md)
 */
function execute(
  map: SecondMap,
  message: CommandMessage,
  ownerId: number | null,
  nowMs: number,
  speedFactor = 1,
): Promise<CommandResult> {
  if (message.t === "move_unit")
    return map.moveUnit(message.unitId, { x: message.x, y: message.y }, { speedFactor });
  if (message.t === "stop_unit") return Promise.resolve(stopUnit(map, message.unitId, nowMs));
  if (message.t === "place_building") {
    const { x, y, width, height, rotation } = message;
    return Promise.resolve(map.placeBuilding({ x, y, width, height, rotation }, ownerId));
  }
  return Promise.resolve(map.removeBuilding(message.buildingId));
}

export function createWorldGateway(options: {
  world: WorldDirectory;
  now: () => number;
  log: GatewayLog;
  onObserve?: ObserveAudit | undefined;
  onOperatorCommand?: OperatorCommandAudit | undefined;
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
      /** 전체 보기(운영자 모드)로 구독한 2차맵 — 그 2차맵의 이동 명령은 운영자 빠르기(OPERATOR_SPEED_FACTOR) */
      const observing = new Set<number>();
      const subscriber: StreamSubscriber = {
        send: (text) => link.send(text),
        bufferedAmount: () => link.bufferedAmount(),
      };
      const reply = (id: number, result: CommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };
      // 유닛 조종 결과 코드(not_owner·unit_stays)는 그 코드를 아는 연결에만, 아니면 전처럼 forbidden
      const knowsUnitCodes =
        (link.protocolVersion ?? SECOND_MAP_PROTOCOL_VERSION) >= UNIT_CONTROL_PROTOCOL_VERSION;
      const denialCode = (denial: UnitControlDenial): ResultCode => (knowsUnitCodes ? denial : "forbidden");

      const process = async (message: SecondMapClientMessage): Promise<void> => {
        const mapKey = message.mapKey;
        // 구독 해제는 로그인 여부와 상관없이 늘 된다
        if (message.t === "unsubscribe") {
          const map = subscribed.get(mapKey);
          map?.stream.unsubscribe(subscriber);
          map?.vision.unsubscribe(subscriber);
          subscribed.delete(mapKey);
          observing.delete(mapKey);
          reply(message.id, { ok: true });
          return;
        }
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        if (world.isReady && !world.isReady()) return reply(message.id, fail("busy"));
        const map = isCellKey(mapKey) ? world.map(mapKey) : undefined;
        if (!map) return reply(message.id, fail("unknown_map"));

        if (message.t === "subscribe") {
          const observe = message.observe === true;
          if (observe && !canObserve(viewer)) return reply(message.id, fail("forbidden"));
          if (!observe && !(await canViewSecondMap(world, viewer, map)))
            return reply(message.id, fail("not_visible"));
          if (closed) return;
          if (!subscribed.has(mapKey) && subscribed.size >= MAX_MAPS_PER_SOCKET) {
            return reply(message.id, fail("too_many_maps"));
          }
          if (!subscribeLimiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
          // 결과를 먼저 보내고 스냅샷을 보낸다(기기는 ok 다음에 조각들이 온다고 안다)
          reply(message.id, { ok: true });
          subscribed.set(mapKey, map);
          if (observe) observing.add(mapKey);
          else observing.delete(mapKey);
          if (observe) {
            map.vision.unsubscribe(subscriber);
            map.stream.subscribe(subscriber);
            options.onObserve?.(viewer, mapKey);
          } else {
            map.stream.unsubscribe(subscriber);
            map.vision.subscribe(subscriber, {
              userId: viewer.id,
              ownerId: world.ownerOfUser?.(viewer.id),
              nations: nationLookupOf(world),
            });
          }
          return;
        }

        if (message.t === "dev_spawn_units") {
          if (!rolesAllow(viewer.roles, { secondMap: ["dev-spawn"] }))
            return reply(message.id, fail("forbidden"));
          if (!commandLimiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
          const made = world.devSpawn?.(viewer.id, mapKey, message.count) ?? 0;
          return reply(message.id, made > 0 ? { ok: true } : fail("busy"));
        }

        // 유닛 명령: 내 유닛(수호신은 그 도시에 머문다 — 기획 답 456 가)이거나 운영자(dev·admin). 건물 명령은 권한 표(admin)
        let operatorOverride: { readonly unitId: number; readonly ownerId: number | null } | undefined;
        if (message.t === "move_unit" || message.t === "stop_unit") {
          const unit = map.unitInfo(message.unitId);
          const ownerId = world.ownerOfUser?.(viewer.id);
          const denial = unitControlDenial(unit, ownerId, false);
          if (denial && !canCommandAnyUnit(viewer.roles)) return reply(message.id, fail(denialCode(denial)));
          // 운영자 권한으로만 되는 명령은 감사 기록에 남긴다(없는 유닛은 2차맵이 unknown_unit으로 끝낸다)
          if (denial && unit) operatorOverride = { unitId: message.unitId, ownerId: unit.ownerId };
        } else if (!rolesAllow(viewer.roles, { secondMap: [BUILDING_ACTIONS[message.t]] })) {
          return reply(message.id, fail("forbidden"));
        }
        if (!commandLimiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        world.stats.commands += 1;
        const placer = world.ownerOfUser?.(viewer.id) ?? null;
        // 운영자 모드(전체 보기 구독, 권한은 구독 때 확인)에서 보낸 이동은 훨씬 빠르게(사용자 지적 2026-11-09 "운영자모드에서 이동속도를 훨씬빠르게")
        const speedFactor =
          observing.has(mapKey) && canCommandAnyUnit(viewer.roles) ? OPERATOR_SPEED_FACTOR : 1;
        const result = await dedup.run(`${viewer.id}:${mapKey}:${message.id}`, () =>
          execute(map, message, placer, now(), speedFactor),
        );
        if (operatorOverride && result.ok && (message.t === "move_unit" || message.t === "stop_unit"))
          options.onOperatorCommand?.(viewer, { t: message.t, mapKey, ...operatorOverride });
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
          for (const map of subscribed.values()) {
            map.stream.unsubscribe(subscriber);
            map.vision.unsubscribe(subscriber);
          }
          subscribed.clear();
        },
      };
    },
  };
}
