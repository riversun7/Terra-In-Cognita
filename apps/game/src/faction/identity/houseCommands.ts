// 가문 창설·가입 명령(WebSocket house_found → house_result, 프로토콜 22 / house_invite·house_apply·house_answer·house_withdraw·house_leave·
// house_kick → house_member_result, 프로토콜 23) — 보내고 같은 요청 번호의 답을 기다린다.
// 질문 926 나·985 다, docs/adr/2026-11-11-faction-identity.md "바뀜 (926~935 답)"·"바뀜 (981~986 답)". 게임 상태를 바꾸는 명령은 WebSocket으로만.
// 국적 바꾸기 명령(government/naturalizeCommands.ts)과 같은 틀이다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout".
import type {
  HouseMemberAction,
  HouseMemberResultCode,
  HouseResultCode,
  ServerMessage,
} from "@terra/protocol";
import { type FeatureClientMessage, type ServerLink, serverLink } from "../../net/serverLink.ts";

export type HouseOutcome =
  | { readonly ok: true; readonly factionId: number; readonly paid: string }
  | { readonly ok: false; readonly code: HouseResultCode | "offline" | "timeout" };

export type HouseMemberOutcome =
  | { readonly ok: true; readonly action: HouseMemberAction; readonly factionId: number }
  | { readonly ok: false; readonly code: HouseMemberResultCode | "offline" | "timeout" };

/** 가입 명령(요청 번호는 여기서 붙인다) */
export type HouseMemberRequest =
  | { readonly t: "house_invite"; readonly name: string }
  | { readonly t: "house_apply"; readonly factionId: number }
  | { readonly t: "house_answer"; readonly requestId: number; readonly accept: boolean }
  | { readonly t: "house_withdraw"; readonly requestId: number }
  | { readonly t: "house_leave" }
  | { readonly t: "house_kick"; readonly userId: string };

const TIMEOUT_MS = 15_000;

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 메시지 하나를 보내고 read가 값을 돌려주는 첫 답을 기다린다(끊김 = offline, 보낸 뒤 시간 넘김 = timeout) */
function request<T>(
  link: ServerLink,
  build: (id: number) => FeatureClientMessage,
  read: (message: ServerMessage, id: number) => T | null,
  lost: (code: "offline" | "timeout") => T,
): Promise<T> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: T): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(outcome);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send(build(id));
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish(lost("offline"));
      else if (event.kind === "message") {
        const outcome = read(event.message, id);
        if (outcome !== null) finish(outcome);
      }
    });
    timer = setTimeout(() => finish(lost(sent ? "timeout" : "offline")), TIMEOUT_MS);
    trySend();
  });
}

/** 창설 명령 하나를 보내고 결과를 기다린다. cost = 화면이 본 창설 비용(서버 값과 다르면 terms_changed) */
export function sendHouseFound(cost: string, link: ServerLink = serverLink): Promise<HouseOutcome> {
  return request<HouseOutcome>(
    link,
    (id) => ({ t: "house_found", id, cost }),
    (message, id) => {
      if (message.t !== "house_result" || message.id !== id) return null;
      return message.ok
        ? { ok: true, factionId: message.factionId, paid: message.paid }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}

/** 가입 명령 하나를 보내고 결과를 기다린다 */
export function sendHouseMember(
  body: HouseMemberRequest,
  link: ServerLink = serverLink,
): Promise<HouseMemberOutcome> {
  return request<HouseMemberOutcome>(
    link,
    (id) => ({ ...body, id }),
    (message, id) => {
      if (message.t !== "house_member_result" || message.id !== id) return null;
      return message.ok
        ? { ok: true, action: message.action, factionId: message.factionId }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}
