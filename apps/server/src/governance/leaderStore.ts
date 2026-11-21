// 나라 의결 표 셋째 묶음(SQL만 — 줄기 governance-5, store.ts 줄 수 때문에 따로 둔다): 나라 화폐 단계(nation_monetary — 질문 2453)·지도자 신임도
// (governance_approval — 사용자 답 D-585)·가문 소속 도시(house_homes — 쿠데타로 떨어져 나갈 도시, 질문 2472 [임시]). 표 정의 db/governanceSchema.ts·houseSchema.ts.
import { type HouseKey, type MonetaryMode, isHouseKey } from "@terra/shared/governance";
import type { GovernanceQueryable } from "./store.ts";

export interface MonetaryRow {
  readonly nationId: number;
  readonly mode: MonetaryMode;
  readonly rateBp: number;
}

export interface ApprovalRow {
  readonly nationId: number;
  readonly houseKey: HouseKey | null;
  readonly approval: number;
}

export function createLeaderStore(pool: GovernanceQueryable) {
  return {
    async monetary(): Promise<Map<number, MonetaryRow>> {
      const { rows } = await pool.query("select nation_id, mode, rate_bp from nation_monetary");
      return new Map(
        rows.map((row) => [
          Number(row.nation_id),
          {
            nationId: Number(row.nation_id),
            mode: row.mode === "manual" ? "manual" : "formula",
            rateBp: Number(row.rate_bp),
          },
        ]),
      );
    },
    async saveMonetary(row: MonetaryRow, setBy: string | null, atMs: number): Promise<void> {
      await pool.query(
        `insert into nation_monetary (nation_id, mode, rate_bp, set_at_ms, set_by) values ($1, $2, $3, $4, $5)
         on conflict (nation_id) do update set mode = excluded.mode, rate_bp = excluded.rate_bp, set_at_ms = excluded.set_at_ms,
           set_by = excluded.set_by`,
        [row.nationId, row.mode, row.rateBp, atMs, setBy],
      );
    },
    async approvals(): Promise<Map<number, ApprovalRow>> {
      const { rows } = await pool.query("select nation_id, house_key, approval from governance_approval");
      return new Map(
        rows.map((row) => {
          const key = typeof row.house_key === "string" && isHouseKey(row.house_key) ? row.house_key : null;
          return [
            Number(row.nation_id),
            { nationId: Number(row.nation_id), houseKey: key, approval: Number(row.approval) },
          ];
        }),
      );
    },
    async saveApproval(row: ApprovalRow, atMs: number): Promise<void> {
      await pool.query(
        `insert into governance_approval (nation_id, house_key, approval, set_at_ms) values ($1, $2, $3, $4)
         on conflict (nation_id) do update set house_key = excluded.house_key, approval = excluded.approval, set_at_ms = excluded.set_at_ms`,
        [row.nationId, row.houseKey, row.approval, atMs],
      );
    },
    /** 플레이어 가문(세력 행)의 소속 도시(없으면 빠진다) */
    async houseHomes(rows: readonly number[]): Promise<Map<number, number>> {
      if (rows.length === 0) return new Map();
      const { rows: found } = await pool.query(
        "select faction_id, city_id from house_homes where faction_id = any($1::bigint[])",
        [[...rows]],
      );
      return new Map(found.map((row) => [Number(row.faction_id), Number(row.city_id)]));
    },
  };
}

export type LeaderStore = ReturnType<typeof createLeaderStore>;
