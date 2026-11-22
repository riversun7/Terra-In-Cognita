// 가문 연맹 명령(WebSocket house_league → house_league_result, 프로토콜 64 / 들기 절차·조항 카드 115 — league-2, 사용자 결정 D-590). 보내고 같은 요청 번호의
// 답을 기다린다(houseCommands.ts request와 같은 틀 — 인사 전이면 기다렸다 보내고, 끊기면 offline, 답이 없으면 timeout).
import type { HouseLeagueAction, HouseLeagueClause, HouseLeagueResultCode } from "@terra/protocol";
import { type ServerLink, serverLink } from "../../net/serverLink.ts";
import { request } from "./houseCommands.ts";

export type LeagueOutcome =
  | { readonly ok: true; readonly leagueId?: number | undefined; readonly pending: boolean }
  | { readonly ok: false; readonly code: HouseLeagueResultCode | "offline" | "timeout" };

/** 연맹 명령 하나(요청 번호는 여기서 붙인다) */
export interface LeagueRequest {
  readonly action: HouseLeagueAction;
  readonly leagueId?: number;
  readonly house?: string;
  readonly clause?: HouseLeagueClause;
}

export function sendHouseLeague(body: LeagueRequest, link: ServerLink = serverLink): Promise<LeagueOutcome> {
  return request<LeagueOutcome>(
    link,
    (id) => ({ t: "house_league", id, ...body }),
    (message, id) => {
      if (message.t !== "house_league_result" || message.id !== id) return null;
      return message.ok
        ? { ok: true, leagueId: message.leagueId, pending: message.pending === true }
        : { ok: false, code: message.code };
    },
    (code) => ({ ok: false, code }),
  );
}
