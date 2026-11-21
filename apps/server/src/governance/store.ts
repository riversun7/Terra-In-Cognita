// 나라 의결 표 읽기·쓰기(SQL만 — 규칙은 service.ts). 표 정의 db/governanceSchema.ts. docs/adr/2026-11-21-governance.md
import type { AgendaKind, AgendaStatus, GovernanceRegime, HouseKey } from "@terra/shared/governance";
import { AGENDA_KINDS, AGENDA_STATUSES, GOVERNANCE_REGIMES, isHouseKey } from "@terra/shared/governance";

export interface GovernanceQueryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

/** 안건 종류별 칸(jsonb) */
export interface AgendaPayload {
  /** 체제 전환 목표 */
  readonly regime?: GovernanceRegime;
  /** 선전포고 상대(세력 행) */
  readonly targetNationId?: number;
  /** 해임 뒤 다시 뽑기에서 후보가 못 되는 가문 */
  readonly barred?: HouseKey;
  /** 직권 결정(투표 없음 — 독재 지도자, 지분 과반 지도자의 독재 전환) */
  readonly byAuthority?: boolean;
}

/** 셈 결과(jsonb — 무게는 10진 문자열) */
export interface AgendaResultRow {
  readonly reason: string | null;
  readonly yes?: string;
  readonly no?: string;
  readonly abstain: string;
  readonly cast: string;
  readonly electorate: string;
  readonly quorumPm: number;
  readonly thresholdPm: number;
  readonly winner?: HouseKey | null;
  readonly counts?: readonly { readonly key: HouseKey; readonly votes: string }[];
}

export interface AgendaRow {
  readonly id: number;
  readonly nationId: number;
  readonly kind: AgendaKind;
  readonly regime: GovernanceRegime;
  readonly proposerKey: string | null;
  readonly proposerUser: string | null;
  readonly payload: AgendaPayload;
  readonly openedAtMs: number;
  readonly registerUntilMs: number | null;
  readonly closesAtMs: number;
  readonly status: AgendaStatus;
  readonly result: AgendaResultRow | null;
  readonly decidedAtMs: number | null;
  readonly effectAtMs: number | null;
  readonly enactedAtMs: number | null;
}

export interface VoteRow {
  readonly agendaId: number;
  readonly voterKey: string;
  readonly userId: string | null;
  readonly npc: boolean;
  readonly choice: string;
  readonly weight: bigint;
  readonly castAtMs: number;
}

export interface CandidateRow {
  readonly agendaId: number;
  readonly houseKey: HouseKey;
  readonly userId: string | null;
  readonly registeredAtMs: number;
}

export interface StateRow {
  readonly nationId: number;
  readonly rulingHouseKey: HouseKey | null;
  readonly electedAtMs: number | null;
  readonly termEndsAtMs: number | null;
  readonly shareVotesSuspended: boolean;
  /** 지도자 빈자리가 된 시각(질문 2403 답 D-582). 없으면 null */
  readonly vacantSinceMs: number | null;
}

/** 플레이어 가문(그 나라 소속 — 가문장) */
export interface PlayerHouseRow {
  readonly id: number;
  readonly head: string;
  readonly name: string | null;
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list.find((entry) => entry === value) ?? fallback;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function payloadOf(value: unknown): AgendaPayload {
  if (!isRecord(value)) return {};
  const regime = GOVERNANCE_REGIMES.find((entry) => entry === value.regime);
  const target = typeof value.targetNationId === "number" ? value.targetNationId : undefined;
  const barred = typeof value.barred === "string" && isHouseKey(value.barred) ? value.barred : undefined;
  return {
    ...(regime ? { regime } : {}),
    ...(target !== undefined ? { targetNationId: target } : {}),
    ...(barred ? { barred } : {}),
    ...(value.byAuthority === true ? { byAuthority: true } : {}),
  };
}

function resultOf(value: unknown): AgendaResultRow | null {
  if (!isRecord(value)) return null;
  const text = (key: string): string => {
    const field = value[key];
    return typeof field === "string" ? field : "0";
  };
  const counts = Array.isArray(value.counts)
    ? value.counts.flatMap((entry: unknown) =>
        isRecord(entry) && typeof entry.key === "string" && isHouseKey(entry.key)
          ? [{ key: entry.key, votes: typeof entry.votes === "string" ? entry.votes : "0" }]
          : [],
      )
    : undefined;
  const winner = typeof value.winner === "string" && isHouseKey(value.winner) ? value.winner : null;
  return {
    reason: typeof value.reason === "string" ? value.reason : null,
    ...(value.yes === undefined ? {} : { yes: text("yes"), no: text("no") }),
    abstain: text("abstain"),
    cast: text("cast"),
    electorate: text("electorate"),
    quorumPm: typeof value.quorumPm === "number" ? value.quorumPm : 0,
    thresholdPm: typeof value.thresholdPm === "number" ? value.thresholdPm : 0,
    ...(counts ? { counts, winner } : {}),
  };
}

const AGENDA_COLUMNS = `id, nation_id, kind, regime, proposer_key, proposer_user, payload, opened_at_ms, register_until_ms, closes_at_ms,
  status, result, decided_at_ms, effect_at_ms, enacted_at_ms`;

function agendaOf(row: Record<string, unknown>): AgendaRow {
  return {
    id: num(row.id),
    nationId: num(row.nation_id),
    kind: oneOf(AGENDA_KINDS, row.kind, "leader_election"),
    regime: oneOf(GOVERNANCE_REGIMES, row.regime, "democracy"),
    proposerKey: typeof row.proposer_key === "string" ? row.proposer_key : null,
    proposerUser: typeof row.proposer_user === "string" ? row.proposer_user : null,
    payload: payloadOf(row.payload),
    openedAtMs: num(row.opened_at_ms),
    registerUntilMs: numOrNull(row.register_until_ms),
    closesAtMs: num(row.closes_at_ms),
    status: oneOf(AGENDA_STATUSES, row.status, "open"),
    result: resultOf(row.result),
    decidedAtMs: numOrNull(row.decided_at_ms),
    effectAtMs: numOrNull(row.effect_at_ms),
    enactedAtMs: numOrNull(row.enacted_at_ms),
  };
}

export function createGovernanceStore(pool: GovernanceQueryable) {
  return {
    async insertAgenda(input: {
      nationId: number;
      kind: AgendaKind;
      regime: GovernanceRegime;
      proposerKey: string | null;
      proposerUser: string | null;
      payload: AgendaPayload;
      openedAtMs: number;
      registerUntilMs: number | null;
      closesAtMs: number;
      status?: AgendaStatus;
      decidedAtMs?: number | null;
      effectAtMs?: number | null;
    }): Promise<AgendaRow> {
      const { rows } = await pool.query(
        `insert into governance_agendas (nation_id, kind, regime, proposer_key, proposer_user, payload, opened_at_ms,
           register_until_ms, closes_at_ms, status, decided_at_ms, effect_at_ms)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12) returning ${AGENDA_COLUMNS}`,
        [
          input.nationId,
          input.kind,
          input.regime,
          input.proposerKey,
          input.proposerUser,
          JSON.stringify(input.payload),
          input.openedAtMs,
          input.registerUntilMs,
          input.closesAtMs,
          input.status ?? "open",
          input.decidedAtMs ?? null,
          input.effectAtMs ?? null,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("governance agenda insert returned nothing");
      return agendaOf(row);
    },
    async agenda(id: number): Promise<AgendaRow | undefined> {
      const { rows } = await pool.query(`select ${AGENDA_COLUMNS} from governance_agendas where id = $1`, [
        id,
      ]);
      return rows[0] ? agendaOf(rows[0]) : undefined;
    },
    /** 열려 있거나 집행을 기다리는 안건(모든 나라) */
    async activeAgendas(): Promise<AgendaRow[]> {
      const { rows } = await pool.query(
        `select ${AGENDA_COLUMNS} from governance_agendas where status in ('open', 'passed') order by id`,
      );
      return rows.map(agendaOf);
    },
    /** 그 나라의 안건(열린·집행 기다림 전부 + 끝난 것 최근 limit개, 새것부터) */
    async agendasOf(nationId: number, limit: number): Promise<AgendaRow[]> {
      const { rows } = await pool.query(
        `(select ${AGENDA_COLUMNS} from governance_agendas where nation_id = $1 and status in ('open', 'passed'))
         union all
         (select ${AGENDA_COLUMNS} from governance_agendas where nation_id = $1 and status not in ('open', 'passed')
           order by id desc limit $2)
         order by id desc`,
        [nationId, limit],
      );
      return rows.map(agendaOf);
    },
    async finish(
      id: number,
      update: {
        status: AgendaStatus;
        result?: AgendaResultRow | null;
        decidedAtMs?: number | null;
        effectAtMs?: number | null;
        enactedAtMs?: number | null;
      },
    ): Promise<void> {
      await pool.query(
        `update governance_agendas set status = $2, result = coalesce($3::jsonb, result), decided_at_ms = coalesce($4, decided_at_ms),
           effect_at_ms = coalesce($5, effect_at_ms), enacted_at_ms = coalesce($6, enacted_at_ms) where id = $1`,
        [
          id,
          update.status,
          update.result === undefined || update.result === null ? null : JSON.stringify(update.result),
          update.decidedAtMs ?? null,
          update.effectAtMs ?? null,
          update.enactedAtMs ?? null,
        ],
      );
    },
    async votes(agendaIds: readonly number[]): Promise<VoteRow[]> {
      if (agendaIds.length === 0) return [];
      const { rows } = await pool.query(
        `select agenda_id, voter_key, user_id, npc, choice, weight, cast_at_ms from governance_votes
          where agenda_id = any($1::bigint[]) order by agenda_id, cast_at_ms, voter_key`,
        [agendaIds],
      );
      return rows.map((row) => ({
        agendaId: num(row.agenda_id),
        voterKey: String(row.voter_key),
        userId: typeof row.user_id === "string" ? row.user_id : null,
        npc: row.npc === true,
        choice: String(row.choice),
        weight: BigInt(String(row.weight)),
        castAtMs: num(row.cast_at_ms),
      }));
    },
    async castVote(vote: Omit<VoteRow, "castAtMs"> & { castAtMs: number }): Promise<void> {
      await pool.query(
        `insert into governance_votes (agenda_id, voter_key, user_id, npc, choice, weight, cast_at_ms)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (agenda_id, voter_key) do update set user_id = excluded.user_id, npc = excluded.npc, choice = excluded.choice,
           weight = excluded.weight, cast_at_ms = excluded.cast_at_ms`,
        [
          vote.agendaId,
          vote.voterKey,
          vote.userId,
          vote.npc,
          vote.choice,
          vote.weight.toString(),
          vote.castAtMs,
        ],
      );
    },
    async candidates(agendaIds: readonly number[]): Promise<CandidateRow[]> {
      if (agendaIds.length === 0) return [];
      const { rows } = await pool.query(
        `select agenda_id, house_key, user_id, registered_at_ms from governance_candidates
          where agenda_id = any($1::bigint[]) order by agenda_id, registered_at_ms, house_key`,
        [agendaIds],
      );
      return rows.flatMap((row) => {
        const key = String(row.house_key);
        return isHouseKey(key)
          ? [
              {
                agendaId: num(row.agenda_id),
                houseKey: key,
                userId: typeof row.user_id === "string" ? row.user_id : null,
                registeredAtMs: num(row.registered_at_ms),
              },
            ]
          : [];
      });
    },
    async register(
      agendaId: number,
      houseKey: HouseKey,
      userId: string | null,
      atMs: number,
    ): Promise<boolean> {
      const { rowCount } = await pool.query(
        `insert into governance_candidates (agenda_id, house_key, user_id, registered_at_ms) values ($1, $2, $3, $4)
         on conflict do nothing`,
        [agendaId, houseKey, userId, atMs],
      );
      return (rowCount ?? 0) > 0;
    },
    async states(): Promise<Map<number, StateRow>> {
      const { rows } = await pool.query(
        `select nation_id, ruling_house_key, elected_at_ms, term_ends_at_ms, share_votes_suspended, vacant_since_ms
           from governance_state`,
      );
      return new Map(
        rows.map((row) => {
          const key = typeof row.ruling_house_key === "string" ? row.ruling_house_key : null;
          return [
            num(row.nation_id),
            {
              nationId: num(row.nation_id),
              rulingHouseKey: key !== null && isHouseKey(key) ? key : null,
              electedAtMs: numOrNull(row.elected_at_ms),
              termEndsAtMs: numOrNull(row.term_ends_at_ms),
              shareVotesSuspended: row.share_votes_suspended === true,
              vacantSinceMs: numOrNull(row.vacant_since_ms),
            },
          ];
        }),
      );
    },
    async saveState(state: StateRow, atMs: number): Promise<void> {
      await pool.query(
        `insert into governance_state (nation_id, ruling_house_key, elected_at_ms, term_ends_at_ms, share_votes_suspended, updated_at_ms,
           vacant_since_ms)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (nation_id) do update set ruling_house_key = excluded.ruling_house_key, elected_at_ms = excluded.elected_at_ms,
           term_ends_at_ms = excluded.term_ends_at_ms, share_votes_suspended = excluded.share_votes_suspended,
           updated_at_ms = excluded.updated_at_ms, vacant_since_ms = excluded.vacant_since_ms`,
        [
          state.nationId,
          state.rulingHouseKey,
          state.electedAtMs,
          state.termEndsAtMs,
          state.shareVotesSuspended,
          atMs,
          state.vacantSinceMs,
        ],
      );
    },
    /** 처음 지분을 세운 가문으로 옮긴 도시(D-582 — 도시마다 한 번) */
    async fixedCities(): Promise<Set<number>> {
      const { rows } = await pool.query("select city_id from governance_share_fixups");
      return new Set(rows.map((row) => num(row.city_id)));
    },
    async markFixed(cityId: number, houseKey: HouseKey, shares: bigint, atMs: number): Promise<void> {
      await pool.query(
        `insert into governance_share_fixups (city_id, house_key, shares, done_at_ms) values ($1, $2, $3, $4)
         on conflict (city_id) do nothing`,
        [cityId, houseKey, shares.toString(), atMs],
      );
    },
    /**
     * 그 나라 소속 플레이어 가문과 가문장(houseTies.ts와 같은 규칙): 그 가문 자신(독립 가문 나라), 도시를 가진 봉신(parent_id), 도시 없는 가문의
     * 소속 도시 나라(born_of). 해산한 가문은 뺀다
     */
    async playerHousesOf(nationId: number): Promise<PlayerHouseRow[]> {
      const { rows } = await pool.query(
        `select f.id, m.user_id, p.name from factions f
           join house_members m on m.faction_id = f.id and m.role = 'leader'
           left join faction_profiles p on p.faction_id = f.id
          where f.kind = 'player' and f.dissolved_at_ms is null and (
            f.id = $1
            or (f.parent_id = $1 and exists (select 1 from world_owners o where o.faction_id = f.id))
            or (f.born_of = $1 and not exists (select 1 from world_owners o where o.faction_id = f.id)))
          order by f.id`,
        [nationId],
      );
      return rows.map((row) => ({
        id: num(row.id),
        head: String(row.user_id),
        name: typeof row.name === "string" ? row.name : null,
      }));
    },
    /** 플레이어 가문의 가문장(해산하지 않은 가문) */
    async headOf(houseRow: number): Promise<string | undefined> {
      const { rows } = await pool.query(
        `select m.user_id from house_members m join factions f on f.id = m.faction_id
          where m.faction_id = $1 and m.role = 'leader' and f.dissolved_at_ms is null`,
        [houseRow],
      );
      return rows[0] ? String(rows[0].user_id) : undefined;
    },
    /** 가문 이름(플레이어 = 세력 정체성 이름, NPC = 성) */
    async houseNames(keys: readonly string[]): Promise<Map<string, string>> {
      const player = keys.filter((key) => key.startsWith("p:")).map((key) => Number(key.slice(2)));
      const npc = keys.filter((key) => key.startsWith("n:")).map((key) => Number(key.slice(2)));
      const out = new Map<string, string>();
      if (player.length > 0) {
        const { rows } = await pool.query(
          "select faction_id, name from faction_profiles where faction_id = any($1::bigint[])",
          [player],
        );
        for (const row of rows) out.set(`p:${num(row.faction_id)}`, String(row.name));
      }
      if (npc.length > 0) {
        const { rows } = await pool.query("select id, name from npc_houses where id = any($1::bigint[])", [
          npc,
        ]);
        for (const row of rows) out.set(`n:${num(row.id)}`, String(row.name));
      }
      return out;
    },
    /** 사용자 이름(사이보그 이름) */
    async userNames(userIds: readonly string[]): Promise<Map<string, string>> {
      if (userIds.length === 0) return new Map();
      const { rows } = await pool.query("select user_id, name from cyborgs where user_id = any($1::uuid[])", [
        userIds,
      ]);
      return new Map(rows.map((row) => [String(row.user_id), String(row.name)]));
    },
    /** 나라 이름 재료(세력 행 → 코드·정체성 이름) */
    async factionLabels(
      rowIds: readonly number[],
    ): Promise<Map<number, { code: string | null; name: string | null }>> {
      if (rowIds.length === 0) return new Map();
      const { rows } = await pool.query(
        `select f.id, f.code, p.name from factions f left join faction_profiles p on p.faction_id = f.id
          where f.id = any($1::bigint[])`,
        [rowIds],
      );
      return new Map(
        rows.map((row) => [
          num(row.id),
          {
            code: typeof row.code === "string" ? row.code : null,
            name: typeof row.name === "string" ? row.name : null,
          },
        ]),
      );
    },
    /**
     * 가문 판 점수(동점 둘째 규칙 — 2360 나) [임시 질문 2402]: 가문 몫 점수(ranking_house_scores) 모든 경로 합. 가문원 점수는 넣지 않는다
     */
    async boardScores(keys: readonly string[]): Promise<Map<string, number>> {
      const out = new Map<string, number>();
      if (keys.length === 0) return out;
      const { rows } = await pool.query(
        "select npc, house_id, sum(score)::bigint as score from ranking_house_scores group by npc, house_id",
      );
      const wanted = new Set(keys);
      for (const row of rows) {
        const key = `${row.npc === true ? "n" : "p"}:${num(row.house_id)}`;
        if (wanted.has(key)) out.set(key, num(row.score));
      }
      return out;
    },
  };
}

export type GovernanceStore = ReturnType<typeof createGovernanceStore>;
