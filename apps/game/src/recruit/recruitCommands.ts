// 구인 카드 고용 명령(WebSocket, 프로토콜 7) — recruit_hire를 보내고 같은 요청 번호의 recruit_result를 기다린다.
// 기획 D-469, docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)". 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// 사이보그 만들기 명령(start/cyborgCommands.ts)과 같은 틀이다:
// - 연결이 아직 인사 전이면 인사가 끝날 때까지 기다렸다 보낸다. 기다림·답 모두 TIMEOUT_MS 안.
// - 끊기면(down) 기다리던 명령은 "offline"으로 끝난다. 서버가 받았는지 모르므로 화면은 카드 목록을 다시 받아 확인한다.
// 지연 조각(경제 → 생산의 구인 칸, 구인 카드 시험 화면) 안에서만 쓴다. 두 조각이 같이 쓰므로 개발자 소스 폴더(src/editor/) 밖에 둔다
// (docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산").
import type { ClientMessageOf, RecruitResultCode } from "@terra/protocol";
import { m } from "../paraglide/messages.js";
import { type ServerLink, serverLink } from "../net/serverLink.ts";

export type RecruitHireCommand = Omit<ClientMessageOf<"recruit_hire">, "id" | "t">;

export type RecruitHireOutcome =
  | { readonly ok: true; readonly unitId: number }
  | { readonly ok: false; readonly code: RecruitResultCode | "offline" | "timeout" };

const TIMEOUT_MS = 15_000;

/** 고용 결과 문구(경제 구인 칸·개발자 구인 화면이 같이 쓴다) */
export const RECRUIT_RESULT_TEXT: Readonly<Record<RecruitResultCode | "offline" | "timeout", () => string>> =
  {
    sign_in_required: m.dev_recruit_err_sign_in,
    busy: m.dev_recruit_err_busy,
    rate_limited: m.dev_recruit_err_rate_limited,
    no_cyborg: m.dev_recruit_err_no_cyborg,
    unknown_city: m.dev_recruit_err_unknown_city,
    cards_changed: m.dev_recruit_err_cards_changed,
    taken: m.dev_recruit_err_taken,
    insufficient_funds: m.dev_recruit_err_funds,
    no_room: m.dev_recruit_err_no_room,
    internal_error: m.dev_recruit_err_internal,
    no_house: m.recruit_err_no_house,
    offline: m.dev_recruit_err_offline,
    timeout: m.dev_recruit_err_timeout,
  };

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 카드 한 장을 고용하고 결과를 기다린다 */
export function sendRecruitHire(
  command: RecruitHireCommand,
  link: ServerLink = serverLink,
): Promise<RecruitHireOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: RecruitHireOutcome): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(outcome);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send({ t: "recruit_hire", ...command, id });
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish({ ok: false, code: "offline" });
      else if (event.kind === "message" && event.message.t === "recruit_result" && event.message.id === id) {
        const message = event.message;
        finish(message.ok ? { ok: true, unitId: message.unitId } : { ok: false, code: message.code });
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}
