// 불변 조건 검사 — docs/adr/2026-10-31-s3-server-stage.md 2절 표(I1~I8), 전투 결과 I9~I12(docs/adr/2026-10-31-combat-core.md 8절),
// 사이보그 본체 I13(docs/adr/2026-11-01-first-login-cyborg.md 2절), 노동 계약 에스크로 I14(docs/adr/2026-11-03-labor-contracts.md)
// 부팅 뒤(world.ts), 시험, 관리 명령(`node dist/cli.js check-world`, DB 몫만)에서 부른다. 위반은 문장 목록으로 돌려준다.
import {
  INVARIANT_I1_ASSETS,
  INVARIANT_I1_TRANSACTIONS,
  INVARIANT_I2_BALANCE,
  INVARIANT_I2_NEGATIVE,
  INVARIANT_LABOR_ESCROW,
} from "@terra/sim";
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

/** DB 몫: 원장 균형·잔고(I1~I3), 정산 시각(I6). 문구는 시뮬레이터의 메모리 감사(@terra/sim createLedgerAudit)와 같다 */
export async function checkSqlInvariants(pool: QueryPool, nowMs: number): Promise<string[]> {
  const problems: string[] = [];
  const count = async (label: string, text: string, values: unknown[] = []): Promise<void> => {
    const result = await pool.query(`select count(*) as n from (${text}) as t`, values);
    const n = Number(result.rows[0]?.n ?? 0);
    if (n > 0) problems.push(`${label}: ${n}`);
  };
  await count(
    INVARIANT_I1_ASSETS,
    `select a.asset from ledger_entries e join ledger_accounts a on a.id = e.account_id
     group by a.asset having sum(e.amount) <> 0`,
  );
  await count(
    INVARIANT_I1_TRANSACTIONS,
    `select e.tx_id, a.asset from ledger_entries e join ledger_accounts a on a.id = e.account_id
     group by e.tx_id, a.asset having sum(e.amount) <> 0`,
  );
  await count(
    INVARIANT_I2_BALANCE,
    `select a.id from ledger_accounts a left join ledger_entries e on e.account_id = a.id
     group by a.id, a.balance having a.balance <> coalesce(sum(e.amount), 0)`,
  );
  await count(
    INVARIANT_I2_NEGATIVE,
    `select id from ledger_accounts where system_code is null and balance < 0`,
  );
  await count("I6 owners settled in the future", `select id from world_owners where settled_at_ms > $1`, [
    nowMs + 60_000,
  ]);
  // 전투 결과(docs/adr/2026-10-31-combat-core.md 8절): 상태가 맞고, 결과는 한 번만, 화물은 있는 유닛에만
  await count(
    "I9 prisoners held by themselves",
    `select id from world_units where held_by is not null and held_by = owner_id`,
  );
  await count(
    "I10 injuries without a heal time",
    `select id from world_units where injury not between 0 and 3 or (injury = 0) <> (injury_until_ms is null)`,
  );
  await count(
    "I11 ended battles without a result record",
    `select b.id from world_battles b where b.status = 'ended'
     and not exists (select 1 from world_battle_results r where r.battle_id = b.id)`,
  );
  // 수명이 다해 떠난 유닛(D-099·D-516)의 화물은 소유자에게 옮기고 빈 계정만 남는다(원장 계정은 지우지 않는다) → 잔고가 있는 것만 센다
  await count(
    "I12 cargo on missing units",
    `select a.id from ledger_accounts a where a.location < 0 and a.balance <> 0
     and not exists (select 1 from world_units u where u.id = -a.location)`,
  );
  // 노동 계약(docs/adr/2026-11-03-labor-contracts.md): 보증금 에스크로 = 열린 임금형 계약의 보증금(끝났거나 임대형이면 0),
  // 계약 없는 에스크로는 비어 있다. 문구는 시뮬 메모리 검사(@terra/sim checkLaborEscrow)와 같다
  await count(
    INVARIANT_LABOR_ESCROW,
    `select c.id from labor_contracts c left join ledger_accounts a on a.system_code = 'escrow:labor:' || c.id
     where coalesce(a.balance, 0) <> case when c.kind = 'wage' and c.state in ('active', 'paused') then c.deposit else 0 end
     union all
     select -a.id from ledger_accounts a where a.system_code like 'escrow:labor:%' and a.balance <> 0
     and not exists (select 1 from labor_contracts c where a.system_code = 'escrow:labor:' || c.id)`,
  );
  // 사이보그(docs/adr/2026-11-01-first-login-cyborg.md 2절): 본체 유닛이 그 사용자의 것으로 있다(없으면 부팅이 다시 놓는다)
  await count(
    "I13 cyborgs without their body unit",
    `select c.user_id from cyborgs c where c.unit_id is null or not exists (
       select 1 from world_units u join world_owners o on o.id = u.owner_id
       where u.id = c.unit_id and u.kind = 3 and o.user_id = c.user_id)`,
  );
  return problems;
}
