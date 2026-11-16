// 처리할 일 "일이 멈춘 내 유닛"(labor_paused) 제공 함수 — 기획 D-573 2045(사용자 원문 "수익이나면 다시 임금정산을 할수있으니 대기 or 일꾼이 중단된 상태로
// 소유자에게 경고창이 뜨고 기다릴지 해지하고 다른곳으로 갈지 정함"), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-573)".
// 일꾼(유닛)의 소유자 = 노동 계약의 worker_owner_id. 고용한 사업장 보증금이 바닥나 일시 중지(paused)된 임금형 계약이 있으면 계정마다 한 줄로 알린다(key = labor).
// 자동 해지는 없다 — 기다리면 수익이 나 다시 채워질 때 일하고, 해지는 경제 화면 노동 계약 칸에서 한다. 마감 없음, 처음 본 시각 = 가장 이른 밀린 지급 시각.
// 요청 때 DB에서 읽는다(처리함 등록부 원칙 — 쓰기 대기열이 밀리면 몇 초 늦을 수 있다). NPC 소유자는 처리함이 없고 성향 규칙이 정한다(labor/npcWait.ts).
import type { InboxEntry, InboxProvider } from "../inbox/types.ts";
import type { QueryPool } from "../world/persist/load.ts";

export function createLaborPausedInboxProvider(pool: QueryPool): InboxProvider {
  return {
    kind: "labor_paused",
    async collect(account) {
      const found = await pool.query(
        `select c.id, c.next_due_ms as since from labor_contracts c
         join world_owners o on o.id = c.worker_owner_id
         where o.user_id = $1 and c.kind = 'wage' and c.state = 'paused'
         order by c.id`,
        [account.userId],
      );
      // 묶는 종류: 계약마다 한 건, 같은 키(labor)로 한 줄(수 = 일시 중지 계약 수)
      return found.rows.map(
        (row): InboxEntry => ({
          kind: "labor_paused",
          key: "labor",
          deadlineAt: null,
          firstSeenAt: Number(row.since ?? 0),
          params: {},
          target: { route: "economy" },
        }),
      );
    },
  };
}
