// 사이보그 만들기 명령(WebSocket, 프로토콜 4·5) — cyborg_roll·cyborg_create·cyborg_elements를 보내고 같은 요청 번호의 cyborg_result를
// 기다린다.
// docs/adr/2026-11-01-first-login-cyborg.md 4절. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// - 연결이 아직 인사 전이면 인사가 끝날 때까지 기다렸다 보낸다(만들기 화면을 켠 직후). 기다림·답 모두 TIMEOUT_MS 안.
// - 끊기면(down) 기다리던 명령은 "offline"으로 끝난다. 서버가 같은 명령을 받았는지 모르므로, 화면은 creation을 다시 물어 확인한다.
// 지연 조각(만들기 화면) 안에서만 쓴다.
import type { ClientMessageOf, CyborgResultCode, CyborgRollWire } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type CyborgCommand =
  | Omit<ClientMessageOf<"cyborg_roll">, "id">
  | Omit<ClientMessageOf<"cyborg_create">, "id">
  | Omit<ClientMessageOf<"cyborg_elements">, "id">;

export type CyborgCommandOutcome =
  | { readonly ok: true; readonly roll?: CyborgRollWire }
  | { readonly ok: false; readonly code: CyborgResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendCyborgCommand(
  command: CyborgCommand,
  link: ServerLink = serverLink,
): Promise<CyborgCommandOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: CyborgCommandOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "cyborg_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? message.roll === undefined
              ? { ok: true }
              : { ok: true, roll: message.roll }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
