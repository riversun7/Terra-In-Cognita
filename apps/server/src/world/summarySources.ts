// 복귀 요약 자료 — 사건 출처(S3 오프라인 정산의 생산)와 마지막 확인 시각(summary_acks). ADR 37 8절, S3 ADR 4절
// - 생산 칸: 마지막 확인 뒤 그 사용자 주체의 시험 자원 산출 원장 항목 합. 읽기 전에 그 주체를 지금까지 정산하고 쓰기 대기열이
//   비기를 기다린다(DB가 메모리를 따라잡은 뒤 센다).
// - 확인 시각은 월드 상태가 아니라 화면 확인 기록이라 쓰기 대기열을 거치지 않고 바로 쓴다.
// - 거래 칸(질문 538 다, docs/adr/2026-11-07-play-flow.md WP6): 마지막 확인 뒤 내 걸린 거래소 주문이 남과 체결된 수(내가 걸어 둔 쪽 = maker),
//   만료된 내 주문 수, 회차가 끝나 체결된 내 환전 주문 수. 실시간 체결 알림(market_fill)은 거래창을 연 동안 그대로 가고, 없는 동안 체결된 것은
//   돌아와서 이 칸으로 본다(D-6014 복귀 요약과 같은 흐름). 숫자를 누르면 내 주문 화면.
import type { SummaryBackend, SummarySource } from "../summary/summary.ts";
import { ASSET_ORE } from "./settlement.ts";
import type { World } from "./world.ts";

function productionSource(world: World): SummarySource {
  return {
    kind: "production",
    async collect(account, since, until) {
      const empty = { kind: "production", count: 0, params: {}, target: null };
      const persistence = world.persistence;
      if (!persistence) return empty;
      const ownerId = persistence.settlement.findOwnerOfUser(account.userId);
      if (ownerId === undefined) return empty;
      persistence.settlement.settleOwner(ownerId, until);
      await persistence.writer.durable();
      const result = await persistence.pool.query(
        `select coalesce(sum(e.amount), 0) as n from ledger_entries e
           join ledger_transactions t on t.id = e.tx_id
           join ledger_accounts a on a.id = e.account_id
         where a.owner_id = $1 and a.asset = $2 and t.kind = 'job_output' and t.at_ms > $3 and t.at_ms <= $4`,
        [ownerId, ASSET_ORE, since ?? -1, until],
      );
      const count = Number(result.rows[0]?.n ?? 0);
      return { kind: "production", count, params: {}, target: { route: "economy" } };
    },
  };
}

function marketSource(world: World): SummarySource {
  return {
    kind: "market",
    async collect(account, since, until) {
      const empty = { kind: "market", count: 0, params: {}, target: null };
      const persistence = world.persistence;
      if (!persistence) return empty;
      const ownerId = persistence.settlement.findOwnerOfUser(account.userId);
      if (ownerId === undefined) return empty;
      await persistence.writer.durable();
      const result = await persistence.pool.query(
        `select
           (select count(*) from market_trades where maker_owner_id = $1 and at_ms > $2 and at_ms <= $3) as filled,
           (select count(*) from market_orders where owner_id = $1 and state = 'expired'
              and done_at_ms > $2 and done_at_ms <= $3) as expired,
           (select count(*) from fx_orders where owner_id = $1 and state = 'done' and filled_lots > 0
              and done_at_ms > $2 and done_at_ms <= $3) as fx`,
        [ownerId, since ?? -1, until],
      );
      const row = result.rows[0] ?? {};
      const filled = Number(row.filled ?? 0);
      const expired = Number(row.expired ?? 0);
      const fx = Number(row.fx ?? 0);
      return {
        kind: "market",
        count: filled + expired + fx,
        params: { filled, expired, fx },
        target: { route: "economy_orders" },
      };
    },
  };
}

export function createWorldSummaryBackend(world: World): SummaryBackend {
  return {
    sources: [productionSource(world), marketSource(world)],
    async lastAck(userId) {
      const pool = world.persistence?.pool;
      if (!pool) return null;
      const result = await pool.query(`select acked_at_ms from summary_acks where user_id = $1`, [userId]);
      const value = result.rows[0]?.acked_at_ms;
      return value === undefined || value === null ? null : Number(value);
    },
    async ack(userId, untilMs, nowMs) {
      const pool = world.persistence?.pool;
      if (!pool) return;
      await pool.query(
        `insert into summary_acks (user_id, acked_at_ms) values ($1, $2)
         on conflict (user_id) do update set acked_at_ms = greatest(summary_acks.acked_at_ms, excluded.acked_at_ms)`,
        [userId, Math.min(untilMs, nowMs)],
      );
    },
  };
}
