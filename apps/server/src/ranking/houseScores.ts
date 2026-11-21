// 가문 몫 점수 — fixes-1116t(기획 대조 2341 나 — D-576·D-338 "가문 금고·지도자 지갑은 가문 재산", D-037 "랭킹 점수는 감쇠형").
// docs/adr/2026-11-07-ranking.md "바뀜 (fixes-1116t)".
// - 가문 판 줄의 전투력·자산 칸에만 들던 가문 몫(가문 금고 — 플레이어·NPC, NPC 지배 가문장 = 국가 지도자의 지갑·전투력, worth.ts houses·npcHouses)을
//   가문 하나의 재고 지표(전투력·자산)로 보고, 경로 판·유닛 점수와 같은 감쇠형 점수(nextScore — 앞 점수 × (1 − 감쇠) + 이번 기간)로 가문마다 쌓는다.
//   변환도 같다(measureValues — 절대량 로그 압축). 그래서 전투력·자산 지표가 든 경로(strongest·wealthiest 등)에서만 점수가 생긴다.
// - 가문 판 점수 = 가문원 점수 합 + 이 점수(houseBoard.ts). 가문원 몫과 겹치지 않는다: 가문원 사람·가문원 유닛의 값은 그 줄 몫이고, 금고·지도자는
//   가문원이 아니다(지도자 유닛은 npc_house_units 줄이 없다).
// - 지금 있는 가문만 둔다(플레이어 = 해산하지 않은 kind player 세력, NPC = npc_houses). 사라진 가문의 줄은 지운다. 점수 0은 뺀다.
import type { RankingPathInfo } from "@terra/shared/ranking";
import { type RankingCoefficients, nextScore, periodGain } from "@terra/sim";
import { type OwnerFlows, type OwnerStocks, type Queryable, measureValues } from "./measures.ts";
import type { WorthValue } from "./worth.ts";

/** 가문 몫 점수 한 줄 */
export interface HouseScoreRow {
  readonly pathId: string;
  /** false = 플레이어 가문(세력 행 ID), true = NPC 가문(npc_houses ID) */
  readonly npc: boolean;
  readonly houseId: number;
  readonly score: number;
}

/** 가문 열쇠(플레이어·NPC가 같은 숫자를 쓸 수 있어 나눈다) */
const keyOf = (npc: boolean, houseId: number): string => `${npc ? "n" : "p"}:${houseId}`;

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));

const NO_FLOWS: OwnerFlows = { production: 0n, warWinsPm: 0, battleWinsPm: 0 };

/** 지금 있는 가문(열쇠) */
export async function readLiveHouses(db: Queryable): Promise<Set<string>> {
  const [players, npcs] = await Promise.all([
    db.query(`select id from factions where kind = 'player' and dissolved_at_ms is null`),
    db.query(`select id from npc_houses`),
  ]);
  return new Set([
    ...players.rows.map((row) => keyOf(false, num(row.id))),
    ...npcs.rows.map((row) => keyOf(true, num(row.id))),
  ]);
}

/** 앞 집계의 가문 몫 점수(경로 → 가문 열쇠 → 점수) */
export async function readPrevHouses(db: Queryable): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  const result = await db.query(`select path_id, npc, house_id, score from ranking_house_scores`);
  for (const row of result.rows) {
    const pathId = String(row.path_id);
    const map = out.get(pathId) ?? new Map<string, number>();
    map.set(keyOf(row.npc === true, num(row.house_id)), num(row.score));
    out.set(pathId, map);
  }
  return out;
}

/** 다음 가문 몫 점수(순수 함수 — DB 없이 시험한다). 연 경로·지표가 있는 경로만, 지금 있는 가문만, 점수 0은 뺀다 */
export function computeHouseScores(input: {
  readonly paths: readonly RankingPathInfo[];
  readonly prev: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** 플레이어 가문(세력 행 ID) → 가문 금고 값 */
  readonly houses: ReadonlyMap<number, WorthValue>;
  /** NPC 가문 ID → 가문 금고 + 가문장 지갑·전투력 */
  readonly npcHouses: ReadonlyMap<number, WorthValue>;
  readonly live: ReadonlySet<string>;
  readonly coefficients: Pick<RankingCoefficients, "decayPm">;
  readonly periods: number;
}): HouseScoreRow[] {
  /** 열쇠 → 이번 재고 지표 */
  const stocks = new Map<string, OwnerStocks>();
  for (const [npc, map] of [
    [false, input.houses],
    [true, input.npcHouses],
  ] as const)
    for (const [houseId, value] of map)
      stocks.set(keyOf(npc, houseId), {
        cities: 0,
        developmentSum: 0,
        facilityLevelPpm: 0n,
        combatPower: value.power,
        assets: value.assets,
      });
  const rows: HouseScoreRow[] = [];
  for (const path of input.paths) {
    if (!path.open || path.measures.length === 0) continue;
    const prev = input.prev.get(path.id) ?? new Map<string, number>();
    const keys = [...new Set<string>([...prev.keys(), ...stocks.keys()])]
      .filter((key) => input.live.has(key))
      .toSorted();
    for (const key of keys) {
      const stock = stocks.get(key) ?? { cities: 0, developmentSum: 0, facilityLevelPpm: 0n };
      const gain = periodGain(measureValues(NO_FLOWS, stock), path.measures);
      const score = nextScore(prev.get(key) ?? 0, gain, input.coefficients.decayPm, input.periods);
      if (score <= 0) continue;
      rows.push({ pathId: path.id, npc: key.startsWith("n:"), houseId: Number(key.slice(2)), score });
    }
  }
  return rows;
}

/** 가문 몫 점수를 통째로 바꿔 쓴다(랭킹 집계 트랜잭션 안) */
export async function writeHouseScores(client: Queryable, rows: readonly HouseScoreRow[]): Promise<void> {
  await client.query(`delete from ranking_house_scores`);
  if (rows.length === 0) return;
  await client.query(
    `insert into ranking_house_scores (path_id, npc, house_id, score)
     select * from unnest($1::text[], $2::boolean[], $3::bigint[], $4::bigint[])`,
    [
      rows.map((row) => row.pathId),
      rows.map((row) => row.npc),
      rows.map((row) => row.houseId),
      rows.map((row) => row.score),
    ],
  );
}
