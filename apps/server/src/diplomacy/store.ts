// 조약·참전 요청 표 읽기·쓰기(SQL만 — 규칙은 service.ts). 표 정의 db/diplomacySchema.ts. docs/adr/2026-11-21-diplomacy-treaties.md
import {
  TREATY_STATES,
  type TreatyClause,
  type TreatyState,
  WAR_JOIN_STATES,
  type WarJoinState,
} from "@terra/shared/treaty";
import type { GovernanceQueryable } from "../governance/store.ts";
import { clausesOf } from "./clauses.ts";

export interface TreatyRow {
  readonly id: number;
  readonly nationA: number;
  readonly nationB: number;
  readonly authorNation: number;
  readonly revision: number;
  readonly clauses: readonly TreatyClause[];
  readonly days: number;
  readonly state: TreatyState;
  readonly authorReady: boolean;
  readonly agendaId: number | null;
  readonly agendaNation: number | null;
  readonly respondByMs: number | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly activatedAtMs: number | null;
  readonly expiresAtMs: number | null;
  readonly endedAtMs: number | null;
  readonly nextTributeMs: number | null;
  /** 위반(broken)으로 끝났을 때 어긴 나라(맺은 동안 선포한 나라 — 줄기 fixes-1117c). 모르면·위반이 아니면 null */
  readonly brokenBy: number | null;
}

export interface WarJoinRow {
  readonly id: number;
  readonly treatyId: number;
  readonly requesterNation: number;
  readonly joinerNation: number;
  readonly enemyNation: number;
  readonly state: WarJoinState;
  readonly auto: boolean;
  readonly createdAtMs: number;
  readonly respondByMs: number;
  readonly decidedAtMs: number | null;
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list.find((entry) => entry === value) ?? fallback;

const TREATY_COLUMNS = `id, nation_a, nation_b, author_nation, revision, clauses, days, state, author_ready, agenda_id, agenda_nation,
  respond_by_ms, created_at_ms, updated_at_ms, activated_at_ms, expires_at_ms, ended_at_ms, next_tribute_ms, broken_by`;

function treatyOf(row: Record<string, unknown>): TreatyRow {
  return {
    id: num(row.id),
    nationA: num(row.nation_a),
    nationB: num(row.nation_b),
    authorNation: num(row.author_nation),
    revision: num(row.revision),
    clauses: clausesOf(row.clauses),
    days: num(row.days),
    state: oneOf(TREATY_STATES, row.state, "declined"),
    authorReady: row.author_ready === true,
    agendaId: numOrNull(row.agenda_id),
    agendaNation: numOrNull(row.agenda_nation),
    respondByMs: numOrNull(row.respond_by_ms),
    createdAtMs: num(row.created_at_ms),
    updatedAtMs: num(row.updated_at_ms),
    activatedAtMs: numOrNull(row.activated_at_ms),
    expiresAtMs: numOrNull(row.expires_at_ms),
    endedAtMs: numOrNull(row.ended_at_ms),
    nextTributeMs: numOrNull(row.next_tribute_ms),
    brokenBy: numOrNull(row.broken_by),
  };
}

const JOIN_COLUMNS = `id, treaty_id, requester_nation, joiner_nation, enemy_nation, state, auto, created_at_ms, respond_by_ms, decided_at_ms`;

function joinOf(row: Record<string, unknown>): WarJoinRow {
  return {
    id: num(row.id),
    treatyId: num(row.treaty_id),
    requesterNation: num(row.requester_nation),
    joinerNation: num(row.joiner_nation),
    enemyNation: num(row.enemy_nation),
    state: oneOf(WAR_JOIN_STATES, row.state, "lapsed"),
    auto: row.auto === true,
    createdAtMs: num(row.created_at_ms),
    respondByMs: num(row.respond_by_ms),
    decidedAtMs: numOrNull(row.decided_at_ms),
  };
}

export function createDiplomacyStore(pool: GovernanceQueryable) {
  return {
    async insertTreaty(input: {
      nationA: number;
      nationB: number;
      clauses: readonly TreatyClause[];
      days: number;
      atMs: number;
    }): Promise<TreatyRow> {
      const { rows } = await pool.query(
        `insert into diplomacy_treaties (nation_a, nation_b, author_nation, revision, clauses, days, state, author_ready, created_at_ms, updated_at_ms)
         values ($1, $2, $1, 0, $3::jsonb, $4, 'proposed', false, $5, $5) returning ${TREATY_COLUMNS}`,
        [input.nationA, input.nationB, JSON.stringify(input.clauses), input.days, input.atMs],
      );
      const row = rows[0];
      if (!row) throw new Error("treaty insert");
      return treatyOf(row);
    },
    /** 바뀌는 칸을 모두 쓴다(서버 하나 — 외교 서비스가 의결 사슬에서 순서대로 쓴다) */
    async saveTreaty(row: TreatyRow, atMs: number): Promise<void> {
      await pool.query(
        `update diplomacy_treaties set author_nation = $2, revision = $3, clauses = $4::jsonb, days = $5, state = $6, author_ready = $7,
           agenda_id = $8, agenda_nation = $9, respond_by_ms = $10, updated_at_ms = $11, activated_at_ms = $12, expires_at_ms = $13,
           ended_at_ms = $14, next_tribute_ms = $15, broken_by = $16
         where id = $1`,
        [
          row.id,
          row.authorNation,
          row.revision,
          JSON.stringify(row.clauses),
          row.days,
          row.state,
          row.authorReady,
          row.agendaId,
          row.agendaNation,
          row.respondByMs,
          atMs,
          row.activatedAtMs,
          row.expiresAtMs,
          row.endedAtMs,
          row.nextTributeMs,
          row.brokenBy,
        ],
      );
    },
    async treaty(id: number): Promise<TreatyRow | undefined> {
      const { rows } = await pool.query(`select ${TREATY_COLUMNS} from diplomacy_treaties where id = $1`, [
        id,
      ]);
      return rows[0] ? treatyOf(rows[0]) : undefined;
    },
    /** 그 나라가 든 조약(새것부터) */
    async treatiesOf(nationId: number, limit: number): Promise<TreatyRow[]> {
      const { rows } = await pool.query(
        `select ${TREATY_COLUMNS} from diplomacy_treaties where nation_a = $1 or nation_b = $1 order by id desc limit $2`,
        [nationId, limit],
      );
      return rows.map(treatyOf);
    },
    /**
     * 위반 기록(어긴 나라를 아는 위반 조약 — 어긴 나라·끝난 시각·피해 나라 = 조약의 다른 쪽, 차례대로). 위반 장부를 켤 때 읽는다(줄기 fixes-1117c, 피해 나라는 fixes-d592 —
     * 2584 다 제재 명분)
     */
    async breaches(): Promise<
      { readonly nationId: number; readonly atMs: number; readonly victim: number }[]
    > {
      const { rows } = await pool.query(
        `select broken_by, ended_at_ms, nation_a, nation_b from diplomacy_treaties where state = 'broken' and broken_by is not null order by id`,
      );
      return rows.map((row) => {
        const nationId = num(row.broken_by);
        return {
          nationId,
          atMs: num(row.ended_at_ms),
          victim: nationId === num(row.nation_a) ? num(row.nation_b) : num(row.nation_a),
        };
      });
    },
    /** 선포 기록을 쓴다(쌍마다 가장 최근 하나 — 더 오래된 선포는 덮지 않는다, 줄기 gov-fix-3 질문 2582). 나라는 세력 행 */
    async saveDeclaration(declarer: number, target: number, atMs: number): Promise<void> {
      if (declarer === target) return;
      await pool.query(
        `insert into diplomacy_declarations (nation_a, nation_b, declarer, at_ms) values (least($1::bigint, $2::bigint), greatest($1::bigint, $2::bigint), $1, $3)
         on conflict (nation_a, nation_b) do update set declarer = excluded.declarer, at_ms = excluded.at_ms
         where excluded.at_ms >= diplomacy_declarations.at_ms`,
        [declarer, target, atMs],
      );
    },
    /** 선포 기록(위반 장부를 켤 때 읽는다 — 선포한 나라·상대·시각, 시각 차례) */
    async declarations(): Promise<
      { readonly declarer: number; readonly target: number; readonly atMs: number }[]
    > {
      const { rows } = await pool.query(
        `select nation_a, nation_b, declarer, at_ms from diplomacy_declarations order by at_ms, nation_a, nation_b`,
      );
      return rows.map((row) => {
        const declarer = num(row.declarer);
        return {
          declarer,
          target: declarer === num(row.nation_a) ? num(row.nation_b) : num(row.nation_a),
          atMs: num(row.at_ms),
        };
      });
    },
    /** 세력 쌍 호감을 쓴다(쌍마다 한 줄 — 줄기 gov-fix-4, affinity.ts). 나라는 세력 행, a < b */
    async saveAffinity(a: number, b: number, score: number, atMs: number): Promise<void> {
      if (a === b) return;
      await pool.query(
        `insert into diplomacy_affinity (nation_a, nation_b, score, updated_at_ms) values (least($1::bigint, $2::bigint), greatest($1::bigint, $2::bigint), $3, $4)
         on conflict (nation_a, nation_b) do update set score = excluded.score, updated_at_ms = excluded.updated_at_ms`,
        [a, b, score, atMs],
      );
    },
    /** 세력 쌍 호감(호감 장부를 켤 때 읽는다) */
    async affinities(): Promise<{ readonly a: number; readonly b: number; readonly score: number }[]> {
      const { rows } = await pool.query(
        `select nation_a, nation_b, score from diplomacy_affinity order by nation_a, nation_b`,
      );
      return rows.map((row) => ({ a: num(row.nation_a), b: num(row.nation_b), score: num(row.score) }));
    },
    /** 열린 조약과 맺은 조약(틱 — 차례대로) */
    async liveTreaties(): Promise<TreatyRow[]> {
      const { rows } = await pool.query(
        `select ${TREATY_COLUMNS} from diplomacy_treaties where state in ('proposed', 'negotiating', 'active') order by id`,
      );
      return rows.map(treatyOf);
    },
    async insertJoin(input: {
      treatyId: number;
      requesterNation: number;
      joinerNation: number;
      enemyNation: number;
      auto: boolean;
      atMs: number;
      respondByMs: number;
    }): Promise<WarJoinRow> {
      const { rows } = await pool.query(
        `insert into diplomacy_war_joins (treaty_id, requester_nation, joiner_nation, enemy_nation, state, auto, created_at_ms, respond_by_ms)
         values ($1, $2, $3, $4, 'requested', $5, $6, $7) returning ${JOIN_COLUMNS}`,
        [
          input.treatyId,
          input.requesterNation,
          input.joinerNation,
          input.enemyNation,
          input.auto,
          input.atMs,
          input.respondByMs,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("war join insert");
      return joinOf(row);
    },
    async finishJoin(
      id: number,
      state: WarJoinState,
      atMs: number,
      note: Record<string, unknown>,
    ): Promise<void> {
      await pool.query(
        "update diplomacy_war_joins set state = $2, decided_at_ms = $3, note = $4::jsonb where id = $1",
        [id, state, atMs, JSON.stringify(note)],
      );
    },
    async join(id: number): Promise<WarJoinRow | undefined> {
      const { rows } = await pool.query(`select ${JOIN_COLUMNS} from diplomacy_war_joins where id = $1`, [
        id,
      ]);
      return rows[0] ? joinOf(rows[0]) : undefined;
    },
    /** 그 나라가 요청했거나 받은 참전 요청(새것부터) */
    async joinsOf(nationId: number, limit: number): Promise<WarJoinRow[]> {
      const { rows } = await pool.query(
        `select ${JOIN_COLUMNS} from diplomacy_war_joins where requester_nation = $1 or joiner_nation = $1 order by id desc limit $2`,
        [nationId, limit],
      );
      return rows.map(joinOf);
    },
    /** 답 기다리는 참전 요청(틱) */
    async openJoins(): Promise<WarJoinRow[]> {
      const { rows } = await pool.query(
        `select ${JOIN_COLUMNS} from diplomacy_war_joins where state = 'requested' order by id`,
      );
      return rows.map(joinOf);
    },
    /**
     * 그 조약에서 그 적을 두고 낸 요청이 있나(같은 요청을 두 번 내지 않는다). liveOnly = 요청됨·참가함만(사람이 다시 요청할 때), 아니면 끝난 것까지(보호 조약의
     * 저절로 요청은 조약·적마다 한 번 [임시 2555])
     */
    async joinExists(
      treatyId: number,
      joinerNation: number,
      enemyNation: number,
      liveOnly: boolean,
    ): Promise<boolean> {
      const { rows } = await pool.query(
        `select 1 from diplomacy_war_joins where treaty_id = $1 and joiner_nation = $2 and enemy_nation = $3
           and ($4::boolean = false or state in ('requested', 'joined')) limit 1`,
        [treatyId, joinerNation, enemyNation, liveOnly],
      );
      return rows.length > 0;
    },
  };
}

export type DiplomacyStore = ReturnType<typeof createDiplomacyStore>;
