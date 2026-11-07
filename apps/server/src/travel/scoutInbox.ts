// 처리할 일 "정찰을 마쳤습니다"(scout_returned) 제공 함수 — 기획 답 612 나("정찰이 목표를 보고 돌아설 때 처리할 일 하나 — 들어가기"),
// docs/adr/2026-11-07-play-flow.md "WP13 이동 3".
// - 정찰 길마다 한 줄: 정찰이 목표 2차맵에 닿아 돌아서는 순간부터(돌아오는 중) 돌아온 뒤 이동 서비스가 끝난 길을 보이는 동안(RECENT_MS)까지.
//   누르면 본 2차맵의 지도(?key=)로 간다 — 탐사 기록이 남아 그 2차맵을 볼 수 있다(U3).
// - 요청 때 이동 서비스 메모리(list)에서 만든다(서버가 들고 있지 않는다, 처리함 등록부 원칙). 확인(inbox.ack)이 아직 없어 돌아온 뒤 시간이 지나면
//   스스로 사라진다(확인 대기 질문 703). 분류는 "제안·결정"(들어가 볼지 고른다 — 완료 분류는 확인 저장이 먼저 있어야 한다).
import type { InboxEntry, InboxProvider } from "../inbox/types.ts";
import type { TravelService } from "./service.ts";

export function createScoutInboxProvider(
  travel: () => Pick<TravelService, "list"> | undefined,
): InboxProvider {
  return {
    kind: "scout_returned",
    async collect(account) {
      const service = travel();
      if (!service) return [];
      const entries: InboxEntry[] = [];
      for (const view of service.list(account.userId)) {
        if (view.kind !== "scout" || view.scoutedMapKey === null) continue;
        entries.push({
          kind: "scout_returned",
          key: `u${view.unitId}_${view.startedAt}`,
          deadlineAt: null,
          firstSeenAt: view.startedAt,
          params: {},
          target: { route: "map", search: { key: String(view.scoutedMapKey) } },
        });
      }
      return entries;
    },
  };
}
