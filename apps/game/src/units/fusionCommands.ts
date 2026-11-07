// 융합·유전자 환생·개발 물자 받기 명령(WebSocket, 프로토콜 9) — 보내고 같은 요청 번호의 fusion_result를 기다린다.
// 기획 D-470·D-478, docs/adr/2026-11-07-cyborg-fusion-genes.md. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// 구인 카드 명령(editor/recruit/recruitCommands.ts)과 같은 틀이다:
// - 연결이 아직 인사 전이면 인사가 끝날 때까지 기다렸다 보낸다. 기다림·답 모두 TIMEOUT_MS 안.
// - 끊기면(down) 기다리던 명령은 "offline"으로 끝난다. 서버가 받았는지 모르므로 화면은 목록을 다시 받아 확인한다.
// 유닛 화면 지연 조각 안에서만 쓴다.
import type { ClientMessageOf, FusionResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type FusionCommand =
  | Omit<ClientMessageOf<"cyborg_fuse">, "id">
  | Omit<ClientMessageOf<"unit_rebirth">, "id">
  | Omit<ClientMessageOf<"dev_grant_goods">, "id">;

export type FusionOutcome =
  | {
      readonly ok: true;
      readonly unitId?: number | undefined;
      readonly stats?: readonly number[] | undefined;
      readonly bonusPm?: number | undefined;
      readonly shards?: number | undefined;
    }
  | { readonly ok: false; readonly code: FusionResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendFusionCommand(
  command: FusionCommand,
  link: ServerLink = serverLink,
): Promise<FusionOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: FusionOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "fusion_result" && event.message.id === id) {
        const message = event.message;
        finish(
          message.ok
            ? {
                ok: true,
                unitId: message.unitId,
                stats: message.stats,
                bonusPm: message.bonusPm,
                shards: message.shards,
              }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
