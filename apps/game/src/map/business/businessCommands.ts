// 사업장 장부 명령(WebSocket, 프로토콜 34) — 정산·넣기·사기·값·유닛 선물. docs/adr/2026-11-15-business-ledger.md, 기획 D-548·D-555.
// 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장). 배 명령(boats/boatCommands.ts)과 같은 틀: 인사 전이면 기다렸다 보내고, 끊기면 "offline",
// TIMEOUT_MS 안에 답이 없으면 "timeout".
import type { BusinessResultCode, ClientMessageOf } from "@terra/protocol";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";

export type BusinessCommand =
  | Omit<ClientMessageOf<"business_settle">, "id">
  | Omit<ClientMessageOf<"business_invest">, "id">
  | Omit<ClientMessageOf<"business_buy">, "id">
  | Omit<ClientMessageOf<"business_price">, "id">
  | Omit<ClientMessageOf<"unit_gift">, "id">;

export type BusinessOutcome =
  | { readonly ok: true; readonly paid?: string | undefined }
  | { readonly ok: false; readonly code: BusinessResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendBusinessCommand(
  command: BusinessCommand,
  link: ServerLink = serverLink,
): Promise<BusinessOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: BusinessOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "business_result" && event.message.id === id) {
        const message = event.message;
        finish(message.ok ? { ok: true, paid: message.paid } : { ok: false, code: message.code });
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
