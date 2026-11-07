// 폐허 복원 명령(WebSocket, 프로토콜 13) — 모금 열기·넣기·개발 시험 폐허를 보내고 같은 요청 번호의 restoration_result를 기다린다.
// 기획 D-510·D-339·D-343·D-344, docs/adr/2026-11-07-ruins-restoration.md. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// 정부(행정 건물) 짓기는 건물 명령(facilityCommands.ts facility_build)이다. 신전 명령(templeCommands.ts)과 같은 틀이다: 인사 전이면 기다렸다
// 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout". 경제 화면 지연 조각 안에서만 쓴다.
import type { ClientMessageOf, RestorationResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type RuinCommand =
  | Omit<ClientMessageOf<"restoration_open">, "id">
  | Omit<ClientMessageOf<"restoration_fund">, "id">
  | Omit<ClientMessageOf<"dev_make_ruin">, "id">;

export type RuinOutcome =
  | {
      readonly ok: true;
      readonly ruinId?: number | undefined;
      readonly accepted?: string | undefined;
      readonly raised?: string | undefined;
      readonly restored?: boolean | undefined;
    }
  | { readonly ok: false; readonly code: RestorationResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendRuinCommand(command: RuinCommand, link: ServerLink = serverLink): Promise<RuinOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: RuinOutcome): void => {
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
        event.message.t === "restoration_result" &&
        event.message.id === id
      ) {
        const message = event.message;
        finish(
          message.ok
            ? {
                ok: true,
                ruinId: message.ruinId,
                accepted: message.accepted,
                raised: message.raised,
                restored: message.restored,
              }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
