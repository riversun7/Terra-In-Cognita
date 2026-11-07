// 신전 명령(WebSocket, 프로토콜 12) — 기도·헌금·의식·개발 시험 비활성 만들기를 보내고 같은 요청 번호의 temple_result를 기다린다.
// 기획 D-517·D-311·D-441·D-451, docs/adr/2026-11-07-temple-religion.md. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// 융합 명령(units/fusionCommands.ts)과 같은 틀이다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout".
// 경제 화면 지연 조각 안에서만 쓴다.
import type { ClientMessageOf, TempleResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type TempleCommand =
  | Omit<ClientMessageOf<"temple_pray">, "id">
  | Omit<ClientMessageOf<"temple_offer">, "id">
  | Omit<ClientMessageOf<"temple_rite">, "id">
  | Omit<ClientMessageOf<"dev_inactivate_unit">, "id">;

export type TempleOutcome =
  | {
      readonly ok: true;
      readonly unitId?: number | undefined;
      readonly faith?: number | undefined;
      readonly gained?: number | undefined;
    }
  | { readonly ok: false; readonly code: TempleResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendTempleCommand(
  command: TempleCommand,
  link: ServerLink = serverLink,
): Promise<TempleOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: TempleOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "temple_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? { ok: true, unitId: message.unitId, faith: message.faith, gained: message.gained }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
