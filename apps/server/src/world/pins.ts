// 2차맵 고정본(second_map_pins)과 옛 시험 2차맵 정리 — ADR 2026-10-31-second-map-from-planet 6·8절, 사용자 결정 U4 (가)
// - 고정본: 플레이어가 처음 손댄 2차맵의 그때 지형 파일(gzip). 부팅 때 먼저 읽고(있으면 생성기를 부르지 않는다), 처음 손댈 때 쓴다.
// - 옛 시험 2차맵 정리: S1 임시 지형 시절 시험 2차맵(깊은 바다 위)의 유닛·건물·탐사 기록을 지운다(시험 자료뿐).
//   부팅마다 부르지만 지울 것이 없으면 아무것도 하지 않는다. 지우면 감사 기록을 남긴다.
import type { QueryPool } from "./persist/load.ts";
import type { WriterPool } from "./persist/writer.ts";

export interface MapPin {
  mapKey: number;
  terrainVersion: string;
  tctrGzip: Uint8Array;
}

/** 이 행성의 고정본(2차맵 키 목록 안). 없는 키는 빠진다 */
export async function loadPins(
  db: QueryPool,
  planetId: string,
  mapKeys: readonly number[],
): Promise<Map<number, MapPin>> {
  const found = await db.query(
    `select map_key, terrain_version, tctr_gzip from second_map_pins where planet_id = $1 and map_key = any($2::bigint[])`,
    [planetId, mapKeys.map(String)],
  );
  const out = new Map<number, MapPin>();
  for (const row of found.rows) {
    const mapKey = Number(row.map_key);
    const bytes: unknown = row.tctr_gzip;
    if (
      !Number.isSafeInteger(mapKey) ||
      typeof row.terrain_version !== "string" ||
      !(bytes instanceof Uint8Array)
    ) {
      continue;
    }
    out.set(mapKey, { mapKey, terrainVersion: row.terrain_version, tctrGzip: new Uint8Array(bytes) });
  }
  return out;
}

/** 고정본을 쓴다(이미 있으면 그대로 둔다: 처음 손댄 때의 지형이 고정본이다) */
export async function savePin(db: QueryPool, planetId: string, pin: MapPin, atMs: number): Promise<void> {
  await db.query(
    `insert into second_map_pins (planet_id, map_key, terrain_version, tctr_gzip, pinned_at_ms)
     values ($1, $2, $3, $4, $5) on conflict (planet_id, map_key) do nothing`,
    [planetId, pin.mapKey, pin.terrainVersion, Buffer.from(pin.tctrGzip), atMs],
  );
}

export interface RetiredMaps {
  units: number;
  buildings: number;
  exploration: number;
}

/**
 * 옛 시험 2차맵의 유닛·건물·탐사 기록을 한 트랜잭션으로 지운다. 지운 것이 있으면 감사 기록(system, world.retire_test_maps).
 * 고정본은 지우지 않는다(옛 시험 2차맵은 고정본이 없다: S1 임시 지형은 고정본을 쓰지 않았다).
 */
export async function retireTestMaps(
  db: WriterPool,
  planetId: string,
  mapKeys: readonly number[],
): Promise<RetiredMaps> {
  const keys = mapKeys.map(String);
  const client = await db.connect();
  try {
    await client.query("begin");
    const count = async (table: string): Promise<number> => {
      const result = await client.query(
        `with gone as (delete from ${table} where planet_id = $1 and map_key = any($2::bigint[]) returning 1)
         select count(*)::int as n from gone`,
        [planetId, keys],
      );
      const n = firstRow(result)?.n;
      return typeof n === "number" ? n : 0;
    };
    const exploration = await count("world_exploration");
    const buildings = await count("world_buildings");
    const units = await count("world_units");
    if (units + buildings + exploration > 0) {
      await client.query(
        `insert into audit_log (actor_kind, action, before, meta) values ('system', 'world.retire_test_maps', $1, $2)`,
        [
          JSON.stringify({ units, buildings, exploration }),
          JSON.stringify({ planetId, mapKeys: keys.length, reason: "test maps moved to land (ADR 46 U4)" }),
        ],
      );
    }
    await client.query("commit");
    return { units, buildings, exploration };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** pg 결과(unknown)의 첫 줄 */
function firstRow(result: unknown): Record<string, unknown> | undefined {
  if (result === null || typeof result !== "object" || !("rows" in result) || !Array.isArray(result.rows)) {
    return undefined;
  }
  const row: unknown = result.rows[0];
  return row !== null && typeof row === "object" ? Object.fromEntries(Object.entries(row)) : undefined;
}
