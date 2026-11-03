// 보유 물건 명령(WebSocket, 프로토콜 6) — item_equip·item_unequip·item_use·dev_grant_item을 보내고 같은 요청 번호의 item_result를
// 기다린다. docs/adr/2026-11-03-item-holdings.md 5절. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// - 연결이 아직 인사 전이면 인사가 끝날 때까지 기다렸다 보낸다. 기다림·답 모두 TIMEOUT_MS 안.
// - 끊기면(down) 기다리던 명령은 "offline"으로 끝난다. 서버가 받았는지 모르므로 화면은 holdings.list를 다시 물어 확인한다.
// - 판정(소유·칸·내구도·효과 교체·쿨)은 서버가 한다. 기기는 결과 코드만 보인다(holdingsText.ts가 문구로).
// 지연 조각(사이보그·유닛 화면) 안에서만 쓴다.
import type { ClientMessageOf, ItemResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type ItemCommand =
  | Omit<ClientMessageOf<"item_equip">, "id">
  | Omit<ClientMessageOf<"item_unequip">, "id">
  | Omit<ClientMessageOf<"item_use">, "id">
  | Omit<ClientMessageOf<"dev_grant_item">, "id">;

/** 기기 쪽 실패(서버 코드 밖): 연결 끊김·답 없음 */
export type ItemFailureCode = ItemResultCode | "offline" | "timeout";

export type ItemCommandOutcome =
  | {
      readonly ok: true;
      /** dev_grant_item이면 받은 칸 ID들 */
      readonly holdings?: readonly number[];
      /** item_use면 굴린 효과량 */
      readonly effects?: readonly { readonly effect: string; readonly amount: number }[];
    }
  | {
      readonly ok: false;
      readonly code: ItemFailureCode;
      /** confirm_replace면 사라질 효과 */
      readonly effects?: readonly string[];
      /** cooldown이면 다시 쓸 수 있는 시각(서버 ms) */
      readonly readyAt?: number;
    };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 명령 하나를 보내고 결과를 기다린다 */
export function sendItemCommand(
  command: ItemCommand,
  link: ServerLink = serverLink,
  timeoutMs: number = TIMEOUT_MS,
): Promise<ItemCommandOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: ItemCommandOutcome): void => {
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
      else if (event.kind === "message" && event.message.t === "item_result" && event.message.id === id) {
        const message = event.message;
        if (message.ok)
          finish({
            ok: true,
            ...(message.holdings === undefined ? {} : { holdings: message.holdings }),
            ...(message.effects === undefined ? {} : { effects: message.effects }),
          });
        else
          finish({
            ok: false,
            code: message.code,
            ...(message.effects === undefined ? {} : { effects: message.effects }),
            ...(message.readyAt === undefined ? {} : { readyAt: message.readyAt }),
          });
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), timeoutMs);
    trySend();
  });
}
