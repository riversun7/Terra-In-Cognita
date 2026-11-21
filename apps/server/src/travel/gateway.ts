// WebSocket 연결 하나의 2차맵 사이 이동 메시지 처리(src/session.ts가 넘긴다, 프로토콜 16) — docs/adr/2026-11-07-play-flow.md "WP9". 폐허 게이트웨이와 같은 틀이다:
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(같은 유닛의 보내기·멈추기 차례).
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 건물 명령과 같음). 밀린 요청이 MAX_PENDING을 넘으면 busy. 세계가 아직 없으면 busy.
// - 소유·길 판정과 걷기는 서비스(service.ts)가 한다. 기기는 목적 2차맵·칸·명령 종류만 보낸다(서버 권위).
// - 운영자 텔레포트(teleport 칸, 프로토콜 36, 기획 D-560 1239): 모든 유닛 명령 권한(dev·admin, canCommandAnyUnit)일 때만 — 아니면 forbidden. 서버가
//   권한을 본다(기기의 운영자 모드 단추는 화면 편의일 뿐).
// - 유닛 AI 작전 저장(unit_tactics, 프로토콜 50 — 기획 D-5039·D-5040, 질문 2021·2023 답): 조우 판단 입력이라 이동 메시지와 같은 줄로 받는다.
//   저장소(tactics/store.ts)가 소유·종류를 본다. 답은 travel_result.
// - 유닛 공격(unit_attack, 프로토콜 123 — 줄기 fixes-1117c, D-588 2496 가·기획 대조 2543): 조우 규칙의 일부러 치기(encounterWorld.ts strike)로 넘긴다.
//   조우 규칙이 아직 켜지지 않았으면 busy. 답은 travel_result(ok = 전투가 열렸다).
// - 걷는 빠르기 = 이 연결의 운영자 배율(기본 1, D-560 1246). 운영자 모드를 끄면 그 연결이 보낸 길의 빠르기를 1로 돌린다(releasePace, 1248).
import { type ClientMessageOf, type TravelResultCode, encodeMessage } from "@terra/protocol";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import { type OperatorPaceLink, type PaceMap, operatorFactor, withPace } from "../world/operatorPace.ts";
import { canCommandAnyUnit } from "../world/unitControl.ts";
import type { UnitTacticsStore } from "../tactics/store.ts";
import { encounterStrikeOf } from "./encounterWorld.ts";
import type { TravelCommandResult, TravelService } from "./service.ts";

export type TravelClientMessage = ClientMessageOf<
  "travel_start" | "travel_cancel" | "unit_tactics" | "unit_attack"
>;
type TravelMoveMessage = ClientMessageOf<"travel_start" | "travel_cancel">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface TravelLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /**
   * 같은 연결이 2차맵을 전체 보기(운영자 모드)로 구독 중인가. 그러면 보내는 길은 운영자 배율(operatorPace) — 2차맵 이동 명령과 같다
   * (사용자 지적 2026-11-09 "운영자모드에서 인접 2차맵을 목적지로 선택시 원래 속도로 느려진다")
   */
  observing?(): boolean;
  /** 이 연결의 운영자 배율(기본 1 — 기획 D-560 1246, world/operatorPace.ts). 없으면 1 */
  operatorPace?: OperatorPaceLink | undefined;
}

export interface TravelSocket {
  handle(message: TravelClientMessage): void;
  close(): void;
}

export interface TravelGateway {
  open(link: TravelLink): TravelSocket;
}

function resultText(id: number, result: TravelCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "travel_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "travel_result",
    id,
    ok: true,
    ...(result.maps === undefined ? {} : { maps: result.maps }),
    ...(result.arriveAt === undefined ? {} : { arriveAt: result.arriveAt }),
  });
}

const fail = (code: TravelResultCode): TravelCommandResult => ({ ok: false, code });

function run(service: TravelService, viewer: Viewer, message: TravelMoveMessage, speedFactor: number) {
  switch (message.t) {
    case "travel_start": {
      const target = {
        unitId: message.unitId,
        mapKey: message.mapKey,
        x: message.x,
        y: message.y,
        kind: message.kind,
      };
      // 운영자 텔레포트(D-560 1239): 권한은 서버가 본다
      if (message.teleport === true)
        return canCommandAnyUnit(viewer.roles)
          ? service.teleport(viewer.id, target)
          : Promise.resolve(fail("forbidden"));
      return service.start(viewer.id, target, { speedFactor });
    }
    case "travel_cancel":
      return Promise.resolve(service.cancel(viewer.id, message.unitId));
    default: {
      const unknown: never = message;
      return unknown;
    }
  }
}

export function createTravelGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => TravelService | undefined;
  /** 유닛 AI 작전 저장소(세계가 준비되면, tactics/store.ts). 없으면 unit_tactics는 busy */
  tactics?: (() => UnitTacticsStore | undefined) | undefined;
  /** 띄운 2차맵(운영자 빠르기 표시를 단다 — world/operatorPace.ts). 없으면 표시하지 않는다(길의 빠르기는 그대로 정한다) */
  maps?: (() => Iterable<PaceMap>) | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): TravelGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: TravelCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };
      // 운영자 모드를 끄면 이 연결이 보낸 길의 빠르기를 바로 1로(D-560 1248)
      const stopRelease = link.operatorPace?.onRelease((unitIds) => {
        options.service()?.releasePace(unitIds);
      });

      const process = async (message: TravelClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        if (message.t === "unit_tactics") {
          const tactics = options.tactics?.();
          if (!tactics) return reply(message.id, fail("busy"));
          const { t: _t, id: _id, unitId, ...value } = message;
          return reply(message.id, tactics.set(viewer.id, unitId, value));
        }
        if (message.t === "unit_attack") {
          const strike = encounterStrikeOf(service);
          if (!strike) return reply(message.id, fail("busy"));
          const code = await strike({
            userId: viewer.id,
            unitIds: message.unitIds,
            targetUnitId: message.targetUnitId,
          });
          return reply(message.id, code === "ok" ? { ok: true } : fail(code));
        }
        const factor = operatorFactor(link, viewer.roles);
        // 길의 빠르기는 길이 든다(service.ts). 표시는 다른 유닛 명령과 같은 규칙으로 단다·지운다(world/operatorPace.ts)
        const result = await withPace(
          options.maps?.() ?? [],
          message.unitId,
          factor,
          () => run(service, viewer, message, factor),
          link.operatorPace,
        );
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
              options.log.error({ err: error, t: message.t }, "travel request failed");
              reply(message.id, fail("internal_error"));
            })
            .finally(() => {
              pending -= 1;
            });
        },
        close() {
          closed = true;
          stopRelease?.();
        },
      };
    },
  };
}
