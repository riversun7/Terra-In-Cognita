// 처리할 일 "일이 멈춘 내 유닛"(labor_paused) 제공 함수 — 기획 D-573 2045(사용자 원문 "수익이나면 다시 임금정산을 할수있으니 대기 or 일꾼이 중단된 상태로
// 소유자에게 경고창이 뜨고 기다릴지 해지하고 다른곳으로 갈지 정함"), docs/adr/2026-11-15-business-ledger.md "바뀜 (D-573)".
// 일꾼(유닛)의 소유자 = 노동 계약의 worker_owner_id. 고용한 사업장 보증금이 바닥나 일시 중지(paused)된 임금형 계약마다 한 줄(key = c<계약 ID>,
// params.contractId — 바뀜 기획 대조 2163: 줄에서 바로 [기다림]·[해지]를 고른다. 예전: 계정마다 한 줄 key = labor). 자동 해지는 없다 — 기다리면 수익이 나
// 다시 채워질 때 일한다. 마감 없음, 처음 본 시각 = 그 계약의 밀린 지급 시각(다시 돌다 또 멈추면 바뀐다 — 접은 줄이 다시 보인다).
// 바뀜(기획 대조 2237 — D-6006·D-6011): [기다림]은 계정에 저장한다(labor/pauseWait.ts가 그 멈춤 회차에 paused_waited_due_ms를 남긴다) — 표시가
// 지금 회차(next_due_ms)와 같은 줄은 내지 않는다(같은 계정의 모든 기기에서 접힘). 예전: 기기 브라우저 저장소에서만 접었다.
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
           and c.paused_waited_due_ms is distinct from c.next_due_ms
         order by c.id`,
        [account.userId],
      );
      // 계약마다 한 줄(묶지 않는 종류)
      return found.rows.map(
        (row): InboxEntry => ({
          kind: "labor_paused",
          key: `c${String(row.id)}`,
          deadlineAt: null,
          firstSeenAt: Number(row.since ?? 0),
          params: { contractId: Number(row.id) },
          target: { route: "economy" },
        }),
      );
    },
  };
}
