// 2차맵 사이 이동 명령(WebSocket, 프로토콜 16) — 1차맵 명령 판 [확정]·[멈추기]와 2차맵 화면의 이웃 땅 누르기(neighbourTravel.ts)가 보내고 같은 요청 번호의
// travel_result를 기다린다. docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동", 기획 D-197·D-6019·D-6021. 바꾸는 명령은 WebSocket으로만
// 보낸다(AGENTS.md 4장). 폐허 명령(economy/ruinsCommands.ts)과 같은 틀이다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이
// 없으면 "timeout". 1·2차맵 화면 지연 조각 안에서만 쓴다.
import type { ClientMessageOf, TravelResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type TravelCommand =
  | Omit<ClientMessageOf<"travel_start">, "id">
  | Omit<ClientMessageOf<"travel_cancel">, "id">
  // 유닛 AI 작전 저장(프로토콜 50, 유닛 화면 units/TacticsPanel.tsx — 답도 travel_result)
  | Omit<ClientMessageOf<"unit_tactics">, "id">;

export type TravelOutcome =
  | { readonly ok: true; readonly maps?: number | undefined; readonly arriveAt?: number | undefined }
  | { readonly ok: false; readonly code: TravelResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendTravelCommand(
  command: TravelCommand,
  link: ServerLink = serverLink,
): Promise<TravelOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: TravelOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "travel_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? { ok: true, maps: message.maps, arriveAt: message.arriveAt }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
