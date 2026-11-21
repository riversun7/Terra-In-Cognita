// 사는 곳(거주지) 자료 — 조회(tRPC gather.residence)·고르기 명령(WebSocket residence_set, 줄기 판 99)·문구. 사용자 답 D-585 1(사는 곳은 하나만 고른다 — 그 집이 선
// 도시·나라의 주민이 되고 주민세·신용이 그곳을 따른다). 건물 판(ResidenceCard.tsx)이 쓴다. 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS.md 4장).
// 명령 틀은 나라 세금 명령(government/nationTaxCommands.ts)과 같다: 인사 전이면 기다렸다 보내고, 끊기면 "offline", TIMEOUT_MS 안에 답이 없으면 "timeout".
import type { ResidenceResultCode } from "@terra/protocol";
import type { ResidenceBlock, ResidenceResponse } from "@terra/shared/residence";
import { api } from "../../net/api.ts";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";
import { m } from "../../paraglide/messages.js";

const REQUEST_TIMEOUT_MS = 10_000;
const TIMEOUT_MS = 15_000;

/** 내 유닛의 사는 곳과 이 건물을 고를 수 있나 */
export function loadResidence(
  unitId: number,
  buildingId: number,
  signal?: AbortSignal,
): Promise<ResidenceResponse> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return api.gather.residence.query(
    { unitId, buildingId },
    { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
  );
}

export type ResidenceOutcome =
  | { readonly ok: true; readonly buildingId: number | null; readonly cityId: number | null }
  | { readonly ok: false; readonly code: ResidenceResultCode | "offline" | "timeout" };

const noop = (): void => {};

function randomU32(): number {
  const one = new Uint32Array(1);
  crypto.getRandomValues(one);
  return one[0] ?? 0;
}

let nextId = randomU32();

/** 사는 곳 고르기를 보내고 결과를 기다린다(buildingId null = 고른 것 풀기) */
export function sendResidence(
  unitId: number,
  buildingId: number | null,
  link: ServerLink = serverLink,
): Promise<ResidenceOutcome> {
  const id = nextId >>> 0;
  nextId = (nextId + 1) >>> 0;
  return new Promise((resolve) => {
    let sent = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stop: () => void = noop;
    const finish = (outcome: ResidenceOutcome): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      resolve(outcome);
    };
    const trySend = (): void => {
      if (sent || !link.isReady()) return;
      sent = link.send({ t: "residence_set", id, unitId, buildingId });
    };
    stop = link.listen((event) => {
      if (event.kind === "ready") trySend();
      else if (event.kind === "down" && sent) finish({ ok: false, code: "offline" });
      else if (
        event.kind === "message" &&
        event.message.t === "residence_result" &&
        event.message.id === id
      ) {
        const message = event.message;
        finish(
          message.ok
            ? { ok: true, buildingId: message.buildingId, cityId: message.cityId }
            : { ok: false, code: message.code },
        );
      }
    });
    timer = setTimeout(() => finish({ ok: false, code: sent ? "timeout" : "offline" }), TIMEOUT_MS);
    trySend();
  });
}

/** 고를 수 없는 까닭 → 문구 */
export function residenceBlockText(block: ResidenceBlock): string {
  switch (block) {
    case "not_housing":
      return m.residence_block_not_housing();
    case "no_city":
      return m.residence_block_no_city();
    case "not_eligible":
      return m.residence_block_not_eligible();
    case "unknown_building":
      return m.residence_block_unknown_building();
    default: {
      const unknown: never = block;
      return unknown;
    }
  }
}

/** 명령 실패 코드 → 문구 */
export function residenceErrorText(code: ResidenceResultCode | "offline" | "timeout"): string {
  switch (code) {
    case "not_housing":
    case "no_city":
    case "not_eligible":
    case "unknown_building":
      return residenceBlockText(code);
    case "unknown_unit":
      return m.residence_error_unit();
    case "unchanged":
      return m.residence_unchanged();
    case "sign_in_required":
      return m.residence_error_sign_in();
    case "busy":
    case "rate_limited":
    case "internal_error":
    case "offline":
    case "timeout":
      return m.residence_error_retry();
    default: {
      const unknown: never = code;
      return unknown;
    }
  }
}

/** 지금 사는 곳 한 줄(이 건물 기준) */
export function residenceLine(response: ResidenceResponse, buildingId: number, unit: string): string {
  const current = response.current;
  if (!current) return m.residence_none({ unit });
  if (current.buildingId === buildingId)
    return current.source === "chosen"
      ? m.residence_here_chosen({ unit })
      : m.residence_here_lodging({ unit });
  return current.source === "chosen"
    ? m.residence_elsewhere_chosen({ unit })
    : m.residence_elsewhere_lodging({ unit });
}
