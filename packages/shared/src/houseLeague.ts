// 가문 연맹 조회 모양(tRPC factionIdentity.leagues) — league-2, 사용자 결정 D-590(질문 2501 다·2502 다·2503 가·2504 나).
// docs/adr/2026-11-21-npc-needs-drives.md "바뀜 (league-2, D-590)". 바꾸는 명령(만들기·신청·초대·승인·거절·나가기·위임·투표·조항 카드)은 WebSocket
// house_league다(@terra/protocol league.ts). 이 파일은 조회 모양만 둔다. 가문 열쇠 = p:<세력 행>·n:<NPC 가문 ID>.

/** 가문 하나(이름이 없으면 null — 화면이 열쇠로 대신 부른다) */
export interface HouseLeagueHouse {
  readonly key: string;
  readonly name: string | null;
  readonly npc: boolean;
}

/** 연맹 하나 */
export interface HouseLeagueView {
  readonly id: number;
  readonly founder: string;
  readonly representative: string;
  readonly createdAtMs: number;
  /** 든 가문(든 차례 — 첫째가 가장 오래 든 가문) */
  readonly members: readonly HouseLeagueHouse[];
  /** 붙은 조항 카드(@terra/protocol HOUSE_LEAGUE_CLAUSES 가운데) */
  readonly clauses: readonly string[];
  /** 초대(invite — 대표가 불렀다)·신청(apply — 그 가문이 냈다) */
  readonly requests: readonly { readonly house: HouseLeagueHouse; readonly kind: "invite" | "apply" }[];
  /** 열린 대표 투표(투표한 가문 → 찍은 가문) */
  readonly votes: readonly { readonly voter: string; readonly candidate: string }[];
}

/** factionIdentity.leagues 응답 */
export interface HouseLeaguesResponse {
  /** 보는 사람의 가문(없으면 null)·가문장인가 */
  readonly me: { readonly house: string; readonly leader: boolean } | null;
  readonly leagues: readonly HouseLeagueView[];
  /** 대표가 부를 수 있는 플레이어 가문(해산하지 않은 것, 최근 것부터 상한까지) */
  readonly houses: readonly HouseLeagueHouse[];
  /** 요금 할인 카드(fee_discount)의 깎는 몫(‰ — 설정 칸) */
  readonly feeDiscountPm: number;
}
