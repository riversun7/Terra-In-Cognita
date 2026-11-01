// 밸런스 화면 계산(순수 함수) — docs/adr/2026-11-01-balance-screen.md 3·4절
// - 기여: 기준 1차 + 가중치 표 → 2차 스탯(@terra/sim computeSecondary), 1차 하나씩 +10 했을 때의 차이. 가볍다(주 스레드).
// - 대결 일(DuelJob): 1차마다 "기준 + 10 vs 기준"을 두 편 차례로 반씩(runStatDuels). 무겁다 → 워커(duelWorker.ts)가 이 함수를 돈다.
//   일에는 표·계수·유닛·시드를 다 담는다(요청 시작 때 값 한 벌). DB·접근자를 모른다.
import {
  BALANCE_PLUS,
  type BalanceContributionTable,
  type BalanceDuelRow,
  type BalancePrimaries,
  balanceScorePm,
} from "@terra/shared/balance";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import {
  type CombatCoefficients,
  type DuelReport,
  type Primaries,
  type StatRow,
  type WeaponSpec,
  computeSecondary,
  runStatDuels,
} from "@terra/sim";

/** 기준 1차에서 stat 하나만 +plus */
export function plusOne(primaries: BalancePrimaries, stat: PrimaryStat, plus = BALANCE_PLUS): Primaries {
  return { ...primaries, [stat]: primaries[stat] + plus };
}

/** 표 한 벌의 기여: 2차 스탯마다 기준 값, 1차 +10 차이(화면 차례 PRIMARY_STATS), 가치 없는 1차 */
export function contributionOf(
  table: readonly StatRow[],
  primaries: BalancePrimaries,
): BalanceContributionTable {
  const base = computeSecondary(primaries, table);
  const plus = new Map(
    PRIMARY_STATS.map((stat) => [stat, computeSecondary(plusOne(primaries, stat), table)]),
  );
  const deltaOf = (stat: PrimaryStat, id: string): number => (plus.get(stat)?.[id] ?? 0) - (base[id] ?? 0);
  const stats = table.map((row) => {
    const delta = (stat: PrimaryStat) => deltaOf(stat, row.id);
    return {
      id: row.id,
      value: base[row.id] ?? 0,
      plus: {
        str: delta("str"),
        vit: delta("vit"),
        int: delta("int"),
        wis: delta("wis"),
        dex: delta("dex"),
        agi: delta("agi"),
      },
    };
  });
  const worthless = PRIMARY_STATS.filter((stat) => table.every((row) => deltaOf(stat, row.id) === 0));
  return { stats, worthless };
}

/** 대결 일 하나(워커로 보낸다: 구조화 복제가 되는 값만) */
export interface DuelJob {
  readonly tables: { readonly current: readonly StatRow[]; readonly edited: readonly StatRow[] | null };
  readonly coefficients: CombatCoefficients;
  readonly primaries: BalancePrimaries;
  readonly weapon: WeaponSpec;
  readonly count: number;
  /** 1차마다 판 수(짝수, 두 편 차례로 반씩) */
  readonly runs: number;
  readonly seed: number;
  readonly limitMs: number;
  readonly mapSize: number;
}

export interface DuelJobResult {
  readonly current: BalanceDuelRow[];
  readonly edited: BalanceDuelRow[] | null;
}

/** 두 편 차례 결과를 "기준 + 10" 쪽에서 센다(r1: 기준 + 10 = 편 1, r2: 기준 + 10 = 편 2). 시간 초과는 늘 편 2 승으로 세어져 있다 */
export function combineOrders(primary: PrimaryStat, r1: DuelReport, r2: DuelReport): BalanceDuelRow {
  const runs = r1.runs + r2.runs;
  const wins = r1.aWins + (r2.bWins - r2.timeouts);
  const losses = r1.bWins - r1.timeouts + r2.aWins;
  const timeoutWins = r1.aTimeoutLeads + r2.bTimeoutLeads;
  const timeoutLosses = r1.bTimeoutLeads + r2.aTimeoutLeads;
  const timeoutEven = r1.timeouts + r2.timeouts - timeoutWins - timeoutLosses;
  const avgMs = runs === 0 ? 0 : Math.floor((r1.avgMs * r1.runs + r2.avgMs * r2.runs) / runs);
  // r2에서는 기준 + 10이 편 2라 차를 뒤집는다
  const marginPm = runs === 0 ? 0 : Math.round((r1.shareLeadPmSum - r2.shareLeadPmSum) / runs);
  const row = { primary, runs, wins, losses, timeoutWins, timeoutLosses, timeoutEven, avgMs };
  return { ...row, scorePm: balanceScorePm(row), marginPm };
}

function duelRows(job: DuelJob, table: readonly StatRow[]): BalanceDuelRow[] {
  const half = Math.floor(job.runs / 2);
  const base = { primaries: job.primaries, weapon: job.weapon, count: job.count };
  const options = {
    table,
    runs: half,
    seed: job.seed,
    coefficients: job.coefficients,
    mapSize: job.mapSize,
    limitMs: job.limitMs,
  };
  return PRIMARY_STATS.map((stat) => {
    const plus = { ...base, primaries: plusOne(job.primaries, stat) };
    return combineOrders(stat, runStatDuels(plus, base, options), runStatDuels(base, plus, options));
  });
}

/** 대결 일을 끝까지 돈다(같은 일이면 같은 결과) */
export function runDuelJob(job: DuelJob): DuelJobResult {
  return {
    current: duelRows(job, job.tables.current),
    edited: job.tables.edited ? duelRows(job, job.tables.edited) : null,
  };
}
