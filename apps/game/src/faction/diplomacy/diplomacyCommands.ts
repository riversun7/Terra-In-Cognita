// 조약 명령(WebSocket dip_propose·dip_counter·dip_respond·dip_war_request·dip_war_respond → dip_result, docs/adr/2026-11-21-diplomacy-treaties.md)과 조회(tRPC diplomacy.view).
// 게임 상태를 바꾸는 명령은 WebSocket으로만 보낸다. 보내고 같은 요청 번호의 답을 기다리는 틀은 의결 명령(governanceCommands.ts)과 같다.
import type { DiplomacyAction, DiplomacyResultCode } from "@terra/protocol";
import type { DiplomacyResponse, TreatyClauseKind } from "@terra/shared/treaty";
import { api } from "../../net/api.ts";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";
import { type QueryResult, SCREEN_QUERY_TIMEOUT_MS, queryFailure } from "../../sections/queryStore.ts";
import { request } from "../identity/houseCommands.ts";

export type DiplomacyOutcome =
  | { readonly ok: true; readonly action: DiplomacyAction; readonly ref: number }
  | { readonly ok: false; readonly code: DiplomacyResultCode | "offline" | "timeout" };

/** 조항 하나(보내는 나라 기준 — 보호하는 쪽 us | them) */
export interface ClauseDraft {
  readonly kind: TreatyClauseKind;
  readonly protector?: "us" | "them";
  readonly tributePm?: number;
}

export type DiplomacyRequest =
  | {
      readonly t: "dip_propose";
      readonly targetNationId: number;
      readonly clauses: ClauseDraft[];
      readonly days: number;
    }
  | {
      readonly t: "dip_counter";
      readonly treatyId: number;
      readonly clauses: ClauseDraft[];
      readonly days: number;
    }
  | { readonly t: "dip_respond"; readonly treatyId: number; readonly accept: boolean }
  | { readonly t: "dip_war_request"; readonly treatyId: number; readonly enemyNationId: number }
  | { readonly t: "dip_war_respond"; readonly requestId: number; readonly accept: boolean };

/** 조약 명령 하나를 보내고 결과를 기다린다 */
export function sendDiplomacy(
  body: DiplomacyRequest,
  link: ServerLink = serverLink,
): Promise<DiplomacyOutcome> {
  return request<DiplomacyOutcome>(
    link,
    (id) => ({ ...body, id }),
    (message, id) => {
      if (message.t !== "dip_result" || message.id !== id) return null;
      return message.ok
        ? { ok: true, action: message.action, ref: message.ref }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}

/** 내 나라 조약·참전 요청·제안 상대 */
export async function loadDiplomacy(): Promise<QueryResult<DiplomacyResponse>> {
  try {
    const data = await api.diplomacy.view.query(undefined, {
      signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS),
    });
    return { ok: true, data };
  } catch (error) {
    return queryFailure(error);
  }
}
