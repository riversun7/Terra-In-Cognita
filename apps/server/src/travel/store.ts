// 2차맵 사이 이동 저장(world_travels, src/db/travelSchema.ts) — docs/adr/2026-11-07-play-flow.md "WP9". 쓰기는 월드 쓰기 대기열, 읽기는 부팅 복구 때 한 번.
import type { TravelKind } from "@terra/protocol";
import type { CellPoint } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 가는 중인 길(저장하는 칸) */
export interface TravelRecord {
  readonly unitId: number;
  readonly ownerId: number;
  readonly kind: TravelKind;
  /** 지나는 2차맵(출발 포함, 마지막 = 목적 2차맵) */
  readonly route: readonly number[];
  /** 지금 있는 2차맵의 route 차례 */
  leg: number;
  /** 목표 배치 칸(마지막 2차맵 안) */
  readonly target: CellPoint;
  readonly startedAtMs: number;
  /** 보낼 때 잰 도착 예상(보기 값) */
  readonly arriveAtMs: number;
}

const isKind = (value: unknown): value is TravelKind => value === "move" || value === "scout";

/** 그 행성의 가는 중인 길(유닛 ID 차례). 틀린 줄(종류·길·차례)은 뺀다 */
export async function loadTravels(pool: QueryPool, planetId: string): Promise<TravelRecord[]> {
  const result = await pool.query(
    `select unit_id, owner_id, kind, route, leg, target_x, target_y, started_at_ms, arrive_at_ms
     from world_travels where planet_id = $1 order by unit_id`,
    [planetId],
  );
  const out: TravelRecord[] = [];
  for (const row of result.rows) {
    const route = Array.isArray(row.route) ? row.route.map(Number) : [];
    const leg = Number(row.leg);
    if (!isKind(row.kind) || route.length === 0 || !Number.isInteger(leg) || leg < 0 || leg >= route.length)
      continue;
    out.push({
      unitId: Number(row.unit_id),
      ownerId: Number(row.owner_id),
      kind: row.kind,
      route,
      leg,
      target: { x: Number(row.target_x), y: Number(row.target_y) },
      startedAtMs: Number(row.started_at_ms),
      arriveAtMs: Number(row.arrive_at_ms),
    });
  }
  return out;
}

/** 쓰기 대기열 고리(없으면 메모리에만) */
export function travelWriter(writer: WorldWriter | undefined, planetId: string) {
  return {
    save(record: TravelRecord): void {
      writer?.upsert("travels", {
        unit_id: record.unitId,
        owner_id: record.ownerId,
        planet_id: planetId,
        kind: record.kind,
        route: [...record.route],
        leg: record.leg,
        target_x: record.target.x,
        target_y: record.target.y,
        started_at_ms: record.startedAtMs,
        arrive_at_ms: record.arriveAtMs,
      });
    },
    remove(unitId: number): void {
      writer?.remove("travels", { unit_id: unitId });
    },
  };
}
