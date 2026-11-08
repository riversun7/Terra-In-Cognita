// 국적 바꾸기(귀화) 명령(WebSocket, 프로토콜 18·19) — 신청을 보내고 같은 요청 번호의 nationality_result를 기다린다.
// 질문 745 나, docs/adr/2026-11-08-citizenship.md. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// 병원 명령(units/hospitalCommands.ts)과 같은 틀이다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout".
import type { ClientMessageOf, NationalityResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type NaturalizeCommand = Omit<ClientMessageOf<"nationality_change">, "id">;

export type NaturalizeOutcome =
  | {
      readonly ok: true;
      readonly factionId: number;
      readonly paid: string;
      /** 받은 지원금(D-526, 옛 서버면 "0")·옛 나라 우호도가 떨어진 양 */
      readonly granted: string;
      readonly standingDrop: number;
      readonly nextAtMs: number;
    }
  | { readonly ok: false; readonly code: NationalityResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 신청 하나를 보내고 결과를 기다린다 */
export function sendNaturalize(
  command: NaturalizeCommand,
  link: ServerLink = serverLink,
): Promise<NaturalizeOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: NaturalizeOutcome): void => {
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
      else if (
        event.kind === "message" &&
        event.message.t === "nationality_result" &&
        event.message.id === id
      ) {
        const message = event.message;
        finish(
          message.ok
            ? {
                ok: true,
                factionId: message.factionId,
                paid: message.paid,
                granted: message.granted ?? "0",
                standingDrop: message.standingDrop ?? 0,
                nextAtMs: message.nextAtMs,
              }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
