// 가문 판(기획 D-569 1746 "랭킹은 가문별 유닛별 모두 존재") — 경로 하나의 유저 점수(마지막 집계 ranking_path_scores)를 가문원끼리 더해 가문마다
// 한 줄로 읽는다. 읽을 때 센다(따로 집계 표가 없다 — 지난 순위는 null). 가문원 = 지금 house_members(해산하지 않은 가문), 줄에 소속 도시 이름을
// 싣는다(D-565 "랭킹 집계는 소속 도시 기준"). 유닛 단위 가문(D-569 1744)이지만 경로 점수가 사람(소유 주체) 단위라 사람의 가문으로 더한다
// ([임시] 질문 1844). 순위 = 점수 높은 차례(같으면 가문 ID 차례), 등급 = 유저 판과 같은 백분위 문턱(tierPmOf).
import type { RankingBoardResponse, RankingRow, RankingTierCut } from "@terra/shared/ranking";
import { RANKING_BOARD_ROWS } from "@terra/shared/ranking";
import { tierPmOf } from "@terra/sim";
import type { NationNames } from "./paths.ts";
import type { Queryable } from "./measures.ts";

/** 읽는 맥락(reads.ts RankingReadContext와 같은 모양 — 서로 가져오지 않게 필요한 것만) */
export interface HouseBoardContext {
  readonly db: Queryable;
  readonly nations: NationNames;
  readonly coefficients: { readonly tiersPm: readonly number[]; readonly topRanks: number };
}

/** 나라 이름: 국가 프리셋 → 서버 코드 → #번호(reads.ts factionName과 같은 규칙) */
const nationName = (nations: NationNames, id: number, code: string | null) =>
  (code === null ? undefined : nations.get(code)) ?? { ko: code ?? `#${id}`, en: code ?? `#${id}` };

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

const HOUSE_SQL = `select m.faction_id, sum(s.score) as score, count(*)::int as members,
         i.name as house_name, c.name as city_name, n.id as nation_id, n.code as nation_code
    from ranking_path_scores s
    join world_owners o on o.id = s.owner_id
    join house_members m on m.user_id = o.user_id
    join factions f on f.id = m.faction_id and f.kind = 'player' and f.dissolved_at_ms is null
    left join faction_identities i on i.faction_id = m.faction_id
    left join house_homes h on h.faction_id = m.faction_id
    left join world_cities c on c.id = h.city_id
    left join factions n on n.id = f.born_of
   where s.path_id = $1
   group by m.faction_id, i.name, c.name, n.id, n.code
   order by sum(s.score) desc, m.faction_id`;

/** 가문 판 줄들(전부)과 내 가문 */
export async function readHouseBoard(
  ctx: HouseBoardContext,
  userId: string,
  path: string,
): Promise<Pick<RankingBoardResponse, "total" | "rows" | "me" | "tiers">> {
  const [result, mine] = await Promise.all([
    ctx.db.query(HOUSE_SQL, [path]),
    ctx.db.query("select faction_id from house_members where user_id = $1", [userId]),
  ]);
  const myHouse = mine.rows[0] ? num(mine.rows[0].faction_id) : null;
  const total = result.rows.length;
  const tiersPm = ctx.coefficients.tiersPm;
  const all: RankingRow[] = result.rows.map((row, index) => {
    const rank = index + 1;
    const nationId = row.nation_id === null || row.nation_id === undefined ? null : num(row.nation_id);
    const name = text(row.house_name);
    return {
      rank,
      prevRank: null,
      kind: "house",
      name: name === null ? null : { ko: name, en: name },
      faction: nationId === null ? null : nationName(ctx.nations, nationId, text(row.nation_code)),
      score: num(row.score),
      tierPm: tierPmOf(rank, total, tiersPm),
      top: rank <= ctx.coefficients.topRanks,
      me: myHouse !== null && num(row.faction_id) === myHouse,
      detail: null,
      home: text(row.city_name),
      members: num(row.members),
    };
  });
  const tiers: RankingTierCut[] = tiersPm
    .toSorted((a, b) => a - b)
    .map((tierPm) => {
      const inside = all.filter((row) => row.rank * 1000 <= total * tierPm);
      return { tierPm, minScore: inside.length === 0 ? null : (inside.at(-1)?.score ?? null) };
    });
  return {
    total,
    rows: all.slice(0, RANKING_BOARD_ROWS),
    me: all.find((row) => row.me) ?? null,
    tiers,
  };
}
