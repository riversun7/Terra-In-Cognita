// 건물 명령(WebSocket, 프로토콜 10 — 창고 옮기기 11, 공격 12) — facility_build·facility_upgrade·facility_repair·equipment_repair·
// storage_move·facility_attack과 개발 시험 명령을 보내고 같은 요청 번호의 facility_result를 기다린다. docs/adr/2026-11-07-buildings-runtime.md. 바꾸는 명령은 WebSocket으로만(AGENTS.md 4장).
// - 연결이 아직 인사 전이면 인사가 끝날 때까지 기다렸다 보낸다. 기다림·답 모두 TIMEOUT_MS 안.
// - 끊기면(down) 기다리던 명령은 "offline"으로 끝난다. 서버가 받았는지 모르므로 화면은 목록을 다시 받는다.
// 경제 지연 조각 안에서만 쓴다.
import type { ClientMessageOf, FacilityResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type FacilityCommand =
  | Omit<ClientMessageOf<"facility_build">, "id">
  | Omit<ClientMessageOf<"facility_upgrade">, "id">
  | Omit<ClientMessageOf<"facility_repair">, "id">
  | Omit<ClientMessageOf<"equipment_repair">, "id">
  | Omit<ClientMessageOf<"dev_facility_grant">, "id">
  | Omit<ClientMessageOf<"dev_facility_finish">, "id">
  | Omit<ClientMessageOf<"storage_move">, "id">
  | Omit<ClientMessageOf<"facility_attack">, "id">;

export type FacilityCommandOutcome =
  | { readonly ok: true; readonly buildingId?: number; readonly doneAtMs?: number }
  | { readonly ok: false; readonly code: FacilityResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendFacilityCommand(
  command: FacilityCommand,
  link: ServerLink = serverLink,
): Promise<FacilityCommandOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: FacilityCommandOutcome): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(outcome);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send({ ...command, id });
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish({ ok: false, code: "offline" });
      else if (event.kind === "message" && event.message.t === "facility_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? {
                ok: true,
                ...(message.buildingId === undefined ? {} : { buildingId: message.buildingId }),
                ...(message.doneAtMs === undefined ? {} : { doneAtMs: message.doneAtMs }),
              }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
