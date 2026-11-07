// 병원 명령(WebSocket, 프로토콜 17) — 치료·개발 시험 부상을 보내고 같은 요청 번호의 hospital_result를 기다린다.
// 기획 D-521, docs/adr/2026-11-08-injury.md. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// 신전 명령(economy/templeCommands.ts)과 같은 틀이다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout".
import type { ClientMessageOf, HospitalResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type HospitalCommand =
  | Omit<ClientMessageOf<"hospital_treat">, "id">
  | Omit<ClientMessageOf<"dev_injure_unit">, "id">;

export type HospitalOutcome =
  | {
      readonly ok: true;
      readonly stage?: number | undefined;
      readonly greenAtMs?: number | undefined;
      readonly paid?: string | undefined;
    }
  | { readonly ok: false; readonly code: HospitalResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendHospitalCommand(
  command: HospitalCommand,
  link: ServerLink = serverLink,
): Promise<HospitalOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: HospitalOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "hospital_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? { ok: true, stage: message.stage, greenAtMs: message.greenAtMs, paid: message.paid }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
