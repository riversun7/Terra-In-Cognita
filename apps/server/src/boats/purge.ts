// 옛 배·부두 지우기(부팅 한 번) — 기획 D-547 1499 "배·부두만 지움": 지금 세계의 배와 부두를 지우고 새 규칙(조선소·정박장·교역 부두)으로 시작한다.
// 세계의 나머지는 그대로다(리셋 아님). docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15)" 9절.
// - 행성마다 한 번: boat_resets 줄이 있으면 아무것도 하지 않는다(다시 켜도 같다 — 멱등). 지운 뒤 쓰기 대기열이 커밋되기를 기다리고 나서 표지·감사 기록을 넣는다
//   (그 전에 꺼지면 다음 부팅이 남은 것을 다시 지운다).
// - 배: 탄 유닛을 먼저 배 둘레 땅 칸에 내린다(가까운 칸부터, LAND_RING 안). 땅이 없으면 가장 가까운 안전한 곳으로 옮긴다. 그다음 배 유닛을 지운다.
//   띄우지 않은 2차맵에 남은 배 유닛 줄도 지운다(그 2차맵을 띄울 때 승객은 2차맵이 안전한 곳에 내린다 — secondMap.ts 승객 다시 붙이기).
// - 조선소 작업(옛 부두 배 만들기 boat_jobs)·배 상태·배 시설 설정 줄을 모두 지운다. 뺀 재료는 돌려주지 않는다(D-545 1405와 같다 — 감사 기록에 남긴다).
// - 부두(시설 ID dock — 새 규칙에서는 같은 ID가 정박장이다): 띄운 2차맵에서 건물을 지운다. 건물 창고(사업장 창고)에 든 물건은 주인마다 그 도시 창고로,
//   화폐는 주인 지갑으로 먼저 옮긴다(rehomeBuildingGoods). 시설 줄·작업은 건물 서비스의 노화 틱이 치운다(관리자 지움과 같은 길). 부두는 일자리가 0이라
//   노동 계약·직무 배치가 없다. 안에 머물던 유닛은 건물이 없어진 자리에 그대로 선다.
import { anchorAt, positionAt } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { PlaceWorld } from "../facilities/places.ts";
import { rehomeBuildingGoods } from "../facilities/storage.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { UNIT_KIND_BOAT } from "../world/unitKinds.ts";
import { ringCells } from "./service.ts";

/** 옛 부두 시설 ID(새 규칙에서는 정박장이 이 ID를 이어 쓴다) */
export const LEGACY_DOCK_ID = "dock";
/** 승객을 내릴 땅 칸을 찾는 거리(배치 칸) */
const LAND_RING = 24;

export interface BoatPurgeReport {
  /** 지운 배(띄운 2차맵) */
  readonly boats: readonly { readonly boatId: number; readonly ownerId: number; readonly mapKey: number }[];
  /** 띄우지 않은 2차맵에서 지운 배 유닛 줄 수 */
  readonly unloadedBoats: number;
  /** 배 둘레 땅에 내린 승객 / 안전한 곳으로 옮긴 승객 */
  readonly landed: number;
  readonly relocated: number;
  /** 지운 조선소 작업 줄(옛 부두 배 만들기) — 뺀 재료는 기록만 */
  readonly jobs: readonly { readonly id: number; readonly ownerId: number; readonly materials: unknown }[];
  /** 지운 부두 */
  readonly docks: readonly {
    readonly buildingId: number;
    readonly ownerId: number | null;
    readonly mapKey: number;
    readonly level: number;
    readonly cityId: number | null;
    /** 주인에게 돌려놓은 건물 창고 계정 수 */
    readonly rehomed: number;
  }[];
  /** 띄우지 않은 2차맵에 남아 지우지 못한 부두 건물 ID(다음 부팅 때 그 2차맵이 뜨면 정박장으로 남는다) */
  readonly unloadedDocks: readonly number[];
}

export interface BoatPurgeDeps {
  readonly pool: QueryPool;
  readonly planetId: string;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly places: PlaceWorld;
  readonly ledger: Ledger;
  readonly now: () => number;
  /** 지금까지 넣은 쓰기가 커밋되기를 기다린다 */
  durable(): Promise<void>;
  readonly log: { info(obj: object, message: string): void };
}

/** 이미 지웠나 */
export async function boatPurgeDone(pool: QueryPool, planetId: string): Promise<boolean> {
  const found = await pool.query(`select 1 from boat_resets where planet_id = $1`, [planetId]);
  return found.rows.length > 0;
}

/** 탄 유닛을 배 둘레 땅에 내린다(못 내리면 안전한 곳으로). [내림, 옮김] */
function landRiders(map: SecondMap, boatId: number, nowMs: number): [number, number] {
  const riders = map.passengers(boatId);
  if (riders.length === 0) return [0, 0];
  const info = map.unitInfo(boatId);
  if (!info) return [0, 0];
  const at = anchorAt(positionAt(info.motion, nowMs), info.size);
  const rect = { x: at.x, y: at.y, width: info.size, height: info.size };
  let landed = 0;
  let relocated = 0;
  for (const [index, riderId] of riders.entries()) {
    const size = map.unitInfo(riderId)?.size ?? 1;
    const cells = ringCells(rect, LAND_RING, size, (x, y) => map.isStandable(x, y, size), riders.length);
    const cell = cells[index % Math.max(1, cells.length)];
    if (cell && map.disembark(riderId, cell.x, cell.y)) landed += 1;
    else if (map.relocateToSafety(riderId, at)) relocated += 1;
  }
  return [landed, relocated];
}

/**
 * 옛 배·부두를 지운다(행성마다 한 번). 이미 지웠으면 undefined. 지웠으면 결과(감사 기록 world.boat_reset과 같은 값)
 */
export async function purgeLegacyBoats(deps: BoatPurgeDeps): Promise<BoatPurgeReport | undefined> {
  const { pool, planetId, maps, places, ledger } = deps;
  if (await boatPurgeDone(pool, planetId)) return undefined;
  const at = deps.now();
  // 1. 배: 승객을 먼저 내리고 지운다
  const boats: { boatId: number; ownerId: number; mapKey: number }[] = [];
  let landed = 0;
  let relocated = 0;
  for (const map of maps.values()) {
    const ids: { id: number; ownerId: number }[] = [];
    map.forEachUnit((unit) => {
      if (unit.kind === UNIT_KIND_BOAT) ids.push({ id: unit.id, ownerId: unit.ownerId });
    });
    for (const { id, ownerId } of ids.toSorted((a, b) => a.id - b.id)) {
      const [down, moved] = landRiders(map, id, at);
      landed += down;
      relocated += moved;
      if (map.removeUnit(id)) boats.push({ boatId: id, ownerId, mapKey: map.mapKey });
    }
  }
  // 2. 부두: 건물 창고를 먼저 주인에게 돌려놓고 건물을 지운다
  const docks: BoatPurgeReport["docks"][number][] = [];
  const unloadedDocks: number[] = [];
  for (const record of [...places.facilities.values()].toSorted((a, b) => a.buildingId - b.buildingId)) {
    if (record.facilityId !== LEGACY_DOCK_ID) continue;
    let found: { map: SecondMap; ownerId: number | null } | undefined;
    for (const map of maps.values()) {
      const ownerId = map.buildingOwner(record.buildingId);
      if (ownerId !== undefined) {
        found = { map, ownerId };
        break;
      }
    }
    if (!found) {
      unloadedDocks.push(record.buildingId);
      continue;
    }
    const rehomed = rehomeBuildingGoods(ledger, record.buildingId, record.cityId, at);
    const removed = found.map.removeBuilding(record.buildingId);
    if (!removed.ok) continue;
    docks.push({
      buildingId: record.buildingId,
      ownerId: found.ownerId,
      mapKey: found.map.mapKey,
      level: record.level,
      cityId: record.cityId,
      rehomed,
    });
  }
  // 3. 띄우지 않은 2차맵의 배 유닛 줄·작업·배 상태·시설 설정
  await deps.durable();
  const unloaded = await pool.query(
    `delete from world_units where planet_id = $1 and kind = $2 returning id`,
    [planetId, UNIT_KIND_BOAT],
  );
  const jobs = await pool.query(
    `delete from boat_jobs where planet_id = $1 returning id, owner_id, materials`,
    [planetId],
  );
  await pool.query(`delete from boat_states where planet_id = $1`, [planetId]);
  await pool.query(`delete from boat_facilities where planet_id = $1`, [planetId]);
  const report: BoatPurgeReport = {
    boats,
    unloadedBoats: unloaded.rows.length,
    landed,
    relocated,
    jobs: jobs.rows.map((row) => ({
      id: Number(row.id),
      ownerId: Number(row.owner_id),
      materials: row.materials,
    })),
    docks,
    unloadedDocks,
  };
  await pool.query(
    `insert into boat_resets (planet_id, applied_at_ms, report) values ($1, $2, $3) on conflict (planet_id) do nothing`,
    [planetId, at, JSON.stringify(report)],
  );
  await pool.query(
    `insert into audit_log (actor_kind, action, before, after, meta) values ('system', 'world.boat_reset', $1, $2, $3)`,
    [null, JSON.stringify(report), JSON.stringify({ planetId, atMs: at, decision: "D-547 1499" })],
  );
  deps.log.info(
    {
      boats: boats.length,
      unloadedBoats: report.unloadedBoats,
      landed,
      relocated,
      jobs: report.jobs.length,
      docks: docks.length,
      unloadedDocks: unloadedDocks.length,
    },
    "boat reset: legacy boats and docks removed (D-547 1499)",
  );
  return report;
}
