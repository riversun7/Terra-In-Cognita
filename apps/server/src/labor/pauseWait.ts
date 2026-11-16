// 멈춘 노동 계약 [기다림](WebSocket labor_wait, 프로토콜 54) — 기획 대조 2237: D-6006 "처리할 일은 서버가 계정마다 보낸다"·D-6011 "처리함에는 늘
// 모든 항목"(기기마다 다르게 보이지 않는다), D-573 2045 "기다릴지 해지하고 다른곳으로 갈지 정함". 예전에는 그 기기 브라우저 저장소에만 접었다.
// - 계약 상태는 바꾸지 않는다(이미 일시 중지 — 사업장에 수익이 나면 다시 일한다). 그 멈춤 회차(next_due_ms = 처리할 일의 처음 생긴 시각)에
//   "기다림" 표시(labor_contracts.paused_waited_due_ms)를 남긴다. 처리할 일 제공 함수(pausedInbox.ts)가 표시가 같은 줄을 뺀다.
// - 처리할 일과 같은 원천(DB)을 읽고 쓴다: 처리할 일은 요청 때 DB에서 읽으므로(쓰기 대기열이 몇 초 늦을 수 있다) 같은 줄을 본다. 그 사이 메모리에서
//   다시 돌기 시작했으면 지난 회차에 표시만 남는다(다음 멈춤은 next_due_ms가 달라 다시 보인다 — 해가 없다).
// - 이 열은 월드 쓰기 대기열 열 목록에 없다(대기열 upsert가 덮지 않는다). 그래서 여기서 DB에 바로 쓴다.
// - 누가: 그 계약 일꾼 유닛의 주인(worker_owner_id의 계정)만. 다른 사람이면 forbidden, 없으면 unknown_contract, 그 회차가 아니면(다시 돎·해지·
//   다른 회차) not_open.
import type { LaborResultCode } from "@terra/protocol";
import type { QueryPool } from "../world/persist/load.ts";

export type LaborWaitResult = { readonly ok: true } | { readonly ok: false; readonly code: LaborResultCode };

export async function waitPausedContract(
  pool: QueryPool,
  input: { readonly userId: string; readonly contractId: number; readonly dueAt: number },
): Promise<LaborWaitResult> {
  const marked = await pool.query(
    `update labor_contracts c set paused_waited_due_ms = c.next_due_ms
       from world_owners o
      where c.id = $2 and o.id = c.worker_owner_id and o.user_id = $1
        and c.kind = 'wage' and c.state = 'paused' and c.next_due_ms = $3
      returning c.id`,
    [input.userId, input.contractId, input.dueAt],
  );
  if (marked.rows.length > 0) return { ok: true };
  // 왜 못 했나(없음·남의 것·그 회차가 아님)
  const found = await pool.query(
    `select o.user_id from labor_contracts c left join world_owners o on o.id = c.worker_owner_id where c.id = $1`,
    [input.contractId],
  );
  const row = found.rows[0];
  if (!row) return { ok: false, code: "unknown_contract" };
  if (row.user_id !== input.userId) return { ok: false, code: "forbidden" };
  return { ok: false, code: "not_open" };
}
