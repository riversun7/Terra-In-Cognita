// WebSocket 연결 하나의 배 메시지 처리(src/session.ts가 넘긴다, 프로토콜 27) — docs/adr/2026-11-13-boats.md. 채집 게이트웨이와 같은 틀:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다.
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 채집·건물 명령과 같음). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 운영자 모드(같은 연결이 2차맵 전체 보기 + 모든 유닛 명령 권한)는 남의 부두·유닛·배에 명령하고 배를 재료 없이 만든다. 타러 걷는 길은 운영자
//   빠르기(world/operatorPace.ts).
// - 프로토콜 30(배 체계 개편, docs/adr/2026-11-15-shipyard-harbor.md): 수리·집 정박장·교역 부두 시간·주인 설정. 새 결과 코드는 30판 연결에만, 29판은 옛 코드로.
// - 프로토콜 37(D-559): 도크 출고·모듈 묶음·연료 보급·오버히트·보직·빼앗기. 새 결과 코드는 37판 연결에만, 36판은 legacyVoyageCode로.
// - 프로토콜 43(D-564·D-568): 배 창고 내리기(boat_unload), 남의 조선소 주문(만들기가 받기 범위를 기다린다). 새 결과 코드는 43판 연결에만, 그 아래는 legacyHoldCode로.
// - 프로토콜 49(D-570, 줄기 55): 포획 장비 달기·떼기(boat_gear)·배 창고 싣기(boat_load). 새 결과 코드는 49판 연결에만, 그 아래는 legacyGearCode로.
// - 프로토콜 52(기획 대조 2057·2072): 배 판매가 0 = 만들지 않음(order_closed). 51판 이하는 legacyOrderCode로.
// - 프로토콜 58(기획 대조 boats-5, D-555 1505): 내리기·싣기 운반꾼 없음(no_carrier). 57판 이하는 legacyCarryCode로.
import {
  BOAT_B2_PROTOCOL_VERSION,
  BOAT_CARRY_PROTOCOL_VERSION,
  type BoatResultCode,
  type ClientMessageOf,
  GEAR_PROTOCOL_VERSION,
  BOAT_PRICE_PROTOCOL_VERSION,
  HARBOR_PROTOCOL_VERSION,
  HOLD_PROTOCOL_VERSION,
  VOYAGE_PROTOCOL_VERSION,
  encodeMessage,
  legacyBoatCode,
  legacyCarryCode,
  legacyGearCode,
  legacyHoldCode,
  legacyOrderCode,
  legacyVoyageCode,
} from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import {
  type OperatorPaceLink,
  type PaceMap,
  isOperatorMode,
  operatorFactor,
  withPace,
} from "../world/operatorPace.ts";
import type { BoatCommandResult, BoatService } from "./service.ts";

export type BoatClientMessage = ClientMessageOf<
  | "boat_build"
  | "boat_board"
  | "boat_leave"
  | "boat_repair"
  | "boat_berth"
  | "boat_dock_time"
  | "harbor_policy"
  | "boat_release"
  | "boat_refuel"
  | "boat_overheat"
  | "boat_crew"
  | "boat_seize"
  | "boat_unload"
  | "boat_gear"
  | "boat_load"
>;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface BoatLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 같은 연결이 2차맵을 전체 보기(운영자 모드)로 구독 중인가(world/gateway.ts). 없으면 아니다 */
  observing?(): boolean;
  /** 이 연결의 운영자 배율(기본 1 — 기획 D-560 1246, world/operatorPace.ts). 없으면 1 */
  operatorPace?: OperatorPaceLink | undefined;
  /** 인사한 프로토콜 판(28 미만이면 새 코드 dock_busy를 busy로 바꿔 보낸다). 없으면 최신 */
  readonly protocolVersion?: number | undefined;
}

export interface BoatSocket {
  handle(message: BoatClientMessage): void;
  close(): void;
}

export interface BoatGateway {
  open(link: BoatLink): BoatSocket;
}

function resultText(id: number, result: BoatCommandResult, protocolVersion: number): string {
  if (!result.ok) {
    // 30판 새 코드는 29판 연결에 옛 코드로. dock_busy는 그 코드를 아는 연결(28)에만, 아니면 busy(다시 해 볼 수 있다)
    const carry = protocolVersion < BOAT_CARRY_PROTOCOL_VERSION ? legacyCarryCode(result.code) : result.code;
    const order = protocolVersion < BOAT_PRICE_PROTOCOL_VERSION ? legacyOrderCode(carry) : carry;
    const gear = protocolVersion < GEAR_PROTOCOL_VERSION ? legacyGearCode(order) : order;
    const hold = protocolVersion < HOLD_PROTOCOL_VERSION ? legacyHoldCode(gear) : gear;
    const voyage = protocolVersion < VOYAGE_PROTOCOL_VERSION ? legacyVoyageCode(hold) : hold;
    const known = protocolVersion < HARBOR_PROTOCOL_VERSION ? legacyBoatCode(voyage) : voyage;
    const code = known === "dock_busy" && protocolVersion < BOAT_B2_PROTOCOL_VERSION ? "busy" : known;
    return encodeMessage({
      t: "boat_result",
      id,
      ok: false,
      code,
      ...(result.readyAtMs === undefined ? {} : { readyAtMs: result.readyAtMs }),
    });
  }
  return encodeMessage({
    t: "boat_result",
    id,
    ok: true,
    ...(result.boatId === undefined ? {} : { boatId: result.boatId }),
    ...(result.walking ? { walking: true } : {}),
    ...(result.readyAtMs === undefined ? {} : { readyAtMs: result.readyAtMs }),
  });
}

const fail = (code: BoatResultCode): BoatCommandResult => ({ ok: false, code });

export function createBoatGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => BoatService | undefined;
  /** 띄운 2차맵(운영자 빠르기 표시를 단다). 없으면 표시하지 않는다 */
  maps?: (() => Iterable<PaceMap>) | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): BoatGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: BoatCommandResult): void => {
        if (!closed) link.send(resultText(id, result, link.protocolVersion ?? BOAT_B2_PROTOCOL_VERSION));
      };

      const process = async (message: BoatClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        const operator = isOperatorMode(link.observing?.() === true, viewer.roles);
        const owner = (): number | undefined => service.ownerOf(viewer.id);
        switch (message.t) {
          case "boat_build":
            return reply(
              message.id,
              await service.build(viewer.id, message.buildingId, operator, message.boatType),
            );
          case "boat_repair":
            return reply(
              message.id,
              await service.repair(viewer.id, message.boatId, message.buildingId, operator),
            );
          case "boat_berth":
            return reply(
              message.id,
              await service.berth(viewer.id, message.boatId, message.buildingId, operator),
            );
          case "boat_dock_time":
            return reply(
              message.id,
              await service.dockTime(viewer.id, message.boatId, message.buildingId, message.hours, operator),
            );
          case "harbor_policy":
            return reply(
              message.id,
              service.policy(
                viewer.id,
                message.buildingId,
                {
                  access: message.access,
                  fee: message.fee,
                  module: message.module,
                  modules: message.modules,
                },
                operator,
              ),
            );
          case "boat_board":
            return reply(
              message.id,
              await withPace(
                options.maps?.() ?? [],
                message.unitId,
                operatorFactor(link, viewer.roles),
                () => service.board(viewer.id, message.unitId, message.boatId, operator),
                link.operatorPace,
              ),
            );
          case "boat_leave":
            return reply(message.id, service.leave(viewer.id, message.boatId, operator));
          case "boat_release":
            return reply(message.id, service.release(viewer.id, message.boatId, operator));
          case "boat_refuel":
            return reply(
              message.id,
              service.voyage.refuel(owner(), message.boatId, message.buildingId, operator),
            );
          case "boat_overheat":
            return reply(message.id, service.voyage.overheat(owner(), message.boatId, message.on, operator));
          case "boat_crew":
            return reply(
              message.id,
              service.voyage.crew(owner(), message.boatId, message.unitId, message.post, operator),
            );
          case "boat_seize":
            return reply(message.id, service.voyage.seize(owner(), message.boatId, message.unitId, operator));
          case "boat_unload":
            return reply(message.id, service.unload(owner(), message.boatId, message.buildingId, operator));
          case "boat_gear":
            return reply(
              message.id,
              service.gear(owner(), message.boatId, message.buildingId, message.slot, message.item, operator),
            );
          case "boat_load":
            return reply(
              message.id,
              service.load(owner(), message.boatId, message.buildingId, message.item, message.lots, operator),
            );
          default: {
            const unknown: never = message;
            return unknown;
          }
        }
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
              options.log.error({ err: error, t: message.t }, "boat request failed");
              reply(message.id, fail("internal_error"));
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
