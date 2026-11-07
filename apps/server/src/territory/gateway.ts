// WebSocket 연결 하나의 영토 비콘 메시지 처리(src/session.ts가 넘긴다) — docs/adr/2026-11-03-territory-layer.md 4절
// - 로그인한 사용자만. 한 연결의 요청은 받은 순서대로 하나씩(서비스도 모든 명령을 차례로 처리한다).
// - 사용자별 속도 제한(놓기·치우기 합쳐 순간 30번, 초당 10번 — 2차맵 명령과 같은 값, Assumed: 손으로 누르는 속도의 몇 배. 개발 화면·
//   화면 시험이 연달아 놓고 치운다).
//   밀린 요청이 MAX_PENDING을 넘으면 busy.
// - 다른 세력 대신(factionId가 내 세력이 아님·남의 비콘 치우기)은 권한 territory: dev-place(dev·admin)만. 판정·저장은 서비스.
// - 같은 사용자·같은 요청 번호면 10분 동안 같은 결과를 다시 준다(끊긴 뒤 다시 보낸 명령이 두 번 실행되지 않게, 2차맵 명령과 같다).
import {
  type BeaconResultCode,
  type ClientMessageOf,
  FACILITY_PROTOCOL_VERSION,
  encodeMessage,
} from "@terra/protocol";
import { rolesAllow } from "../auth/permissions.ts";
import { type RateLimiter, createRateLimiter } from "../rateLimit.ts";
import type { Viewer } from "../trpc/context.ts";
import type { BeaconCommandResult, TerritoryService } from "./service.ts";

export type TerritoryClientMessage = ClientMessageOf<"beacon_place" | "beacon_remove">;

const MAX_PENDING = 8;
const LIMIT = { capacity: 30, refillPerMinute: 600 };
const DEDUP_TTL_MS = 10 * 60_000;
const DEDUP_MAX_ENTRIES = 5_000;
/** 다시 해 볼 수 있는 실패는 기억하지 않는다 */
const TRANSIENT: ReadonlySet<BeaconResultCode> = new Set(["busy", "internal_error", "rate_limited"]);

export interface TerritoryLink {
  send(text: string): void;
  viewer(): Promise<Viewer | null>;
  /** 인사한 프로토콜 판(없으면 지금 판). 재료 모자람 코드는 판 10부터라 9판 연결에는 forbidden으로 보낸다 */
  protocolVersion?: number | undefined;
}

export interface TerritorySocket {
  handle(message: TerritoryClientMessage): void;
  close(): void;
}

export interface TerritoryGateway {
  open(link: TerritoryLink): TerritorySocket;
}

function resultText(id: number, result: BeaconCommandResult): string {
  if (!result.ok) return encodeMessage({ t: "beacon_result", id, ok: false, code: result.code });
  return encodeMessage(
    result.beaconId === undefined
      ? { t: "beacon_result", id, ok: true }
      : { t: "beacon_result", id, ok: true, beaconId: result.beaconId },
  );
}

const fail = (code: BeaconResultCode): BeaconCommandResult => ({ ok: false, code });

export function createTerritoryGateway(options: {
  /** 세계가 준비되면 서비스(없으면 busy) */
  service: () => TerritoryService | undefined;
  now: () => number;
  log: { error(obj: object, message: string): void };
}): TerritoryGateway {
  const limiter: RateLimiter = createRateLimiter({ ...LIMIT, now: options.now });
  const remembered = new Map<string, { at: number; result: Promise<BeaconCommandResult> }>();
  const dedup = (key: string, start: () => Promise<BeaconCommandResult>): Promise<BeaconCommandResult> => {
    const at = options.now();
    const hit = remembered.get(key);
    if (hit && at - hit.at < DEDUP_TTL_MS) return hit.result;
    remembered.delete(key);
    const result = start();
    remembered.set(key, { at, result });
    for (const [old, entry] of remembered) {
      if (remembered.size <= DEDUP_MAX_ENTRIES && at - entry.at < DEDUP_TTL_MS) break;
      remembered.delete(old);
    }
    void result.then(
      (value) => {
        if (!value.ok && TRANSIENT.has(value.code)) remembered.delete(key);
      },
      () => remembered.delete(key),
    );
    return result;
  };

  return {
    open(link) {
      let chain: Promise<void> = Promise.resolve();
      let pending = 0;
      let closed = false;
      const old = (link.protocolVersion ?? FACILITY_PROTOCOL_VERSION) < FACILITY_PROTOCOL_VERSION;
      const reply = (id: number, result: BeaconCommandResult): void => {
        if (closed) return;
        // 9판 기기는 insufficient_materials를 모른다(디코드 실패) → 그 판이 아는 가장 가까운 거절
        const sent: BeaconCommandResult =
          old && !result.ok && result.code === "insufficient_materials" ? fail("forbidden") : result;
        link.send(resultText(id, sent));
      };

      const process = async (message: TerritoryClientMessage): Promise<void> => {
        const viewer = await link.viewer();
        if (closed) return;
        if (!viewer) return reply(message.id, fail("sign_in_required"));
        const service = options.service();
        if (!service) return reply(message.id, fail("busy"));
        if (!limiter.take(viewer.id)) return reply(message.id, fail("rate_limited"));
        const actor = { userId: viewer.id, devPlace: rolesAllow(viewer.roles, { territory: ["dev-place"] }) };
        const result = await dedup(`${viewer.id}:${message.id}`, () =>
          message.t === "beacon_place"
            ? service.place(actor, {
                planetId: message.planetId,
                cellKey: message.cellKey,
                factionId: message.factionId,
              })
            : service.remove(actor, message.beaconId),
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
              options.log.error({ err: error, t: message.t }, "territory request failed");
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
