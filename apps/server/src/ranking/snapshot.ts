// 랭킹 집계(스냅숏) — docs/adr/2026-11-07-ranking.md 2·3절, 기획 20 §8.2(점수 = 앞 점수 × (1 − 감쇠) + 이번 기간 점수)·D-037·D-041.
// - 경계 = 집계 주기(설정 칸 ranking_period)의 배수(UTC). 마지막 집계의 끝(to) 다음 경계가 지나면 [to, 경계)를 한 번에 센다.
//   빠진 경계가 여럿이면(서버가 꺼져 있었음) 감쇠만 그 수만큼 하고 이번 기간 점수는 기간 전체를 한 번 센다. 처음이면 [경계 − 주기, 경계).
// - 연 경로(팩 ranking_paths open)만 판을 만든다. 닫힌 경로의 줄은 지운다. 점수 0은 판에서 빠진다(줄을 지운다).
// - 세력 판은 집계 때의 규모(감쇠 없음). 명성 칸 = 정원사 2가 쌓은 세력 명성(점수에 더하지 않음, 질문 427 가).
// - 쓰기는 한 트랜잭션: 두 판을 통째로 바꾸고 상태 줄을 앞 값과 맞을 때만 고친다(두 번 세지 않는다).
// - NPC 도시 가문원 유닛 점수(ranking_unit_scores, unitScores.ts — 가문 판의 NPC 가문 점수 = 가문원 실제 점수의 합)도 같은 트랜잭션에서 바꾼다.
// - 바뀜(house-9, D-576 "전투력, 자산, 등"): 전투력·자산(worth.ts)을 집계 때 한 번 읽어 소유 주체·가문원 재고 지표에 싣고, 값 표(ranking_worth —
//   판 줄의 전투력·자산 칸)를 같은 트랜잭션에서 바꾼다.
import type { RankingPathInfo } from "@terra/shared/ranking";
import {
  type RankingCoefficients,
  factionScore,
  nextScore,
  periodGain,
  rankEntries,
  tierPmOf,
} from "@terra/sim";
import {
  type FactionScaleRow,
  type OwnerFlows,
  type OwnerStocks,
  type Queryable,
  measureValues,
  readFactionScales,
  readFlows,
  readStocks,
} from "./measures.ts";
import {
  addCityWork,
  computeUnitScores,
  readHouseUnits,
  readMemberCities,
  readPrevUnits,
  readUnitFlows,
  writeUnitScores,
} from "./unitScores.ts";
import { type WorthSource, type WorthValues, readWorth, writeWorth } from "./worth.ts";

/** 집계 주기 하한(설정 칸 범위와 같다) */
export const MIN_PERIOD_MS = 60_000;

export interface PathScoreRow {
  readonly pathId: string;
  readonly ownerId: number;
  readonly score: number;
  readonly gain: number;
  readonly rank: number;
  readonly prevRank: number | null;
  readonly tierPm: number | null;
}

export interface FactionScoreRow {
  readonly factionId: number;
  readonly score: number;
  readonly rank: number;
  readonly prevRank: number | null;
  readonly tierPm: number | null;
  readonly cities: number;
  readonly humans: number;
  readonly renown: number | null;
}

export interface SnapshotInput {
  readonly paths: readonly RankingPathInfo[];
  /** 앞 집계의 경로 판(경로 → 주체 → 점수·순위) */
  readonly prevPaths: ReadonlyMap<string, ReadonlyMap<number, { score: number; rank: number }>>;
  readonly prevFactions: ReadonlyMap<number, number>;
  readonly flows: ReadonlyMap<number, OwnerFlows>;
  readonly stocks: ReadonlyMap<number, OwnerStocks>;
  readonly factions: readonly FactionScaleRow[];
  readonly coefficients: RankingCoefficients;
  /** 감쇠 횟수(빠진 경계 수, 1 이상) */
  readonly periods: number;
}

const NO_FLOWS: OwnerFlows = { production: 0n, warWinsPm: 0, battleWinsPm: 0 };
const NO_STOCKS: OwnerStocks = { cities: 0, developmentSum: 0, facilityLevelPpm: 0n };

export { measureValues } from "./measures.ts";

/** 두 판의 다음 줄(순수 함수 — DB 없이 시험한다) */
export function computeSnapshot(input: SnapshotInput): {
  paths: PathScoreRow[];
  factions: FactionScoreRow[];
} {
  const c = input.coefficients;
  const paths: PathScoreRow[] = [];
  for (const path of input.paths) {
    if (!path.open || path.measures.length === 0) continue;
    const prev = input.prevPaths.get(path.id) ?? new Map<number, { score: number; rank: number }>();
    const subjects = new Set<number>([...prev.keys(), ...input.flows.keys(), ...input.stocks.keys()]);
    const scored = new Map<number, { score: number; gain: number }>();
    for (const owner of subjects) {
      const values = measureValues(input.flows.get(owner) ?? NO_FLOWS, input.stocks.get(owner) ?? NO_STOCKS);
      const gain = periodGain(values, path.measures);
      const score = nextScore(prev.get(owner)?.score ?? 0, gain, c.decayPm, input.periods);
      if (score > 0) scored.set(owner, { score, gain });
    }
    const ranked = rankEntries([...scored].map(([key, value]) => ({ key, score: value.score })));
    for (const entry of ranked)
      paths.push({
        pathId: path.id,
        ownerId: entry.key,
        score: entry.score,
        gain: scored.get(entry.key)?.gain ?? 0,
        rank: entry.rank,
        prevRank: prev.get(entry.key)?.rank ?? null,
        tierPm: tierPmOf(entry.rank, ranked.length, c.tiersPm),
      });
  }
  const sizes = new Map(input.factions.map((row) => [row.factionId, row]));
  const rankedFactions = rankEntries(
    input.factions.map((row) => ({ key: row.factionId, score: factionScore(row, c.faction) })),
  );
  const factions = rankedFactions.map((entry) => ({
    factionId: entry.key,
    score: entry.score,
    rank: entry.rank,
    prevRank: input.prevFactions.get(entry.key) ?? null,
    tierPm: tierPmOf(entry.rank, rankedFactions.length, c.tiersPm),
    cities: sizes.get(entry.key)?.cities ?? 0,
    humans: sizes.get(entry.key)?.humans ?? 0,
    renown: sizes.get(entry.key)?.renown ?? null,
  }));
  return { paths, factions };
}

export interface SnapshotState {
  readonly periodFromMs: number;
  readonly periodToMs: number;
  readonly computedAtMs: number;
}

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));

export async function readSnapshotState(db: Queryable): Promise<SnapshotState | null> {
  const result = await db.query(
    `select period_from_ms, period_to_ms, computed_at_ms from ranking_state where id = 1`,
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    periodFromMs: num(row.period_from_ms),
    periodToMs: num(row.period_to_ms),
    computedAtMs: num(row.computed_at_ms),
  };
}

/** 지금 셀 기간. 경계가 마지막 끝을 넘지 않았으면 null */
export function dueWindow(
  state: SnapshotState | null,
  nowMs: number,
  periodMs: number,
): { fromMs: number; toMs: number; periods: number } | null {
  const period = Math.max(MIN_PERIOD_MS, periodMs);
  const boundary = Math.floor(nowMs / period) * period;
  if (state !== null && boundary <= state.periodToMs) return null;
  const fromMs = state === null ? boundary - period : state.periodToMs;
  return { fromMs, toMs: boundary, periods: Math.max(1, Math.floor((boundary - fromMs) / period)) };
}

/** 트랜잭션을 여는 연결(pg Pool) */
export interface RankingPool extends Queryable {
  connect(): Promise<Queryable & { release(): void }>;
}

async function readPrev(db: Queryable) {
  const prevPaths = new Map<string, Map<number, { score: number; rank: number }>>();
  const paths = await db.query(`select path_id, owner_id, score, rank from ranking_path_scores`);
  for (const row of paths.rows) {
    const pathId = String(row.path_id);
    const map = prevPaths.get(pathId) ?? new Map<number, { score: number; rank: number }>();
    map.set(num(row.owner_id), { score: num(row.score), rank: num(row.rank) });
    prevPaths.set(pathId, map);
  }
  const factions = await db.query(`select faction_id, rank from ranking_faction_scores`);
  const prevFactions = new Map(factions.rows.map((row) => [num(row.faction_id), num(row.rank)]));
  return { prevPaths, prevFactions };
}

export interface SnapshotReport {
  readonly fromMs: number;
  readonly toMs: number;
  readonly periods: number;
  readonly pathRows: number;
  readonly factionRows: number;
  /** NPC 가문원 유닛 점수 줄 수 */
  readonly unitRows: number;
  /** 전투력·자산 값 표 줄 수(house-9) */
  readonly worthRows: number;
}

/** 전투력·자산을 재고 지표에 싣는다(없는 주체는 새 줄) */
function addWorth(stocks: Map<number, OwnerStocks>, values: WorthValues["owners"]): void {
  for (const [id, value] of values) {
    const stock = stocks.get(id) ?? { cities: 0, developmentSum: 0, facilityLevelPpm: 0n };
    stock.combatPower = value.power;
    stock.assets = value.assets;
    stocks.set(id, stock);
  }
}

/**
 * 경계가 지났으면 한 번 센다. 센 것이 없으면 null. 앞 상태가 그새 바뀌었으면(다른 집계가 먼저 씀) 쓰지 않고 null.
 * creditAsset = 국고로 치는 자산(시험 화폐, src/world/settlement.ts ASSET_CREDIT)
 */
export async function runSnapshot(
  pool: RankingPool,
  options: {
    readonly paths: readonly RankingPathInfo[];
    readonly coefficients: RankingCoefficients;
    readonly creditAsset: string;
    readonly nowMs: number;
    /** 전투력·자산 셈 출처(house-9 — worthSource.ts). 없으면 두 지표 0 */
    readonly worth?: (() => WorthSource | undefined) | undefined;
  },
): Promise<SnapshotReport | null> {
  const c = options.coefficients;
  const state = await readSnapshotState(pool);
  const window = dueWindow(state, options.nowMs, c.periodMs);
  if (window === null) return null;
  const [flows, stocks, factions, prev, members, prevUnits] = await Promise.all([
    readFlows(pool, window.fromMs, window.toMs, c.underdogCapPm),
    readStocks(pool),
    readFactionScales(pool, options.creditAsset),
    readPrev(pool),
    readHouseUnits(pool),
    readPrevUnits(pool),
  ]);
  // NPC 도시 가문원 유닛 점수(질문 2146 → 고침, unitScores.ts) — 같은 기간·같은 감쇠, 같은 트랜잭션에 쓴다. 바뀜(D-576): 도시 산출·NPC 시설 몫도
  const unitFlows = await readUnitFlows(pool, window.fromMs, window.toMs, c.underdogCapPm, members);
  const unitStocks = await addCityWork(
    pool,
    window.fromMs,
    window.toMs,
    await readMemberCities(pool, members),
    unitFlows,
  );
  // 전투력·자산(D-576) — 소유 주체·가문원 재고 지표에 싣는다
  const worth = await readWorth(pool, options.worth?.(), members);
  addWorth(stocks, worth.owners);
  addWorth(unitStocks, worth.units);
  const unitRows = computeUnitScores({
    paths: options.paths,
    prev: prevUnits,
    flows: unitFlows,
    stocks: unitStocks,
    members,
    coefficients: c,
    periods: window.periods,
  });
  const next = computeSnapshot({
    paths: options.paths,
    ...prev,
    flows,
    stocks,
    factions,
    coefficients: c,
    periods: window.periods,
  });
  let worthRows = 0;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query(`select period_to_ms from ranking_state where id = 1 for update`);
    const current = locked.rows[0] === undefined ? null : num(locked.rows[0].period_to_ms);
    if (current !== (state?.periodToMs ?? null)) {
      await client.query("rollback");
      return null;
    }
    await client.query(`delete from ranking_path_scores`);
    if (next.paths.length > 0)
      await client.query(
        `insert into ranking_path_scores (path_id, owner_id, score, gain, rank, prev_rank, tier_pm)
         select * from unnest($1::text[], $2::bigint[], $3::bigint[], $4::bigint[], $5::int[], $6::int[], $7::smallint[])`,
        [
          next.paths.map((row) => row.pathId),
          next.paths.map((row) => row.ownerId),
          next.paths.map((row) => row.score),
          next.paths.map((row) => row.gain),
          next.paths.map((row) => row.rank),
          next.paths.map((row) => row.prevRank),
          next.paths.map((row) => row.tierPm),
        ],
      );
    await client.query(`delete from ranking_faction_scores`);
    if (next.factions.length > 0)
      await client.query(
        `insert into ranking_faction_scores (faction_id, score, rank, prev_rank, tier_pm, cities, humans, renown)
         select * from unnest($1::bigint[], $2::bigint[], $3::int[], $4::int[], $5::smallint[], $6::int[], $7::int[], $8::bigint[])`,
        [
          next.factions.map((row) => row.factionId),
          next.factions.map((row) => row.score),
          next.factions.map((row) => row.rank),
          next.factions.map((row) => row.prevRank),
          next.factions.map((row) => row.tierPm),
          next.factions.map((row) => row.cities),
          next.factions.map((row) => row.humans),
          next.factions.map((row) => row.renown),
        ],
      );
    await writeUnitScores(client, unitRows);
    worthRows = await writeWorth(client, worth);
    await client.query(
      `insert into ranking_state (id, period_from_ms, period_to_ms, computed_at_ms) values (1, $1, $2, $3)
       on conflict (id) do update set period_from_ms = excluded.period_from_ms, period_to_ms = excluded.period_to_ms,
         computed_at_ms = excluded.computed_at_ms`,
      [window.fromMs, window.toMs, options.nowMs],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return {
    ...window,
    pathRows: next.paths.length,
    factionRows: next.factions.length,
    unitRows: unitRows.length,
    worthRows,
  };
}
