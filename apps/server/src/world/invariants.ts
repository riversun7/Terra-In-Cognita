// 불변 조건 검사 — docs/adr/2026-10-31-s3-server-stage.md 2절 표(I1~I8, 전투 없는 S3 범위)
// 부팅 뒤(world.ts), 시험, 관리 명령(`node dist/cli.js check-world`, DB 몫만)에서 부른다. 위반은 문장 목록으로 돌려준다.
import type { QueryPool } from "./persist/load.ts";

/** 메모리에서만 볼 수 있는 몫(I5·I7)과 부팅 복구가 놓지 못한 것 */
export interface MemoryChecks {
  /** 예약이 없는 봇(경로를 기다리는 봇은 뺀다) — I5 */
  missingEvents: number;
  /** 몸이 건물 칸에 걸친 서 있는 유닛 — I7 */
  unitsInBuildings: number;
  /** 부팅 때 다시 놓지 못한 유닛(경로가 틀림·ID 겹침) */
  badUnits: number;
  /** 부팅 때 다시 놓지 못한 건물(겹침·밖) — I7 */
  badBuildings: number;
}

export function checkMemoryInvariants(checks: MemoryChecks): string[] {
  const problems: string[] = [];
  if (checks.missingEvents > 0) problems.push(`I5 bots without a scheduled event: ${checks.missingEvents}`);
  if (checks.unitsInBuildings > 0)
    problems.push(`I7 standing units inside buildings: ${checks.unitsInBuildings}`);
  if (checks.badUnits > 0) problems.push(`restore: units not placed: ${checks.badUnits}`);
  if (checks.badBuildings > 0) problems.push(`I7 restore: buildings not placed: ${checks.badBuildings}`);
  return problems;
}

/** DB 몫: 원장 균형·잔고(I1~I3), 정산 시각(I6) */
export async function checkSqlInvariants(pool: QueryPool, nowMs: number): Promise<string[]> {
  const problems: string[] = [];
  const count = async (label: string, text: string, values: unknown[] = []): Promise<void> => {
    const result = await pool.query(`select count(*) as n from (${text}) as t`, values);
    const n = Number(result.rows[0]?.n ?? 0);
    if (n > 0) problems.push(`${label}: ${n}`);
  };
  await count(
    "I1 assets whose entries do not sum to zero",
    `select a.asset from ledger_entries e join ledger_accounts a on a.id = e.account_id
     group by a.asset having sum(e.amount) <> 0`,
  );
  await count(
    "I1 transactions not balanced per asset",
    `select e.tx_id, a.asset from ledger_entries e join ledger_accounts a on a.id = e.account_id
     group by e.tx_id, a.asset having sum(e.amount) <> 0`,
  );
  await count(
    "I2 accounts whose balance differs from their entries",
    `select a.id from ledger_accounts a left join ledger_entries e on e.account_id = a.id
     group by a.id, a.balance having a.balance <> coalesce(sum(e.amount), 0)`,
  );
  await count(
    "I2 owner accounts below zero",
    `select id from ledger_accounts where system_code is null and balance < 0`,
  );
  await count("I6 owners settled in the future", `select id from world_owners where settled_at_ms > $1`, [
    nowMs + 60_000,
  ]);
  return problems;
}
