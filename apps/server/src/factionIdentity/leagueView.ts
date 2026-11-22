// 가문 연맹 조회(tRPC factionIdentity.leagues — @terra/shared/houseLeague HouseLeaguesResponse) — league-2, 사용자 결정 D-590.
// DB를 읽는다(연맹 서비스는 DB에 먼저 쓰고 메모리를 바꾼다 — 표가 기준과 같다). 누구나 본다(나라와 상관없는 우호 기능 — D-587 4).
// 보는 사람의 가문·가문장 여부, 연맹마다 든 가문(이름)·초대·신청·열린 투표, 대표가 부를 플레이어 가문 목록(최근 것부터 HOUSE_LIST_MAX개).
// 바뀜(league-3, 사용자 결정 D-593 — 연맹은 친목): 조항 카드·요금 할인 몫을 뺐다.
import type { HouseLeagueHouse, HouseLeaguesResponse } from "@terra/shared/houseLeague";
import { leagueHouseNames, loadLeagueExtras, loadLeagues } from "./leagueStore.ts";
import { membershipOf } from "./members.ts";

type QueryPool = Parameters<typeof loadLeagues>[0] & Parameters<typeof membershipOf>[0];

/** 부를 수 있는 가문 목록 상한(화면 고르기 칸) */
export const HOUSE_LIST_MAX = 100;

export async function leaguesView(pool: QueryPool, viewerId: string): Promise<HouseLeaguesResponse> {
  const [{ leagues, votes }, extras, membership, houseRows] = await Promise.all([
    loadLeagues(pool),
    loadLeagueExtras(pool),
    membershipOf(pool, viewerId),
    pool.query(
      `select id::text from factions where kind = 'player' and dissolved_at_ms is null order by id desc limit $1`,
      [HOUSE_LIST_MAX],
    ),
  ]);
  const houseKeys = houseRows.rows.map((row) => `p:${String(row.id)}`);
  const keys = new Set<string>(houseKeys);
  for (const league of leagues) for (const member of league.members) keys.add(member);
  for (const request of extras.requests) keys.add(request.houseKey);
  const names = await leagueHouseNames(pool, [...keys]);
  const house = (key: string): HouseLeagueHouse => ({
    key,
    name: names.get(key) ?? null,
    npc: key.startsWith("n:"),
  });
  return {
    me: membership
      ? { house: `p:${String(membership.factionId)}`, leader: membership.role === "leader" }
      : null,
    leagues: leagues.map((league) => ({
      id: league.id,
      founder: league.founderKey,
      representative: league.representativeKey,
      createdAtMs: league.createdAtMs,
      members: league.members.map(house),
      requests: extras.requests
        .filter((row) => row.leagueId === league.id)
        .map((row) => ({ house: house(row.houseKey), kind: row.kind })),
      votes: votes
        .filter((vote) => vote.leagueId === league.id)
        .map((vote) => ({ voter: vote.voterKey, candidate: vote.candidateKey })),
    })),
    houses: houseKeys.map(house),
  };
}
