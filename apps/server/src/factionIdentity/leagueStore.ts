// 가문 연맹 표 읽기·쓰기(npc-invest-2 — 질문 2502·2503, db/leagueSchema.ts). 쓰는 곳은 leagueService.ts 하나다(서비스가 차례대로 부른다).
// 문장마다 한 SQL이라 따로 트랜잭션을 열지 않는다(연맹 만들기는 CTE 하나로 연맹 줄과 첫 가문 줄을 함께 넣는다).

interface QueryPool {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** 읽은 연맹 하나(끝나지 않은 것) */
export interface LeagueRow {
  readonly id: number;
  readonly founderKey: string;
  readonly representativeKey: string;
  readonly createdAtMs: number;
  /** 든 가문(든 차례) */
  readonly members: readonly string[];
}

export interface LeagueVoteRow {
  readonly leagueId: number;
  readonly voterKey: string;
  readonly candidateKey: string;
}

/** 끝나지 않은 연맹과 표 */
export async function loadLeagues(
  pool: QueryPool,
): Promise<{ leagues: LeagueRow[]; votes: LeagueVoteRow[] }> {
  const leagues = await pool.query(
    `select id::text, founder_key, representative_key, created_at_ms::text
       from house_leagues where ended_at_ms is null order by id`,
  );
  const members = await pool.query(
    `select m.league_id::text, m.house_key from house_league_members m
       join house_leagues l on l.id = m.league_id and l.ended_at_ms is null
      order by m.league_id, m.joined_at_ms, m.house_key`,
  );
  const votes = await pool.query(
    `select v.league_id::text, v.voter_key, v.candidate_key from house_league_votes v
       join house_leagues l on l.id = v.league_id and l.ended_at_ms is null
      order by v.league_id, v.voter_key`,
  );
  const byLeague = new Map<number, string[]>();
  for (const row of members.rows) {
    const id = Number(row.league_id);
    const list = byLeague.get(id) ?? [];
    list.push(String(row.house_key));
    byLeague.set(id, list);
  }
  return {
    leagues: leagues.rows.map((row) => ({
      id: Number(row.id),
      founderKey: String(row.founder_key),
      representativeKey: String(row.representative_key),
      createdAtMs: Number(row.created_at_ms),
      members: byLeague.get(Number(row.id)) ?? [],
    })),
    votes: votes.rows.map((row) => ({
      leagueId: Number(row.league_id),
      voterKey: String(row.voter_key),
      candidateKey: String(row.candidate_key),
    })),
  };
}

/** 연맹을 만들고(만든 가문 = 대표) 첫 가문 줄을 넣는다. 새 연맹 ID */
export async function insertLeague(pool: QueryPool, founderKey: string, nowMs: number): Promise<number> {
  const result = await pool.query(
    `with l as (
       insert into house_leagues (founder_key, representative_key, created_at_ms) values ($1, $1, $2) returning id
     )
     insert into house_league_members (league_id, house_key, joined_at_ms) select id, $1, $2 from l returning league_id::text`,
    [founderKey, nowMs],
  );
  return Number(result.rows[0]?.league_id);
}

export async function insertMember(
  pool: QueryPool,
  leagueId: number,
  houseKey: string,
  nowMs: number,
): Promise<void> {
  await pool.query(
    "insert into house_league_members (league_id, house_key, joined_at_ms) values ($1, $2, $3) on conflict do nothing",
    [leagueId, houseKey, nowMs],
  );
}

/** 가문이 나간다(그 가문의 표와 그 가문을 찍은 표도 지운다) */
export async function deleteMember(pool: QueryPool, leagueId: number, houseKey: string): Promise<void> {
  await pool.query("delete from house_league_members where league_id = $1 and house_key = $2", [
    leagueId,
    houseKey,
  ]);
  await pool.query(
    "delete from house_league_votes where league_id = $1 and (voter_key = $2 or candidate_key = $2)",
    [leagueId, houseKey],
  );
}

/** 연맹이 끝난다(대표 혼자 남아 나감) */
export async function endLeague(pool: QueryPool, leagueId: number, nowMs: number): Promise<void> {
  await pool.query("update house_leagues set ended_at_ms = $2 where id = $1 and ended_at_ms is null", [
    leagueId,
    nowMs,
  ]);
  await pool.query("delete from house_league_members where league_id = $1", [leagueId]);
  await pool.query("delete from house_league_votes where league_id = $1", [leagueId]);
}

/** 대표를 바꾸고 표를 모두 지운다(위임·투표) */
export async function setRepresentative(pool: QueryPool, leagueId: number, houseKey: string): Promise<void> {
  await pool.query("update house_leagues set representative_key = $2 where id = $1", [leagueId, houseKey]);
  await pool.query("delete from house_league_votes where league_id = $1", [leagueId]);
}

/** 표를 넣는다(마지막 표만 — 같은 가문 표는 바꾼다) */
export async function upsertVote(
  pool: QueryPool,
  leagueId: number,
  voterKey: string,
  candidateKey: string,
  nowMs: number,
): Promise<void> {
  await pool.query(
    `insert into house_league_votes (league_id, voter_key, candidate_key, at_ms) values ($1, $2, $3, $4)
       on conflict (league_id, voter_key) do update set candidate_key = excluded.candidate_key, at_ms = excluded.at_ms`,
    [leagueId, voterKey, candidateKey, nowMs],
  );
}

/** 표를 모두 지운다(지금 대표에게 과반이 모였을 때) */
export async function clearVotes(pool: QueryPool, leagueId: number): Promise<void> {
  await pool.query("delete from house_league_votes where league_id = $1", [leagueId]);
}
