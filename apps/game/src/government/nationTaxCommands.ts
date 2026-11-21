// 나라 세금 정하기 명령(WebSocket nation_tax → nation_tax_result, 프로토콜 57 — 질문 2322 나·2373 가). 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// 국적 바꾸기 명령(naturalizeCommands.ts)과 같은 틀이다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout".
import type { ClientMessageOf, NationTaxResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type NationTaxCommand = Omit<ClientMessageOf<"nation_tax">, "t" | "id">;

export type NationTaxOutcome =
  | { readonly ok: true; readonly factionId: number }
  | { readonly ok: false; readonly code: NationTaxResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 나라 세금 하나를 보내고 결과를 기다린다(칸마다 null = 정하지 않음) */
export function sendNationTax(
  command: NationTaxCommand,
  link: ServerLink = serverLink,
): Promise<NationTaxOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: NationTaxOutcome): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(outcome);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send({ t: "nation_tax", id, ...command });
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish({ ok: false, code: "offline" });
      else if (
        event.kind === "message" &&
        event.message.t === "nation_tax_result" &&
        event.message.id === id
      ) {
        const message = event.message;
        finish(message.ok ? { ok: true, factionId: message.factionId } : { ok: false, code: message.code });
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
