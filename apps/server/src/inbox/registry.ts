// 처리할 일 등록부 — 종류마다 제공 함수(그 계정의 상태 → 건)를 두고, 요청 때 모두 불러 묶고 정렬한다(ADR 2026-10-29-app-shell 7절).
// 서버가 처리할 일을 늘 들고 있지 않는다: inbox.list 요청마다 만든다(서버 권위, D-6006 기술 전달).
// 지금 제공 함수는 0개다. 종류 표의 8종류는 모두 planned(시안 자료만)라서 실제 계정의 처리함은 늘 비어 있다.
// 새 종류를 더하는 순서(ADR 37 7절): 종류 표(@terra/shared/inbox) → 메시지 키 → 기기 inboxText.ts →
// 그 시스템 모듈에 제공 함수 + 여기 createInboxProviders에 한 줄 + 종류 표의 planned를 false로(registry.test.ts가 본다).
// 제공 함수가 실패하면 처리함 전체가 실패한다(INTERNAL_SERVER_ERROR). 위협을 빠뜨린 목록을 보이지 않으려는 것이다.
import type { InboxListResponse } from "@terra/shared/inbox";
import { orderInbox } from "./order.ts";
import { previewInboxEntries } from "./preview.ts";
import type { InboxAccount, InboxEntry, InboxProvider } from "./types.ts";

/** 서버가 쓰는 제공 함수들. 앱을 만들 때 한 번 부른다(trpc/createContext.ts → home/services.ts) */
export function createInboxProviders(): readonly InboxProvider[] {
  return [];
}

/** 제공 함수 목록 검사: 한 종류에 제공 함수는 하나다(같은 종류를 두 곳이 만들면 항목 ID가 겹친다) */
export function checkProviders(providers: readonly InboxProvider[]): void {
  const seen = new Set<string>();
  for (const provider of providers) {
    if (seen.has(provider.kind)) throw new Error(`inbox kind ${provider.kind} has two providers`);
    seen.add(provider.kind);
  }
}

/**
 * 계정의 처리할 일(inbox.list 응답). 제공 함수를 함께 부르고(Promise.all), 건을 묶고 정렬한다.
 * preview면 시안 자료를 더한다(권한은 프로시저가 먼저 본다). 제공 함수는 자기 종류의 건만 내야 한다.
 */
export async function collectInbox(
  providers: readonly InboxProvider[],
  account: InboxAccount,
  now: number,
  preview: boolean,
): Promise<InboxListResponse> {
  const lists = await Promise.all(providers.map((provider) => provider.collect(account, now)));
  const entries: InboxEntry[] = [];
  lists.forEach((list, index) => {
    const kind = providers[index]?.kind;
    for (const entry of list) {
      if (entry.kind !== kind) throw new Error(`inbox provider ${kind} returned an entry of ${entry.kind}`);
      entries.push(entry);
    }
  });
  if (preview) entries.push(...previewInboxEntries(now));
  return orderInbox(entries, now);
}
