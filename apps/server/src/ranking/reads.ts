// 랭킹 조회 — 마지막 집계(ranking_* 표)를 화면 모양으로 읽는다(ranking.board·ranking.mine·사이보그 화면 랭킹 칸). 읽기만 한다.
// - 이름: 유저 = 사이보그 이름(다른 사람에게 보이는 이름은 이것뿐, D-134), 세력 = 국가 프리셋 이름(세력 code가 프리셋 ID일 때) 또는
//   서버 코드·번호([임시] 세력 이름 칸이 아직 없다 — 세력 화면과 같다, src/factionScreen/overview.ts).
// - 판 줄 = 위 RANKING_BOARD_ROWS줄 + 내 줄. 등급 문턱 점수는 같은 표에서 센다.
import type { LocalizedName } from "@terra/shared/faction";
import {
  RANKING_BOARD_ROWS,
  type RankingBoardKey,
  type RankingBoardResponse,
  type RankingFactionDetail,
  type RankingMineResponse,
  type RankingPathInfo,
  type RankingRow,
  type RankingSnapshotInfo,
  type RankingStanding,
  type RankingSubjectKind,
  type RankingTierCut,
} from "@terra/shared/ranking";
import type { RankingCoefficients } from "@terra/sim";
import type { NationNames } from "./paths.ts";
import type { Queryable } from "./measures.ts";
import { readHouseBoard } from "./houseBoard.ts";
import { MIN_PERIOD_MS, readSnapshotState } from "./snapshot.ts";

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : num(value);
const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

export interface RankingReadContext {
  readonly db: Queryable;
  readonly paths: readonly RankingPathInfo[];
  readonly nations: NationNames;
  readonly coefficients: RankingCoefficients;
}

/** 세력 이름: 국가 프리셋 → 서버 코드 → #번호 */
export function factionName(nations: NationNames, id: number, code: string | null): LocalizedName {
  const preset = code === null ? undefined : nations.get(code);
  if (preset) return preset;
  const label = code ?? `#${id}`;
  return { ko: label, en: label };
}

const same = (value: string | null): LocalizedName | null =>
  value === null ? null : { ko: value, en: value };

export async function snapshotInfo(
  db: Queryable,
  c: RankingCoefficients,
): Promise<RankingSnapshotInfo | null> {
  const state = await readSnapshotState(db);
  if (state === null) return null;
  const periodMs = Math.max(MIN_PERIOD_MS, c.periodMs);
  return {
    periodFromMs: state.periodFromMs,
    periodToMs: state.periodToMs,
    computedAtMs: state.computedAtMs,
    nextAtMs: state.periodToMs + periodMs,
    periodMs,
    decayPm: c.decayPm,
    tiersPm: c.tiersPm.toSorted((a, b) => a - b),
    topRanks: c.topRanks,
  };
}

/** 로그인 사용자의 소유 주체·세력(없으면 null) */
export async function viewerSubjects(
  db: Queryable,
  userId: string,
): Promise<{ ownerId: number | null; factionId: number | null; factionCode: string | null }> {
  const result = await db.query(
    `select (select o.id from world_owners o where o.user_id = $1) as owner_id, m.faction_id, f.code
       from (select 1) one
       left join faction_members m on m.user_id = $1
       left join factions f on f.id = m.faction_id`,
    [userId],
  );
  const row = result.rows[0];
  return {
    ownerId: numOrNull(row?.owner_id),
    factionId: numOrNull(row?.faction_id),
    factionCode: text(row?.code),
  };
}

function standingOf(row: Record<string, unknown>, total: number, topRanks: number): RankingStanding {
  const rank = num(row.rank);
  return {
    rank,
    prevRank: numOrNull(row.prev_rank),
    total,
    score: num(row.score),
    gain: num(row.gain ?? 0),
    tierPm: numOrNull(row.tier_pm),
    top: rank <= topRanks,
  };
}

async function tierCutsOf(
  db: Queryable,
  table: "ranking_path_scores" | "ranking_faction_scores",
  pathId: string | null,
  total: number,
  tiersPm: readonly number[],
): Promise<RankingTierCut[]> {
  const sorted = tiersPm.toSorted((a, b) => a - b);
  if (total === 0) return sorted.map((tierPm) => ({ tierPm, minScore: null }));
  // 세력 판은 모든 줄, 경로 판은 그 경로 줄만
  const where = pathId === null ? "" : "and s.path_id = $3";
  const result = await db.query(
    `select t.tier, (select min(s.score) from ${table} s where s.rank::bigint * 1000 <= $2::bigint * t.tier ${where}) as min_score
       from unnest($1::int[]) as t(tier) order by t.tier`,
    pathId === null ? [sorted, total] : [sorted, total, pathId],
  );
  return result.rows.map((row) => ({ tierPm: num(row.tier), minScore: numOrNull(row.min_score) }));
}

const PATH_ROW_SQL = `select s.owner_id, s.score, s.gain, s.rank, s.prev_rank, s.tier_pm,
         o.user_id, o.faction_id as owner_faction, c.name as cyborg_name, f.kind as owner_kind, f.code as owner_code,
         mf.id as member_faction, mf.code as member_code
    from ranking_path_scores s
    join world_owners o on o.id = s.owner_id
    left join cyborgs c on c.user_id = o.user_id
    left join factions f on f.id = o.faction_id
    left join faction_members m on m.user_id = o.user_id
    left join factions mf on mf.id = m.faction_id`;

function pathRow(
  row: Record<string, unknown>,
  ctx: RankingReadContext,
  total: number,
  meOwner: number | null,
): RankingRow {
  const standing = standingOf(row, total, ctx.coefficients.topRanks);
  const ownerFaction = numOrNull(row.owner_faction);
  const kind: RankingSubjectKind =
    ownerFaction === null ? "user" : row.owner_kind === "player" ? "player_faction" : "npc_faction";
  const memberFaction = numOrNull(row.member_faction);
  return {
    rank: standing.rank,
    prevRank: standing.prevRank,
    kind,
    name:
      ownerFaction === null
        ? same(text(row.cyborg_name))
        : factionName(ctx.nations, ownerFaction, text(row.owner_code)),
    faction:
      ownerFaction === null && memberFaction !== null
        ? factionName(ctx.nations, memberFaction, text(row.member_code))
        : null,
    score: standing.score,
    tierPm: standing.tierPm,
    top: standing.top,
    me: meOwner !== null && num(row.owner_id) === meOwner,
    detail: null,
  };
}

const FACTION_ROW_SQL = `select s.faction_id, s.score, s.rank, s.prev_rank, s.tier_pm, s.cities, s.humans, s.renown,
         f.kind, f.code
    from ranking_faction_scores s join factions f on f.id = s.faction_id`;

const detailOf = (row: Record<string, unknown>): RankingFactionDetail => ({
  cities: num(row.cities),
  humans: num(row.humans),
  renown: numOrNull(row.renown),
});

function factionRow(
  row: Record<string, unknown>,
  ctx: RankingReadContext,
  total: number,
  mine: number | null,
) {
  const standing = standingOf(row, total, ctx.coefficients.topRanks);
  const id = num(row.faction_id);
  const out: RankingRow = {
    rank: standing.rank,
    prevRank: standing.prevRank,
    kind: row.kind === "player" ? "player_faction" : "npc_faction",
    name: factionName(ctx.nations, id, text(row.code)),
    faction: null,
    score: standing.score,
    tierPm: standing.tierPm,
    top: standing.top,
    me: mine !== null && id === mine,
    detail: detailOf(row),
  };
  return out;
}

async function countOf(db: Queryable, board: Exclude<RankingBoardKey, { kind: "house" }>): Promise<number> {
  const result =
    board.kind === "path"
      ? await db.query(`select count(*)::int as n from ranking_path_scores where path_id = $1`, [board.path])
      : await db.query(`select count(*)::int as n from ranking_faction_scores`);
  return num(result.rows[0]?.n);
}

/** 판 하나(실제 자료) */
export async function readBoard(
  ctx: RankingReadContext,
  userId: string,
  board: RankingBoardKey,
  nowMs: number,
): Promise<RankingBoardResponse> {
  const snapshot = await snapshotInfo(ctx.db, ctx.coefficients);
  // 유저 명성은 아직 쌓는 곳이 없다(정원사 2 — ADR 확인 대기)
  const base = { generatedAt: nowMs, preview: false, snapshot, paths: ctx.paths, board, renown: null };
  const tiers = ctx.coefficients.tiersPm;
  const empty = {
    total: 0,
    rows: [],
    me: null,
    tiers: tiers.toSorted((a, b) => a - b).map((tierPm) => ({ tierPm, minScore: null })),
  };
  if (board.kind !== "faction") {
    const path = ctx.paths.find((entry) => entry.id === board.path);
    if (path === undefined) return { ...base, status: "unknown", ...empty };
    if (!path.open) return { ...base, status: "closed", ...empty };
  }
  // 가문 판(D-569 1746): 경로 점수를 가문원끼리 더해 읽을 때 센다
  if (board.kind === "house")
    return { ...base, status: "ready", ...(await readHouseBoard(ctx, userId, board.path)) };
  const me = await viewerSubjects(ctx.db, userId);
  const total = await countOf(ctx.db, board);
  if (board.kind === "path") {
    const result = await ctx.db.query(
      `${PATH_ROW_SQL} where s.path_id = $1 and (s.rank <= $2 or s.owner_id = $3) order by s.rank, s.owner_id`,
      [board.path, RANKING_BOARD_ROWS, me.ownerId ?? -1],
    );
    const all = result.rows.map((row) => pathRow(row, ctx, total, me.ownerId));
    return {
      ...base,
      status: "ready",
      total,
      rows: all.filter((row) => row.rank <= RANKING_BOARD_ROWS).slice(0, RANKING_BOARD_ROWS),
      me: all.find((row) => row.me) ?? null,
      tiers: await tierCutsOf(ctx.db, "ranking_path_scores", board.path, total, tiers),
    };
  }
  const result = await ctx.db.query(
    `${FACTION_ROW_SQL} where s.rank <= $1 or s.faction_id = $2 order by s.rank, s.faction_id`,
    [RANKING_BOARD_ROWS, me.factionId ?? -1],
  );
  const all = result.rows.map((row) => factionRow(row, ctx, total, me.factionId));
  return {
    ...base,
    status: "ready",
    total,
    rows: all.filter((row) => row.rank <= RANKING_BOARD_ROWS).slice(0, RANKING_BOARD_ROWS),
    me: all.find((row) => row.me) ?? null,
    tiers: await tierCutsOf(ctx.db, "ranking_faction_scores", null, total, tiers),
  };
}

/** 내 경로 자리(연 경로·점수 있는 것만, 점수 높은 순) */
export async function readMyStandings(
  ctx: RankingReadContext,
  ownerId: number | null,
): Promise<RankingMineResponse["standings"]> {
  if (ownerId === null) return [];
  const result = await ctx.db.query(
    `select s.path_id, s.score, s.gain, s.rank, s.prev_rank, s.tier_pm,
            (select count(*)::int from ranking_path_scores x where x.path_id = s.path_id) as total
       from ranking_path_scores s where s.owner_id = $1 order by s.score desc, s.path_id`,
    [ownerId],
  );
  const open = new Set(ctx.paths.filter((path) => path.open).map((path) => path.id));
  return result.rows
    .filter((row) => open.has(String(row.path_id)))
    .map((row) => ({
      path: String(row.path_id),
      standing: standingOf(row, num(row.total), ctx.coefficients.topRanks),
    }));
}

/** 내 자리 한 장(경로 + 세력 + 명성 칸) */
export async function readMine(
  ctx: RankingReadContext,
  userId: string,
  nowMs: number,
): Promise<RankingMineResponse> {
  const [snapshot, me] = await Promise.all([
    snapshotInfo(ctx.db, ctx.coefficients),
    viewerSubjects(ctx.db, userId),
  ]);
  const standings = await readMyStandings(ctx, me.ownerId);
  let faction: RankingMineResponse["faction"] = null;
  if (me.factionId !== null) {
    const total = await countOf(ctx.db, { kind: "faction" });
    const result = await ctx.db.query(`${FACTION_ROW_SQL} where s.faction_id = $1`, [me.factionId]);
    const row = result.rows[0];
    faction = {
      name: factionName(ctx.nations, me.factionId, me.factionCode),
      standing: row === undefined ? null : standingOf(row, total, ctx.coefficients.topRanks),
      detail: row === undefined ? null : detailOf(row),
    };
  }
  return {
    generatedAt: nowMs,
    preview: false,
    snapshot,
    paths: ctx.paths,
    standings,
    faction,
    renown: null,
  };
}
