// 유닛 판(house-10, 기획 대조 2316 — D-569 1746 "랭킹은 가문별 유닛별 모두 존재") — 마지막 집계의 값 표(ranking_worth kind 1, worth.ts가 모든 유닛을
// 싣는다)를 지표 하나(전투력·자산 — 유닛마다 이미 센다, 사람 몫을 유닛으로 나누는 규칙을 기다리지 않는다)로 줄 세운다. 읽기만 한다.
// - 순위 = 값 큰 차례(같으면 유닛 ID 차례), 감쇠 없는 규모 판(집계 때 값 그대로 — 지난 순위는 null). 값 0은 빠진다.
// - 줄: 유닛 이름(집계 때 — 사이보그 이름·NPC 휴먼 이름, 모르면 null → 화면 "유닛 #ID"), 주인(사이보그 이름 또는 세력 이름), 전투력·자산 칸.
// - 내 줄 = 내 유닛 가운데 가장 위 줄. 등급 = 다른 판과 같은 백분위 문턱(tierPmOf).
import type { LocalizedName } from "@terra/shared/faction";
import {
  RANKING_BOARD_ROWS,
  type RankingBoardResponse,
  type RankingRow,
  type RankingTierCut,
  type RankingUnitMeasure,
} from "@terra/shared/ranking";
import { tierPmOf } from "@terra/sim";
import type { Queryable } from "./measures.ts";
import type { NationNames } from "./paths.ts";

/** 읽는 맥락(reads.ts RankingReadContext의 몫 — 서로 가져오지 않게 필요한 것만) */
export interface UnitBoardContext {
  readonly db: Queryable;
  readonly nations: NationNames;
  readonly coefficients: { readonly tiersPm: readonly number[]; readonly topRanks: number };
}

/** 지표 → 값 표 열(SQL에 그대로 넣으므로 이 표만 쓴다) */
const COLUMN: Record<RankingUnitMeasure, string> = { combat_power: "combat_power", assets: "assets" };

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const same = (value: string | null): LocalizedName | null =>
  value === null ? null : { ko: value, en: value };

/** 정수 글자 → 점수(안전한 정수 범위 안으로) */
function scoreOf(value: string): number {
  const parsed = /^\d+$/.test(value) ? BigInt(value) : 0n;
  return parsed > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(parsed);
}

const rankedSql = (column: string): string =>
  `with ranked as (
     select w.subject_id, w.combat_power, w.assets, w.owner_id, w.name, w.${column} as v,
            row_number() over (order by w.${column} desc, w.subject_id) as rank,
            count(*) over () as total
       from ranking_worth w where w.kind = 1 and w.${column} > 0
   )`;

/** 유닛 판 줄들(위 RANKING_BOARD_ROWS줄 + 내 줄)과 등급 문턱. ownerId = 보는 사람의 소유 주체(없으면 null) */
export async function readUnitBoard(
  ctx: UnitBoardContext,
  ownerId: number | null,
  measure: RankingUnitMeasure,
): Promise<Pick<RankingBoardResponse, "total" | "rows" | "me" | "tiers">> {
  const column = COLUMN[measure];
  const result = await ctx.db.query(
    `${rankedSql(column)}
     select r.subject_id, r.combat_power::text as power, r.assets::text as assets, r.v::text as v, r.owner_id, r.name,
            r.rank, r.total, o.faction_id, c.name as owner_cyborg, f.code as faction_code
       from ranked r
       left join world_owners o on o.id = r.owner_id
       left join cyborgs c on c.user_id = o.user_id
       left join factions f on f.id = o.faction_id
      where r.rank <= $1 or r.subject_id = (select x.subject_id from ranked x where x.owner_id = $2 order by x.rank limit 1)
      order by r.rank`,
    [RANKING_BOARD_ROWS, ownerId ?? -1],
  );
  const total = result.rows[0] === undefined ? 0 : num(result.rows[0].total);
  const all: RankingRow[] = result.rows.map((row) => {
    const rank = num(row.rank);
    const factionId = row.faction_id === null || row.faction_id === undefined ? null : num(row.faction_id);
    const code = text(row.faction_code);
    const owner =
      factionId === null
        ? same(text(row.owner_cyborg))
        : ((code === null ? undefined : ctx.nations.get(code)) ?? same(code ?? `#${factionId}`));
    return {
      rank,
      prevRank: null,
      kind: "unit",
      name: same(text(row.name)),
      faction: null,
      score: scoreOf(String(row.v)),
      tierPm: tierPmOf(rank, total, ctx.coefficients.tiersPm),
      top: rank <= ctx.coefficients.topRanks,
      me: ownerId !== null && row.owner_id !== null && num(row.owner_id) === ownerId,
      detail: null,
      unitId: num(row.subject_id),
      owner,
      worth: { power: String(row.power), assets: String(row.assets) },
    };
  });
  const sorted = ctx.coefficients.tiersPm.toSorted((a, b) => a - b);
  let tiers: RankingTierCut[] = sorted.map((tierPm) => ({ tierPm, minScore: null }));
  if (total > 0) {
    const cuts = await ctx.db.query(
      `${rankedSql(column)}
       select t.tier, (select min(r.v)::text from ranked r where r.rank * 1000 <= $2::bigint * t.tier) as min_v
         from unnest($1::int[]) as t(tier) order by t.tier`,
      [sorted, total],
    );
    tiers = cuts.rows.map((row) => ({
      tierPm: num(row.tier),
      minScore: typeof row.min_v === "string" ? scoreOf(row.min_v) : null,
    }));
  }
  const top = all.filter((row) => row.rank <= RANKING_BOARD_ROWS);
  // 내 줄 = 내 유닛 가운데 가장 위(위 줄에 있으면 그 줄)
  const me = all.find((row) => row.me) ?? null;
  return { total, rows: top, me, tiers };
}
