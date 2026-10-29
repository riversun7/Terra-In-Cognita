// 홈 서버 카드 상태 — dashboard.cards(ADR 2026-10-29-app-shell 6절, D-6001). 카드는 사이보그·보유 유닛·자산·세력 4장이다.
// 카드마다 not_ready(그 시스템이 아직 없음) | empty | ready(카드별 자료)다. 지금은 제공 함수가 없어 모두 not_ready다.
// - 시스템을 만들 때 그 시스템이 자기 카드 제공 함수를 시스템 모듈에 두고 createServerCardProviders에 한 줄 더한다.
//   ready 자료의 모양은 그때 @terra/shared/dashboard ServerCardData에 정한다(금액은 최소 단위 정수 문자열, PLAN 4.7).
//   기능 플래그(PLAN 4.2)가 생기면 꺼진 시스템의 카드는 not_ready로 둔다.
// - 시안 자료(preview)에서도 이 네 카드는 "준비 중"이다(사용자 결정 2). 그래서 이 파일은 preview를 받지 않는다.
// - 홈에 있는 카드 ID를 그대로 받는다. 모르는 ID·기기 카드(처리할 일·지도 등)는 빼고 답한다.
import {
  type CardState,
  type DashboardCardsResponse,
  HOME_CARDS,
  type ServerCardId,
  isCardId,
} from "@terra/shared/dashboard";
import type { InboxAccount } from "../inbox/types.ts";

/** 카드 제공 함수 — 그 계정의 지금 상태로 카드 하나의 상태를 만든다(요청 때 부른다) */
export interface ServerCardProvider {
  readonly id: ServerCardId;
  load(account: InboxAccount, now: number): Promise<CardState>;
}

/** 서버가 쓰는 카드 제공 함수들. 지금은 0개다 */
export function createServerCardProviders(): readonly ServerCardProvider[] {
  return [];
}

function isServerCardId(value: string): value is ServerCardId {
  return isCardId(value) && HOME_CARDS[value].source === "server";
}

/** 요청한 ID 중 서버 카드만, 요청 순서대로, 겹침 없이 */
export function serverCardIds(ids: readonly string[]): ServerCardId[] {
  const result: ServerCardId[] = [];
  for (const id of ids) {
    if (isServerCardId(id) && !result.includes(id)) result.push(id);
  }
  return result;
}

/** dashboard.cards 응답. 제공 함수가 없는 카드는 not_ready */
export async function loadDashboardCards(
  providers: readonly ServerCardProvider[],
  ids: readonly string[],
  account: InboxAccount,
  now: number,
): Promise<DashboardCardsResponse> {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const cards = await Promise.all(
    serverCardIds(ids).map(async (id): Promise<CardState> => {
      const provider = byId.get(id);
      if (!provider) return { id, status: "not_ready" };
      const state = await provider.load(account, now);
      if (state.id !== id) throw new Error(`card provider ${id} returned a state of ${state.id}`);
      return state;
    }),
  );
  return { cards };
}
