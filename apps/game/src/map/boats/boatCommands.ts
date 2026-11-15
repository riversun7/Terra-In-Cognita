// 배 명령(WebSocket, 프로토콜 27, 만드는 시간은 28, 조선소·정박장·교역 부두는 30, 도크 출고·연료·오버히트·보직·빼앗기는 37) — 배 만들기·타기·내리기·수리·
// 집 정박장·교역 부두 시간·주인 설정·출고·연료 보급·오버히트·보직·빼앗기.
// docs/adr/2026-11-13-boats.md, docs/adr/2026-11-15-shipyard-harbor.md. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// 채집 명령(gather/gatherCommands.ts)과 같은 틀: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout".
// 배를 움직이는 것은 보통 이동 명령(move_unit)이다 — 서버가 배는 물 길로 푼다.
import type { BoatResultCode, ClientMessageOf } from "@terra/protocol";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";

export type BoatCommand =
  | Omit<ClientMessageOf<"boat_build">, "id">
  | Omit<ClientMessageOf<"boat_board">, "id">
  | Omit<ClientMessageOf<"boat_leave">, "id">
  | Omit<ClientMessageOf<"boat_repair">, "id">
  | Omit<ClientMessageOf<"boat_berth">, "id">
  | Omit<ClientMessageOf<"boat_dock_time">, "id">
  | Omit<ClientMessageOf<"harbor_policy">, "id">
  | Omit<ClientMessageOf<"boat_release">, "id">
  | Omit<ClientMessageOf<"boat_refuel">, "id">
  | Omit<ClientMessageOf<"boat_overheat">, "id">
  | Omit<ClientMessageOf<"boat_crew">, "id">
  | Omit<ClientMessageOf<"boat_seize">, "id">
  | Omit<ClientMessageOf<"boat_unload">, "id">;

export type BoatOutcome =
  | {
      readonly ok: true;
      readonly boatId?: number | undefined;
      readonly walking?: boolean | undefined;
      /** 만들기: 만드는 중이면 배가 뜨는 시각(서버 ms, 프로토콜 28) */
      readonly readyAtMs?: number | undefined;
    }
  | {
      readonly ok: false;
      readonly code: BoatResultCode | "offline" | "timeout";
      readonly readyAtMs?: number | undefined;
    };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendBoatCommand(command: BoatCommand, link: ServerLink = serverLink): Promise<BoatOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: BoatOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "boat_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? { ok: true, boatId: message.boatId, walking: message.walking, readyAtMs: message.readyAtMs }
            : { ok: false, code: message.code, readyAtMs: message.readyAtMs },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
