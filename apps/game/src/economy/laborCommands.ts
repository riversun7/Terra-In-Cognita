// 노동 계약 명령(WebSocket) — labor_create·labor_terminate·labor_top_up·labor_set_rent와 구인 게시(labor_post_job·
// labor_withdraw_job·labor_accept_job, 판 8), 직무 배치(labor_assign·labor_unassign, 판 14)를 보내고 같은 요청 번호의 labor_result를 기다린다.
// docs/adr/2026-11-03-labor-contracts.md. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// - 연결이 아직 인사 전이면 인사가 끝날 때까지 기다렸다 보낸다. 기다림·답 모두 TIMEOUT_MS 안.
// - 끊기면(down) 기다리던 명령은 "offline"으로 끝난다. 서버가 받았는지 모르므로 화면은 계약 목록을 다시 받는다.
// 경제 지연 조각 안에서만 쓴다.
import type { ClientMessageOf, LaborResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type LaborCommand =
  | Omit<ClientMessageOf<"labor_create">, "id">
  | Omit<ClientMessageOf<"labor_terminate">, "id">
  | Omit<ClientMessageOf<"labor_top_up">, "id">
  | Omit<ClientMessageOf<"labor_set_rent">, "id">
  | Omit<ClientMessageOf<"labor_post_job">, "id">
  | Omit<ClientMessageOf<"labor_withdraw_job">, "id">
  | Omit<ClientMessageOf<"labor_accept_job">, "id">
  | Omit<ClientMessageOf<"labor_assign">, "id">
  | Omit<ClientMessageOf<"labor_unassign">, "id">;

export type LaborCommandOutcome =
  | { readonly ok: true; readonly contractId?: number; readonly jobId?: number }
  | { readonly ok: false; readonly code: LaborResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendLaborCommand(
  command: LaborCommand,
  link: ServerLink = serverLink,
): Promise<LaborCommandOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: LaborCommandOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "labor_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? {
                ok: true,
                ...(message.contractId === undefined ? {} : { contractId: message.contractId }),
                ...(message.jobId === undefined ? {} : { jobId: message.jobId }),
              }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
