// 영토 비콘 명령(WebSocket, 프로토콜 6) — beacon_place·beacon_remove를 보내고 같은 요청 번호의 beacon_result를 기다린다.
// docs/adr/2026-11-03-territory-layer.md 4절. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장). 사이보그 명령(start/cyborgCommands.ts)과 같은 흐름:
// 인사 전이면 기다렸다 보내고, 끊기면 "offline", 답이 TIMEOUT_MS 안에 없으면 "timeout"(서버가 받았는지 모르므로 화면이 다시 읽는다).
import type { BeaconResultCode, ClientMessageOf } from "@terra/protocol";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";

export type BeaconCommand =
  | Omit<ClientMessageOf<"beacon_place">, "id">
  | Omit<ClientMessageOf<"beacon_remove">, "id">;

export type BeaconOutcome =
  | { readonly ok: true; readonly beaconId?: number }
  | { readonly ok: false; readonly code: BeaconResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendBeaconCommand(
  command: BeaconCommand,
  link: ServerLink = serverLink,
): Promise<BeaconOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: BeaconOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "beacon_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? message.beaconId === undefined
              ? { ok: true }
              : { ok: true, beaconId: message.beaconId }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
