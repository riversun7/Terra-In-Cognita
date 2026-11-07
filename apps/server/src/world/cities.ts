// 도시(서버) — docs/adr/2026-10-31-faction-society-core.md "서버"
// 규칙(점령·반란·독립·출생·기술)은 @terra/sim society/*이고, 서버는 지금 표(world_cities)와 안전한 곳 찾기만 한다.
// 세계에서 세력·도시를 실제로 돌리는 일(NPC 두뇌, 도시 만들기·점령 명령)은 R5다.
// 시작 도시 차리기: NPC 사회 세계(NPC_SOCIETY, 기본 켬)는 고정 국가마다 시작 도시 여러 곳을 시험 2차맵들에 나눈다(npc/nations.ts
// ensureTestNations, docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗"). NPC 사회를 끈 세계(봇만 걷는 측정·시험)만 옛 방식 그대로
// 시험 NPC 세력에게 시험 2차맵마다 가운데 시작 도시 하나를 둔다(ensureTestStartCities). 진 유닛이 돌아갈 "가장 가까운 안전 도시"가 된다.
import type { CityCell } from "@terra/shared/goodsPlaces";
import { PLACEMENT_SIZE } from "@terra/sim";
import type { QueryPool } from "./persist/load.ts";

export interface CityRow {
  readonly id: number;
  readonly factionId: number;
  readonly planetId: string;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly start: boolean;
  /** 도시 이름(번역 안 함 D-476, NPC 도시는 팩 프리셋 목록 — 기획 답 510 다). 없으면 null(화면이 "도시 N") */
  readonly name?: string | null | undefined;
}

export async function loadCities(pool: QueryPool): Promise<CityRow[]> {
  const result = await pool.query(
    `select id, faction_id, planet_id, map_key, cell_x, cell_y, start, name from world_cities order by id`,
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    factionId: Number(row.faction_id),
    planetId: String(row.planet_id),
    mapKey: Number(row.map_key),
    cellX: Number(row.cell_x),
    cellY: Number(row.cell_y),
    start: row.start === true,
    name: typeof row.name === "string" ? row.name : null,
  }));
}

/**
 * [임시] NPC 사회를 끈 세계의 시작 도시: 시험 NPC 세력에게 2차맵마다 가운데 칸에 하나(없을 때만 넣는다). 세력은 고정(D-324).
 * NPC 사회 세계는 npc/nations.ts ensureTestNations가 시작 도시를 나눈다(국가 1을 모든 2차맵에 두지 않는다)
 */
export async function ensureTestStartCities(
  pool: QueryPool,
  factionCode: string,
  planetId: string,
  mapKeys: readonly number[],
  nowMs: number,
): Promise<void> {
  await pool.query(`update factions set fixed = true where code = $1`, [factionCode]);
  const center = PLACEMENT_SIZE >> 1;
  for (const mapKey of mapKeys)
    await pool.query(
      `insert into world_cities (id, faction_id, planet_id, map_key, cell_x, cell_y, start, housing, research_level, founded_at_ms)
       select coalesce((select max(id) from world_cities), 0) + 1, f.id, $2, $3, $4, $4, true, 40, 1, $5
       from factions f where f.code = $1
       and not exists (select 1 from world_cities c where c.faction_id = f.id and c.planet_id = $2 and c.map_key = $3)`,
      [factionCode, planetId, mapKey, center, nowMs],
    );
}

/**
 * 가장 가까운 안전 도시(질문 108 기본안·D-351): 같은 2차맵에서 그 유닛 세력의 도시이거나 시작 도시(D-341, [임시] 누구에게나
 * 안전한 곳). 칸 거리 제곱이 가장 작은 것, 같으면 작은 ID. 없으면 undefined
 */
export function nearestSafeCity(
  cities: readonly CityRow[],
  planetId: string,
  mapKey: number,
  from: { readonly x: number; readonly y: number },
  factionId: number | null,
): CityRow | undefined {
  let best: CityRow | undefined;
  let bestDistance = 0;
  for (const city of cities) {
    if (city.planetId !== planetId || city.mapKey !== mapKey) continue;
    if (!city.start && city.factionId !== factionId) continue;
    const dx = city.cellX - from.x;
    const dy = city.cellY - from.y;
    const distance = dx * dx + dy * dy;
    if (!best || distance < bestDistance || (distance === bestDistance && city.id < best.id)) {
      best = city;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * 띄운 2차맵의 도시 자리(건물이 선 도시 = 가장 가까운 도시, docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)"):
 * 부팅 때 읽은 도시 + NPC 런타임이 새로 세운 도시(같은 ID면 런타임 값). 폐허(ruins, docs/adr/2026-11-07-ruins-restoration.md)는 도시가
 * 아니라 뺀다(런타임 자리 표에는 칸 오염·복원 자리로 남아 있다)
 */
export function cityCellsOf(
  boot: readonly CityRow[],
  live: ReadonlyMap<number, { planetId: string; mapKey: number; cellX: number; cellY: number }> | undefined,
  planetId: string,
  maps: { has(mapKey: number): boolean },
  ruins?: { has(id: number): boolean },
): CityCell[] {
  const byId = new Map<number, CityCell>();
  for (const city of boot)
    if (city.planetId === planetId && maps.has(city.mapKey))
      byId.set(city.id, { id: city.id, mapKey: city.mapKey, x: city.cellX, y: city.cellY });
  for (const [id, place] of live ?? [])
    if (place.planetId === planetId && maps.has(place.mapKey))
      byId.set(id, { id, mapKey: place.mapKey, x: place.cellX, y: place.cellY });
  return [...byId.values()].filter((cell) => !ruins?.has(cell.id));
}
