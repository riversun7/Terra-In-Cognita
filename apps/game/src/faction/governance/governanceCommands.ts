// 나라 의결 명령(WebSocket gov_propose·gov_vote·gov_candidate·gov_coup·gov_coup_join → gov_result, docs/adr/2026-11-21-governance.md)과 조회(tRPC governance.view).
// 게임 상태를 바꾸는 명령은 WebSocket으로만 보낸다. 보내고 같은 요청 번호의 답을 기다리는 틀은 가문 명령(houseCommands.ts request)과 같다.
import type { GovernanceAction, GovernanceResultCode } from "@terra/protocol";
import type { AgendaKind, GovernanceRegime, GovernanceResponse } from "@terra/shared/governance";
import { api } from "../../net/api.ts";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";
import { type QueryResult, SCREEN_QUERY_TIMEOUT_MS, queryFailure } from "../../sections/queryStore.ts";
import { request } from "../identity/houseCommands.ts";

export type GovernanceOutcome =
  | { readonly ok: true; readonly agendaId: number; readonly action: GovernanceAction }
  | { readonly ok: false; readonly code: GovernanceResultCode | "offline" | "timeout" };

export type GovernanceRequest =
  | {
      readonly t: "gov_propose";
      readonly kind: AgendaKind;
      readonly regime?: GovernanceRegime;
      readonly targetNationId?: number;
      /** 국고 지분 팔기(질문 2438 답 D-583 — 정부 지분 시장 칸 shares/CityShareMarket.tsx) */
      readonly cityId?: number;
      readonly shares?: string;
      readonly minPrice?: string;
    }
  | { readonly t: "gov_vote"; readonly agendaId: number; readonly choice: string }
  | { readonly t: "gov_candidate"; readonly agendaId: number }
  /** cityId = 쿠데타를 일으킬 도시(줄기 gov-coup — D-588 2492 가, 없으면 서버가 가문 자리 도시 → 수도) */
  | { readonly t: "gov_coup"; readonly cityId?: number }
  | { readonly t: "gov_coup_join"; readonly coupId: number; readonly side: "rebel" | "government" };

/** 의결 명령 하나를 보내고 결과를 기다린다 */
export function sendGovernance(
  body: GovernanceRequest,
  link: ServerLink = serverLink,
): Promise<GovernanceOutcome> {
  return request<GovernanceOutcome>(
    link,
    (id) => ({ ...body, id }),
    (message, id) => {
      if (message.t !== "gov_result" || message.id !== id) return null;
      return message.ok
        ? { ok: true, agendaId: message.agendaId, action: message.action }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}

/** 내 나라 의결 판(지배 가문·임기·안건·내 자격) */
export async function loadGovernance(): Promise<QueryResult<GovernanceResponse>> {
  try {
    const data = await api.governance.view.query(undefined, {
      signal: AbortSignal.timeout(SCREEN_QUERY_TIMEOUT_MS),
    });
    return { ok: true, data };
  } catch (error) {
    return queryFailure(error);
  }
}
