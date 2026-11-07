// WebSocket 연결 하나의 건물 명령 처리(src/session.ts가 넘긴다, 프로토콜 9) — docs/adr/2026-11-07-buildings-runtime.md
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩 처리한다(같은 건물·유닛을 차례로 바꾼다).
// - 사용자별 속도 제한(순간 10번, 분당 30번 — 노동 계약 명령과 같은 값). 밀린 요청이 MAX_PENDING을 넘으면 busy.
// - 개발 시험 명령(dev_grant_goods·dev_facility_finish)은 dev·admin(secondMap dev-spawn — 보유 물건 dev_grant_item과 같은 권한).
// - 판정·저장은 서비스(service.ts)가 한다. 세계가 아직 없으면(부팅 중·DB 없음) busy.
import { type ClientMessageOf, type FacilityResultCode, encodeMessage } from "@terra/protocol";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { FacilityCommandResult, FacilityService } from "./service.ts";

export type FacilityClientMessage = ClientMessageOf<
  | "facility_build"
  | "facility_upgrade"
  | "facility_repair"
  | "equipment_repair"
  | "dev_grant_goods"
  | "dev_facility_finish"
>;

const MAX_PENDING = 8;
const LIMIT = { capacity: 10, refillPerMinute: 30 };

export interface FacilityLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
}

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

function run(service: FacilityService, userId: string, message: FacilityClientMessage): Promise<FacilityCommandResult> {
  switch (message.t) {
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
        message.buildingId === undefined ? { beaconId: message.beaconId ?? 0 } : { buildingId: message.buildingId },
        message.steps,
        message.unitIds,
      );
    case "equipment_repair":
      return service.repairEquipment(userId, message.buildingId, message.holdingId, message.unitIds);
    case "dev_grant_goods":
      return service.devGrantGoods(userId, message.item, message.qty);
    case "dev_facility_finish":
      return service.devFinish(
        userId,
        message.buildingId === undefined ? { beaconId: message.beaconId ?? 0 } : { buildingId: message.buildingId },
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
  now: () => number;
  log: { error(obj: object, message: string): void };
}): FacilityGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const reply = (id: number, result: FacilityCommandResult): void => {
        if (!closed) link.send(resultText(id, result));
      };
      const process = async (message: FacilityClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const dev = message.t === "dev_grant_goods" || message.t === "dev_facility_finish";
        if (dev && !rolesAllow(viewer.roles, { secondMap: ["dev-spawn"] })) return reply(message.id, fail("forbidden"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        reply(message.id, await run(service, viewer.id, message));
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
