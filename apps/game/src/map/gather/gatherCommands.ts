// 채집·들어가기 명령(WebSocket, 프로토콜 17) — 2차맵 채집 판이 보내고 같은 요청 번호의 gather_result를 기다린다.
// docs/adr/2026-11-07-gather-objects.md. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장). 이동 명령(map/travelCommands.ts)과 같은 틀:
// 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout". 2차맵 화면 지연 조각 안에서만 쓴다.
import type { ClientMessageOf, GatherResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";

export type GatherCommand =
  | Omit<ClientMessageOf<"gather_start">, "id">
  | Omit<ClientMessageOf<"gather_stop">, "id">
  | Omit<ClientMessageOf<"unit_enter">, "id">;

export type GatherOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: GatherResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendGatherCommand(
  command: GatherCommand,
  link: ServerLink = serverLink,
): Promise<GatherOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: GatherOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "gather_result" && event.message.id === id) {
        const message = event.message;
        finish(message.ok ? { ok: true } : { ok: false, code: message.code });
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
