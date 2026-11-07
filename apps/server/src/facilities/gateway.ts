// WebSocket 연결 하나의 건물 명령 처리(src/session.ts가 넘긴다, 프로토콜 10 — 창고 옮기기 11, 건물·비콘 공격 12) —
// docs/adr/2026-11-07-buildings-runtime.md
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(같은 건물·유닛을 차례로 바꾼다).
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 노동 계약 명령과 같은 값). 밀린 요청이 MAX_PENDING을 넘으면 busy.
// - 개발 시험 명령(dev_facility_grant·dev_facility_finish)은 dev·admin(secondMap dev-spawn — 보유 물건 dev_grant_item과 같은 권한).
// - 판정·저장은 서비스(service.ts)가 한다. 세계가 아직 없으면(부팅 중·DB 없음) busy.
// - 행정 건물(폐허 정부, 프로토콜 13 — docs/adr/2026-11-07-ruins-restoration.md)의 새 코드 not_ruin·ruin_claimed는 13판 연결에만 가고 더 낮은
//   판은 not_buildable을 받는다(그 판 기기가 모르는 코드라 메시지를 풀지 못한다).
import {
  type ClientMessageOf,
  type FacilityResultCode,
  RUINS_PROTOCOL_VERSION,
  encodeMessage,
} from "@terra/protocol";
import { PLACEMENT_SIZE } from "@terra/sim";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { BuildingAttack } from "./attack.ts";
import type { FacilityCommandResult, FacilityService } from "./service.ts";

export type FacilityClientMessage = ClientMessageOf<
  | "facility_build"
  | "facility_upgrade"
  | "facility_repair"
  | "equipment_repair"
  | "dev_facility_grant"
  | "dev_facility_finish"
  | "storage_move"
  | "facility_attack"
>;

const MAX_PENDING = 8;
/** 개발 재료 받기 자리 칸이 빠졌을 때(2차맵 가운데 칸) */
const CENTER = PLACEMENT_SIZE >> 1;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface FacilityLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 인사한 프로토콜 판(없으면 지금 판). 13 아래면 폐허 코드를 not_buildable로 */
  protocolVersion?: number | undefined;
}

/** 13판에 생긴 건물 결과 코드(행정 건물 짓기) */
const RUIN_CODES: ReadonlySet<FacilityResultCode> = new Set(["not_ruin", "ruin_claimed"]);

export interface FacilitySocket {
  handle(message: FacilityClientMessage): void;
  close(): void;
}

export interface FacilityGateway {
  open(link: FacilityLink): FacilitySocket;
}

function resultText(id: number, result: FacilityCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "facility_result", id, ok: false, code: result.code });
  return encodeMessage({
    t: "facility_result",
    id,
    ok: true,
    ...(result.buildingId === undefined ? {} : { buildingId: result.buildingId }),
    ...(result.doneAtMs === undefined ? {} : { doneAtMs: result.doneAtMs }),
  });
}

const fail = (code: FacilityResultCode): FacilityCommandResult => ({ ok: false, code });

function run(
  service: FacilityService,
  attack: BuildingAttack | undefined,
  userId: string,
  message: FacilityClientMessage,
): Promise<FacilityCommandResult> {
  switch (message.t) {
    case "facility_attack":
      if (!attack) return Promise.resolve(fail("busy"));
      return attack.attack(
        userId,
        message.buildingId === undefined
          ? { beaconId: message.beaconId ?? 0 }
          : { buildingId: message.buildingId },
        message.unitIds,
      );
    case "facility_build":
      return service.build(userId, {
        mapKey: message.mapKey,
        facility: message.facility,
        x: message.x,
        y: message.y,
        rotation: message.rotation,
        unitIds: message.unitIds,
      });
    case "facility_upgrade":
      return service.upgrade(userId, message.buildingId, message.unitIds ?? []);
    case "facility_repair":
      return service.repair(
        userId,
        message.buildingId === undefined
          ? { beaconId: message.beaconId ?? 0 }
          : { buildingId: message.buildingId },
        message.steps,
        message.unitIds,
      );
    case "equipment_repair":
      return service.repairEquipment(userId, message.buildingId, message.holdingId, message.unitIds);
    case "dev_facility_grant":
      return service.devFacilityGrant(
        userId,
        message.item,
        message.qty,
        message.mapKey === undefined
          ? undefined
          : { mapKey: message.mapKey, x: message.x ?? CENTER, y: message.y ?? CENTER },
      );
    case "storage_move":
      return service.storageMove(userId, {
        buildingId: message.buildingId,
        asset: message.asset,
        qty: message.qty,
        direction: message.direction,
      });
    case "dev_facility_finish":
      return service.devFinish(
        userId,
        message.buildingId === undefined
          ? { beaconId: message.beaconId ?? 0 }
          : { buildingId: message.buildingId },
      );
    default: {
      const unhandled: never = message;
      return unhandled;
    }
  }
}

export function createFacilityGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => FacilityService | undefined;
  /** 건물·영토 비콘 공격(질문 381, 프로토콜 12). 없으면 busy */
  attack?: (() => BuildingAttack | undefined) | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): FacilityGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const old = (link.protocolVersion ?? RUINS_PROTOCOL_VERSION) < RUINS_PROTOCOL_VERSION;
      const reply = (id: number, result: FacilityCommandResult): void => {
        if (closed) return;
        const shown = old && !result.ok && RUIN_CODES.has(result.code) ? fail("not_buildable") : result;
        link.send(resultText(id, shown));
      };
      const process = async (message: FacilityClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const dev = message.t === "dev_facility_grant" || message.t === "dev_facility_finish";
        if (dev && !rolesAllow(viewer.roles, { secondMap: ["dev-spawn"] }))
          return reply(message.id, fail("forbidden"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        reply(message.id, await run(service, options.attack?.(), viewer.id, message));
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
              options.log.error({ err: error, t: message.t }, "facility request failed");
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
