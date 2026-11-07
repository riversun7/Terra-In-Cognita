// 2차맵 사이 이동 저장(world_travels, src/db/travelSchema.ts) — docs/adr/2026-11-07-play-flow.md "WP9"·"WP11". 쓰기는 월드 쓰기 대기열,
// 읽기는 부팅 복구 때 한 번.
import type { TravelKind } from "@terra/protocol";
import type { CellPoint } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 출발 자리(정찰이 돌아올 곳, 질문 591 나) */
export interface TravelOrigin {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

/** 가는 중인 길(저장하는 칸) */
export interface TravelRecord {
  readonly unitId: number;
  readonly ownerId: number;
  /** 보낸 사용자(탐사 기록을 그 사용자에게 남긴다). 옛 줄은 null */
  readonly userId: string | null;
  readonly kind: TravelKind;
  /** 지나는 2차맵(출발 포함, 마지막 = 목적 2차맵). 띄우지 않은 2차맵도 든다(건너뛰는 구간). 정찰이 돌아오면 돌아오는 줄로 바뀐다 */
  route: readonly number[];
  /** 지금 있는 2차맵의 route 차례(건너뛰는 중이면 첫 띄우지 않은 2차맵 차례) */
  leg: number;
  /** 목표 배치 칸(마지막 2차맵 안) */
  target: CellPoint;
  readonly startedAtMs: number;
  /** 보낼 때 잰 도착 예상(보기 값, 정찰이 돌아오기 시작하면 다시 잰다) */
  arriveAtMs: number;
  /** 출발 자리(옛 줄은 null — 정찰이 돌아오지 않고 선다) */
  readonly origin: TravelOrigin | null;
  /** 정찰한 2차맵(값이 있으면 돌아오는 중) */
  scoutedMapKey: number | null;
  /** 건너뛰는 중이면 나타나는 시각 */
  hiddenUntilMs: number | null;
}

const isKind = (value: unknown): value is TravelKind => value === "move" || value === "scout";
const numberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** 그 행성의 가는 중인 길(유닛 ID 차례). 틀린 줄(종류·길·차례)은 뺀다 */
export async function loadTravels(pool: QueryPool, planetId: string): Promise<TravelRecord[]> {
  const result = await pool.query(
    `select unit_id, owner_id, user_id, kind, route, leg, target_x, target_y, started_at_ms, arrive_at_ms,
            origin_map_key, origin_x, origin_y, scouted_map_key, hidden_until_ms
     from world_travels where planet_id = $1 order by unit_id`,
    [planetId],
  );
  const out: TravelRecord[] = [];
  for (const row of result.rows) {
    const route = Array.isArray(row.route) ? row.route.map(Number) : [];
    const leg = Number(row.leg);
    if (!isKind(row.kind) || route.length === 0 || !Number.isInteger(leg) || leg < 0 || leg >= route.length)
      continue;
    const originMap = numberOrNull(row.origin_map_key);
    const originX = numberOrNull(row.origin_x);
    const originY = numberOrNull(row.origin_y);
    out.push({
      unitId: Number(row.unit_id),
      ownerId: Number(row.owner_id),
      userId: typeof row.user_id === "string" ? row.user_id : null,
      kind: row.kind,
      route,
      leg,
      target: { x: Number(row.target_x), y: Number(row.target_y) },
      startedAtMs: Number(row.started_at_ms),
      arriveAtMs: Number(row.arrive_at_ms),
      origin:
        originMap === null || originX === null || originY === null
          ? null
          : { mapKey: originMap, x: originX, y: originY },
      scoutedMapKey: numberOrNull(row.scouted_map_key),
      hiddenUntilMs: numberOrNull(row.hidden_until_ms),
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
        user_id: record.userId,
        kind: record.kind,
        route: [...record.route],
        leg: record.leg,
        target_x: record.target.x,
        target_y: record.target.y,
        started_at_ms: record.startedAtMs,
        arrive_at_ms: record.arriveAtMs,
        origin_map_key: record.origin?.mapKey ?? null,
        origin_x: record.origin?.x ?? null,
        origin_y: record.origin?.y ?? null,
        scouted_map_key: record.scoutedMapKey,
        hidden_until_ms: record.hiddenUntilMs,
      });
    },
    remove(unitId: number): void {
      writer?.remove("travels", { unit_id: unitId });
    },
  };
}
