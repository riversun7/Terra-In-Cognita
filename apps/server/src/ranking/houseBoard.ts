// 가문 판(기획 D-569 1746 "랭킹은 가문별 유닛별 모두 존재") — 경로 하나의 유저 점수(마지막 집계 ranking_path_scores)를 가문원끼리 더해 가문마다
// 한 줄로 읽는다. 읽을 때 센다(따로 집계 표가 없다 — 지난 순위는 null). 가문원 = 지금 house_members(해산하지 않은 가문), 줄에 소속 도시 이름을
// 싣는다(D-565 "랭킹 집계는 소속 도시 기준"). 유닛 단위 가문(D-569 1744)이지만 경로 점수가 사람(소유 주체) 단위라 사람의 가문으로 더한다
// ([임시] 질문 1844). 순위 = 점수 높은 차례(같으면 플레이어 가문 → NPC 가문, 그 안에서 가문 ID 차례), 등급 = 유저 판과 같은 백분위 문턱(tierPmOf).
// 바뀜(질문 2014 답 — D-569 "랭킹은 가문별 유닛별 모두 존재"·D-212·D-555 1509 NPC도 똑같이): NPC 도시 가문(npc/cityHouses.ts)도 같은 판에 든다.
// 바뀜(fixes-1116l, 질문 2146 → 고침 — D-555 1509 "NPC만으로도 그대로 똑같이"·D-569): NPC 가문 점수 = 가문원(휴먼) 실제 점수의 합. NPC 휴먼은
// 경로 점수 주체(소유 주체)가 아니라 랭킹 집계가 유닛 점수(ranking_unit_scores — 그 유닛이 이긴 전투 등, unitScores.ts)를 따로 세고, 판은 그 합을
// 읽는다(옛 대리값 "나라 점수 × 가문원 수 ÷ 그 나라 NPC 가문원 합"을 대신한다). 나라 = 가문 도시의 지금 주인(NPC 세력만), 폐허가 된 도시의 가문·
// 가문원이 없는 가문·점수 0은 빠진다. 보상 대상을 좁히는 일은 따로(지금 가문 판 보상 코드는 없다).
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

/** NPC 도시 가문 줄(위 머리 주석 — 가문원 유닛 점수의 합, unitScores.ts). 점수 줄이 없는 가문원은 0 */
const NPC_HOUSE_SQL = `select h.id, h.name as house_name, c.name as city_name, c.faction_id as nation_id, n.code as nation_code,
         count(u.unit_id)::int as members, coalesce(sum(s.score), 0)::bigint as score
    from npc_houses h
    join world_cities c on c.id = h.city_id
    join factions n on n.id = c.faction_id and n.kind = 'npc'
    join npc_house_units u on u.house_id = h.id
    left join ranking_unit_scores s on s.unit_id = u.unit_id and s.path_id = $1
   group by h.id, h.name, c.name, c.faction_id, n.code`;

/** 판 한 줄로 바꾸기 전의 가문(플레이어·NPC 함께 차례를 정한다) */
interface HouseEntry {
  readonly npc: boolean;
  readonly id: number;
  readonly name: string | null;
  readonly nationId: number | null;
  readonly nationCode: string | null;
  readonly score: number;
  readonly home: string | null;
  readonly members: number;
}

/** 가문 판 줄들(전부)과 내 가문 */
export async function readHouseBoard(
  ctx: HouseBoardContext,
  userId: string,
  path: string,
): Promise<Pick<RankingBoardResponse, "total" | "rows" | "me" | "tiers">> {
  const [result, npcResult, mine] = await Promise.all([
    ctx.db.query(HOUSE_SQL, [path]),
    ctx.db.query(NPC_HOUSE_SQL, [path]),
    ctx.db.query("select faction_id from house_members where user_id = $1", [userId]),
  ]);
  const myHouse = mine.rows[0] ? num(mine.rows[0].faction_id) : null;
  const nationOf = (row: Record<string, unknown>): number | null =>
    row.nation_id === null || row.nation_id === undefined ? null : num(row.nation_id);
  const entries: HouseEntry[] = [
    ...result.rows.map((row) => ({
      npc: false,
      id: num(row.faction_id),
      name: text(row.house_name),
      nationId: nationOf(row),
      nationCode: text(row.nation_code),
      score: num(row.score),
      home: text(row.city_name),
      members: num(row.members),
    })),
    ...npcResult.rows.map((row) => ({
      npc: true,
      id: num(row.id),
      name: text(row.house_name),
      nationId: nationOf(row),
      nationCode: text(row.nation_code),
      score: num(row.score),
      home: text(row.city_name),
      members: num(row.members),
    })),
  ]
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score || Number(a.npc) - Number(b.npc) || a.id - b.id);
  const total = entries.length;
  const tiersPm = ctx.coefficients.tiersPm;
  const all: RankingRow[] = entries.map((entry, index) => {
    const rank = index + 1;
    // NPC 가문 이름은 성 하나(번역 안 함 D-476) — 판에는 "{성} 가문"·"House {성}"으로
    const name =
      entry.name === null
        ? null
        : entry.npc
          ? { ko: `${entry.name} 가문`, en: `House ${entry.name}` }
          : { ko: entry.name, en: entry.name };
    return {
      rank,
      prevRank: null,
      kind: "house",
      name,
      faction: entry.nationId === null ? null : nationName(ctx.nations, entry.nationId, entry.nationCode),
      score: entry.score,
      tierPm: tierPmOf(rank, total, tiersPm),
      top: rank <= ctx.coefficients.topRanks,
      me: !entry.npc && myHouse !== null && entry.id === myHouse,
      detail: null,
      home: entry.home,
      members: entry.members,
      ...(entry.npc ? { npc: true as const } : {}),
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
