// 나라 의결 표 읽기·쓰기 둘째 묶음(SQL만 — 줄기 governance-3, store.ts 줄 수 때문에 따로 둔다): 지배 쪽 지분 가문(governance_share_houses — 질문
// 2432 나·(다) 답 D-583)·군사 쿠데타(governance_coups·governance_coup_sides — 질문 2433 답·D-583 나 가). 표 정의 db/governanceSchema.ts.
import { type HouseKey, isHouseKey } from "@terra/shared/governance";
import type { GovernanceQueryable } from "./store.ts";

/** 나라 하나의 지배 쪽 지분 가문 기록 */
export interface ShareHouseRow {
  readonly nationId: number;
  readonly houseKey: HouseKey | null;
  /** 지분 과반을 사서 독재가 된 나라 — 국고 지분은 국고에 남긴다(D-583 2432 (다)) */
  readonly treasuryKept: boolean;
}

export type CoupStatus = "gathering" | "won" | "lost" | "cancelled";
export type CoupSide = "rebel" | "government";

export interface CoupRow {
  readonly id: number;
  readonly nationId: number;
  readonly houseKey: HouseKey;
  readonly userId: string | null;
  readonly openedAtMs: number;
  readonly gatherUntilMs: number;
  readonly status: CoupStatus;
  readonly result: Record<string, unknown> | null;
  readonly decidedAtMs: number | null;
}

export interface CoupSideRow {
  readonly coupId: number;
  /** u:<사용자> | n:<NPC 가문> */
  readonly joinerKey: string;
  readonly userId: string | null;
  readonly side: CoupSide;
  readonly power: number;
  readonly joinedAtMs: number;
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);
const STATUSES: readonly CoupStatus[] = ["gathering", "won", "lost", "cancelled"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function coupOf(row: Record<string, unknown>): CoupRow | undefined {
  const key = String(row.house_key);
  if (!isHouseKey(key)) return undefined;
  return {
    id: num(row.id),
    nationId: num(row.nation_id),
    houseKey: key,
    userId: typeof row.user_id === "string" ? row.user_id : null,
    openedAtMs: num(row.opened_at_ms),
    gatherUntilMs: num(row.gather_until_ms),
    status: STATUSES.find((entry) => entry === row.status) ?? "cancelled",
    result: isRecord(row.result) ? row.result : null,
    decidedAtMs: numOrNull(row.decided_at_ms),
  };
}

const COUP_COLUMNS =
  "id, nation_id, house_key, user_id, opened_at_ms, gather_until_ms, status, result, decided_at_ms";

export function createCoupStore(pool: GovernanceQueryable) {
  return {
    async shareHouses(): Promise<Map<number, ShareHouseRow>> {
      const { rows } = await pool.query(
        "select nation_id, house_key, treasury_kept from governance_share_houses",
      );
      return new Map(
        rows.map((row) => {
          const key = typeof row.house_key === "string" && isHouseKey(row.house_key) ? row.house_key : null;
          return [
            num(row.nation_id),
            { nationId: num(row.nation_id), houseKey: key, treasuryKept: row.treasury_kept === true },
          ];
        }),
      );
    },
    async saveShareHouse(row: ShareHouseRow, atMs: number): Promise<void> {
      await pool.query(
        `insert into governance_share_houses (nation_id, house_key, treasury_kept, updated_at_ms) values ($1, $2, $3, $4)
         on conflict (nation_id) do update set house_key = excluded.house_key, treasury_kept = excluded.treasury_kept,
           updated_at_ms = excluded.updated_at_ms`,
        [row.nationId, row.houseKey, row.treasuryKept, atMs],
      );
    },
    async insertCoup(input: {
      nationId: number;
      houseKey: HouseKey;
      userId: string | null;
      openedAtMs: number;
      gatherUntilMs: number;
    }): Promise<CoupRow> {
      const { rows } = await pool.query(
        `insert into governance_coups (nation_id, house_key, user_id, opened_at_ms, gather_until_ms)
         values ($1, $2, $3, $4, $5) returning ${COUP_COLUMNS}`,
        [input.nationId, input.houseKey, input.userId, input.openedAtMs, input.gatherUntilMs],
      );
      const row = rows[0] ? coupOf(rows[0]) : undefined;
      if (!row) throw new Error("coup insert");
      return row;
    },
    async coup(id: number): Promise<CoupRow | undefined> {
      const { rows } = await pool.query(`select ${COUP_COLUMNS} from governance_coups where id = $1`, [id]);
      return rows[0] ? coupOf(rows[0]) : undefined;
    },
    /** 참가 받는 중인 쿠데타(전체) */
    async gathering(): Promise<CoupRow[]> {
      const { rows } = await pool.query(
        `select ${COUP_COLUMNS} from governance_coups where status = 'gathering' order by id`,
      );
      return rows.flatMap((row) => coupOf(row) ?? []);
    },
    /** 그 가문이 가장 최근에 일으킨 쿠데타 시각(쿨타임) */
    async lastCoupOf(houseKey: HouseKey): Promise<number | undefined> {
      const { rows } = await pool.query(
        "select max(opened_at_ms) as at from governance_coups where house_key = $1",
        [houseKey],
      );
      return numOrNull(rows[0]?.at) ?? undefined;
    },
    async finishCoup(
      id: number,
      status: Exclude<CoupStatus, "gathering">,
      result: Record<string, unknown>,
      atMs: number,
    ): Promise<void> {
      await pool.query(
        "update governance_coups set status = $2, result = $3, decided_at_ms = $4 where id = $1 and status = 'gathering'",
        [id, status, JSON.stringify(result), atMs],
      );
    },
    async join(row: CoupSideRow): Promise<void> {
      await pool.query(
        `insert into governance_coup_sides (coup_id, joiner_key, user_id, side, power, joined_at_ms) values ($1, $2, $3, $4, $5, $6)
         on conflict (coup_id, joiner_key) do update set side = excluded.side, power = excluded.power, joined_at_ms = excluded.joined_at_ms`,
        [row.coupId, row.joinerKey, row.userId, row.side, row.power, row.joinedAtMs],
      );
    },
    /** 그 나라 쿠데타(참가 받는 중 전부 + 끝난 것 최근 limit개, 새것부터) */
    async coupsOf(nationId: number, limit: number): Promise<CoupRow[]> {
      const { rows } = await pool.query(
        `(select ${COUP_COLUMNS} from governance_coups where nation_id = $1 and status = 'gathering')
         union all
         (select ${COUP_COLUMNS} from governance_coups where nation_id = $1 and status <> 'gathering' order by id desc limit $2)
         order by id desc`,
        [nationId, limit],
      );
      return rows.flatMap((row) => coupOf(row) ?? []);
    },
    async sides(coupId: number): Promise<CoupSideRow[]> {
      const { rows } = await pool.query(
        `select coup_id, joiner_key, user_id, side, power, joined_at_ms from governance_coup_sides
          where coup_id = $1 order by joined_at_ms, joiner_key`,
        [coupId],
      );
      return rows.map((row) => ({
        coupId: num(row.coup_id),
        joinerKey: String(row.joiner_key),
        userId: typeof row.user_id === "string" ? row.user_id : null,
        side: row.side === "government" ? "government" : "rebel",
        power: num(row.power),
        joinedAtMs: num(row.joined_at_ms),
      }));
    },
  };
}

export type CoupStore = ReturnType<typeof createCoupStore>;
