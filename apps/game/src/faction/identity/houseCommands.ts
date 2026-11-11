// 가문 창설 명령(WebSocket house_found, 프로토콜 22) — 저장한 세력 정체성으로 가문을 창설하고 같은 요청 번호의 house_result를 기다린다.
// 질문 926 나, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)". 게임 상태를 바꾸는 명령은 WebSocket으로만(AGENTS.md 4장).
// 국적 바꾸기 명령(government/naturalizeCommands.ts)과 같은 틀이다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout".
import type { HouseResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";

export type HouseOutcome =
  | { readonly ok: true; readonly factionId: number; readonly paid: string }
  | { readonly ok: false; readonly code: HouseResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 창설 명령 하나를 보내고 결과를 기다린다. cost = 화면이 본 창설 비용(서버 값과 다르면 terms_changed) */
export function sendHouseFound(cost: string, link: ServerLink = serverLink): Promise<HouseOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: HouseOutcome): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(outcome);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send({ t: "house_found", id, cost });
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish({ ok: false, code: "offline" });
      else if (event.kind === "message" && event.message.t === "house_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? { ok: true, factionId: message.factionId, paid: message.paid }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
