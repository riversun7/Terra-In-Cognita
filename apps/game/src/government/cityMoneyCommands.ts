// 도시 화폐(도시의 기축 통화) 고르기 명령(WebSocket city_currency → city_currency_result, 프로토콜 69 — docs/adr/2026-11-24-city-money.md). 바꾸는 명령은
// WebSocket으로만 보낸다(AGENTS.md 4장). 나라 세금 정하기 명령(nationTaxCommands.ts)과 같은 틀이다.
import type { ClientMessageOf, CityMoneyResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type CityCurrencyCommand = Omit<ClientMessageOf<"city_currency">, "t" | "id">;

export type CityCurrencyOutcome =
  | { readonly ok: true; readonly cityId: number; readonly currency: string }
  | { readonly ok: false; readonly code: CityMoneyResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 도시 화폐 고르기를 보내고 결과를 기다린다(currency null = 주인 나라 화폐) */
export function sendCityCurrency(
  command: CityCurrencyCommand,
  link: ServerLink = serverLink,
): Promise<CityCurrencyOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: CityCurrencyOutcome): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(outcome);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send({ t: "city_currency", id, ...command });
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish({ ok: false, code: "offline" });
      else if (
        event.kind === "message" &&
        event.message.t === "city_currency_result" &&
        event.message.id === id
      ) {
        const message = event.message;
        finish(
          message.ok
            ? { ok: true, cityId: message.cityId, currency: message.currency }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
