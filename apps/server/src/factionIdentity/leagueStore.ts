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
  /** 표를 던진 때(투표 기간 — npc-fix-3) */
  readonly atMs: number;
}

/** 초대·신청 하나(league-2 — D-590 2502 다) */
export interface LeagueRequestRow {
  readonly leagueId: number;
  readonly houseKey: string;
  readonly kind: "invite" | "apply";
  readonly atMs: number;
}

/** 끝나지 않은 연맹의 초대·신청(조항 카드는 league-3 D-593에서 없앰 — 표 house_league_clauses는 읽지 않는다) */
export async function loadLeagueExtras(pool: QueryPool): Promise<{ requests: LeagueRequestRow[] }> {
  const requests = await pool.query(
    `select r.league_id::text, r.house_key, r.kind, r.at_ms::text from house_league_requests r
       join house_leagues l on l.id = r.league_id and l.ended_at_ms is null
      order by r.league_id, r.at_ms, r.house_key`,
  );
  return {
    requests: requests.rows.map((row) => ({
      leagueId: Number(row.league_id),
      houseKey: String(row.house_key),
      kind: row.kind === "invite" ? "invite" : "apply",
      atMs: Number(row.at_ms),
    })),
  };
}

/** 초대·신청을 넣는다(연맹 × 가문마다 하나 — 마지막 것) */
export async function upsertRequest(
  pool: QueryPool,
  leagueId: number,
  houseKey: string,
  kind: "invite" | "apply",
  nowMs: number,
): Promise<void> {
  await pool.query(
    `insert into house_league_requests (league_id, house_key, kind, at_ms) values ($1, $2, $3, $4)
       on conflict (league_id, house_key) do update set kind = excluded.kind, at_ms = excluded.at_ms`,
    [leagueId, houseKey, kind, nowMs],
  );
}

/** 초대·신청을 지운다(들었거나 거절·거둠) */
export async function deleteRequest(pool: QueryPool, leagueId: number, houseKey: string): Promise<void> {
  await pool.query("delete from house_league_requests where league_id = $1 and house_key = $2", [
    leagueId,
    houseKey,
  ]);
}

/** 가문 이름(플레이어 = 세력 정체성 이름, NPC = 성 — governance/store.ts houseNames와 같은 읽기) */
export async function leagueHouseNames(
  pool: QueryPool,
  keys: readonly string[],
): Promise<Map<string, string>> {
  const player = keys.filter((key) => key.startsWith("p:")).map((key) => key.slice(2));
  const npc = keys.filter((key) => key.startsWith("n:")).map((key) => key.slice(2));
  const out = new Map<string, string>();
  if (player.length > 0) {
    const { rows } = await pool.query(
      "select faction_id::text, name from faction_profiles where faction_id = any($1::bigint[])",
      [player],
    );
    for (const row of rows) out.set(`p:${String(row.faction_id)}`, String(row.name));
  }
  if (npc.length > 0) {
    const { rows } = await pool.query("select id::text, name from npc_houses where id = any($1::bigint[])", [
      npc,
    ]);
    for (const row of rows) out.set(`n:${String(row.id)}`, String(row.name));
  }
  return out;
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
    `select v.league_id::text, v.voter_key, v.candidate_key, v.at_ms::text from house_league_votes v
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
      atMs: Number(row.at_ms),
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

/** 연맹이 끝난다(마지막 가문이 나감) */
export async function endLeague(pool: QueryPool, leagueId: number, nowMs: number): Promise<void> {
  await pool.query("update house_leagues set ended_at_ms = $2 where id = $1 and ended_at_ms is null", [
    leagueId,
    nowMs,
  ]);
  await pool.query("delete from house_league_members where league_id = $1", [leagueId]);
  await pool.query("delete from house_league_votes where league_id = $1", [leagueId]);
  await pool.query("delete from house_league_requests where league_id = $1", [leagueId]);
  // 옛 조항 카드 줄(league-3 D-593에서 쓰지 않음)도 함께 지운다 — 표는 올라간 마이그레이션이라 남는다
  await pool.query("delete from house_league_clauses where league_id = $1", [leagueId]);
}

/** 대표를 바꾸고 표를 모두 지운다(위임·투표·대표가 나감) */
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

/** 살아 있는 플레이어 가문(해산하지 않은 세력 행 — npc-fix-3, 사라진 가문 빼기) */
export async function livePlayerHouses(pool: QueryPool, ids: readonly number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const result = await pool.query(
    "select id::text from factions where id = any($1::bigint[]) and kind = 'player' and dissolved_at_ms is null",
    [ids.map(String)],
  );
  return new Set(result.rows.map((row) => Number(row.id)));
}
