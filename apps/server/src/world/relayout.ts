// 옛 세계의 시작 도시 옮기기 — docs/adr/2026-11-07-world-layout.md "옛 세계(NAS)"
// 세계 배치(worldLayout.ts) 전 세계는 고정 국가의 시작 도시를 시험 2차맵 줄(옛 자리)에 모아 두었다(1차맵에서 겹침, 사용자 지적 2026-11-07).
// 켤 때 옛 자리의 고정 국가 시작 도시 가운데 "플레이어 것이 걸리지 않은" 도시만 새 배치 자리로 옮긴다(WORLD_RELAYOUT = 1일 때만,
// 꺼져 있으면 무엇을 옮길지 기록만 남긴다). 플레이어 자료는 지우지 않는다.
// - 막는 것(하나라도 있으면 그 도시는 그대로 두고 까닭을 기록): 돌고 있는 전투(있으면 모두), 그 도시에 선 플레이어 건물, 그 도시 시설의 노동
//   계약·직무 배치·플레이어 작업, 그 도시 수호신, 그 도시를 기준으로 놓은 영토 비콘, 그 2차맵의 플레이어 유닛(사이보그 본체 빼고), 그 도시가 시작 도시인 사이보그가 그
//   2차맵에서 일·이동·포로 중, 그 도시 NPC 휴먼의 노동 계약, 그 도시 NPC 건물 창고에 든 물건.
// - 옮기는 것(한 트랜잭션 + 감사 기록): 도시 줄의 2차맵·칸(도시 ID는 그대로 → 도시 창고·거래소 주문·지분·구인 칸·도시 이름이 따라간다),
//   그 도시의 NPC 시설(건물·시설 줄·작업 줄을 지우고 같은 부팅의 기본 시설 세우기가 새 자리에 다시 세운다 — NPC 자료), 열린 NPC 구인 게시는
//   gone으로 닫는다.
// - 유닛(부팅의 2차맵 복구 직전, relocateUnits): 그 도시 NPC 휴먼과, 그 도시가 시작 도시이고 옛 2차맵에 서 있던 사이보그 본체를 새 도시
//   둘레의 설 수 있는 칸에 세운다(유닛 ID·직무·상태·보유 물건·생명 수치 그대로, 쓰기 대기열로 저장). 다른 2차맵에 가 있는 사이보그는
//   그대로 두고 시작 도시(안전한 곳)만 새 자리다.
import { BUILDING_LOCATION_BASE } from "@terra/shared/goodsPlaces";
import { anchorCenter } from "@terra/sim";
import { spiralCells } from "../cyborg/service.ts";
import type { QueryPool } from "./persist/load.ts";
import type { WriterPool } from "./persist/writer.ts";
import type { SecondMap, UnitRow } from "./secondMap.ts";
import { UNIT_KIND_BOT, UNIT_KIND_NPC_LEADER } from "./unitKinds.ts";
import type { LayoutSpot } from "./worldLayout.ts";

/** 옛 자리 도시 하나 */
export interface LegacyCity {
  readonly id: number;
  readonly factionId: number;
  readonly spot: LayoutSpot;
}

export interface RelayoutMove extends LegacyCity {
  readonly to: LayoutSpot;
  /** 새 도시 둘레로 옮길 유닛(NPC 휴먼 + 그 도시가 시작 도시인 사이보그 본체 + 그 나라 지도자, 옛 2차맵에 선 것) */
  readonly units: readonly number[];
  /** 함께 옮기는 사이보그의 사용자 */
  readonly cyborgUsers: readonly string[];
  /** 지우고 새 자리에 다시 세울 NPC 건물 */
  readonly npcBuildings: readonly number[];
  /** 이 도시 창고에 물건이 있는 플레이어 계정 수(도시 ID로 따라간다 — 기록용) */
  readonly playerGoods: number;
}

export interface RelayoutPlan {
  readonly moves: readonly RelayoutMove[];
  /** 옮기지 않는 옛 자리 도시와 까닭 */
  readonly kept: readonly (LegacyCity & { readonly reasons: readonly string[] })[];
}

/** 까닭 코드(기록·작업 기록에 그대로) */
export const RELAYOUT_REASONS = [
  "battle_running",
  "player_building",
  "facility_contract",
  "player_job",
  "guardian",
  "beacon",
  "player_unit_on_map",
  "cyborg_busy",
  "npc_human_contract",
  "npc_building_goods",
  "no_room",
] as const;
export type RelayoutReason = (typeof RELAYOUT_REASONS)[number];

const ids = (rows: readonly Record<string, unknown>[], key: string): number[] =>
  rows.map((row) => Number(row[key]));

/** 옛 자리(시험 2차맵 줄)에 있는 고정 국가 시작 도시(ID 차례) */
export async function loadLegacyCities(
  pool: QueryPool,
  planetId: string,
  legacyMaps: ReadonlySet<number>,
): Promise<LegacyCity[]> {
  const result = await pool.query(
    `select c.id, c.faction_id, c.map_key, c.cell_x, c.cell_y
     from world_cities c join factions f on f.id = c.faction_id
     where c.planet_id = $1 and c.start and f.fixed and f.kind = 'npc' and f.dissolved_at_ms is null
     order by c.id`,
    [planetId],
  );
  return result.rows
    .map((row) => ({
      id: Number(row.id),
      factionId: Number(row.faction_id),
      spot: { mapKey: Number(row.map_key), x: Number(row.cell_x), y: Number(row.cell_y) },
    }))
    .filter((city) => legacyMaps.has(city.spot.mapKey));
}

/** 옛 자리 도시 하나를 막는 까닭과 함께 옮길 것(DB 읽기만) */
export async function inspectLegacyCity(
  pool: QueryPool,
  planetId: string,
  city: LegacyCity,
): Promise<{
  reasons: RelayoutReason[];
  units: number[];
  cyborgUsers: string[];
  npcBuildings: number[];
  playerGoods: number;
}> {
  const reasons: RelayoutReason[] = [];
  const add = (reason: RelayoutReason, rows: readonly unknown[]): void => {
    if (rows.length > 0) reasons.push(reason);
  };
  const { id, spot } = city;
  const facilities = await pool.query(
    `select f.building_id, (o.user_id is not null) as player
     from world_facilities f
     left join world_buildings b on b.id = f.building_id
     left join world_owners o on o.id = b.owner_id
     where f.city_id = $1`,
    [id],
  );
  const buildingIds = ids(facilities.rows, "building_id");
  const npcBuildings = facilities.rows
    .filter((row) => row.player !== true)
    .map((row) => Number(row.building_id));
  add(
    "player_building",
    facilities.rows.filter((row) => row.player === true),
  );
  add(
    "facility_contract",
    (
      await pool.query(
        `select id from labor_contracts where state <> 'ended' and building_id = any($1::bigint[])
         union all select unit_id from unit_work where building_id = any($1::bigint[]) or gather_building_id = any($1::bigint[])`,
        [buildingIds],
      )
    ).rows,
  );
  add(
    "player_job",
    (
      await pool.query(
        `select j.id from facility_jobs j join world_owners o on o.id = j.owner_id
         where j.building_id = any($1::bigint[]) and o.user_id is not null`,
        [buildingIds],
      )
    ).rows,
  );
  add("guardian", (await pool.query(`select unit_id from temple_guardians where city_id = $1`, [id])).rows);
  // 그 도시를 기준으로 놓은 영토 비콘(1차맵 칸에 선다 — 도시만 옮기면 껍질이 옛 자리까지 늘어난다)
  add("beacon", (await pool.query(`select id from territory_beacons where city_id = $1`, [id])).rows);
  add(
    "player_unit_on_map",
    (
      await pool.query(
        `select u.id from world_units u join world_owners o on o.id = u.owner_id
         where u.planet_id = $1 and u.map_key = $2 and o.user_id is not null
           and not exists (select 1 from cyborgs y where y.unit_id = u.id)`,
        [planetId, spot.mapKey],
      )
    ).rows,
  );
  const cyborgs = await pool.query(
    `select y.user_id, u.id as unit_id,
            (u.held_by is not null
             or exists (select 1 from world_travels t where t.unit_id = u.id)
             or exists (select 1 from unit_work w where w.unit_id = u.id)
             or exists (select 1 from labor_contracts lc where lc.unit_id = u.id and lc.state <> 'ended')) as busy
     from cyborgs y join world_units u on u.id = y.unit_id
     where y.start_city_id = $1 and u.planet_id = $2 and u.map_key = $3
     order by y.user_id`,
    [id, planetId, spot.mapKey],
  );
  add(
    "cyborg_busy",
    cyborgs.rows.filter((row) => row.busy === true),
  );
  const humans = await pool.query(
    `select h.unit_id from world_humans h
     join world_units u on u.id = h.unit_id
     join world_owners o on o.id = u.owner_id
     where h.city_id = $1 and o.user_id is null and u.planet_id = $2 and u.map_key = $3
     order by h.unit_id`,
    [id, planetId, spot.mapKey],
  );
  const humanIds = ids(humans.rows, "unit_id");
  // 그 2차맵에 선 그 나라 지도자(D-528 — 수도 행정 건물 곁에 선다): 도시와 함께 새 자리로 옮긴다(남기면 옛 2차맵에 지도자가 하나 더 남는다)
  const leaders = await pool.query(
    `select u.id from world_units u join world_owners o on o.id = u.owner_id
     where o.faction_id = $1 and u.kind = $2 and u.planet_id = $3 and u.map_key = $4 order by u.id`,
    [city.factionId, UNIT_KIND_NPC_LEADER, planetId, spot.mapKey],
  );
  add(
    "npc_human_contract",
    (
      await pool.query(
        `select id from labor_contracts where state <> 'ended' and unit_id = any($1::bigint[])`,
        [humanIds],
      )
    ).rows,
  );
  add(
    "npc_building_goods",
    (
      await pool.query(`select id from ledger_accounts where balance > 0 and location = any($1::bigint[])`, [
        npcBuildings.map((building) => BUILDING_LOCATION_BASE + building),
      ])
    ).rows,
  );
  const goods = await pool.query(
    `select a.id from ledger_accounts a join world_owners o on o.id = a.owner_id
     where a.location = $1 and a.balance > 0 and o.user_id is not null`,
    [id],
  );
  return {
    reasons,
    units: [...humanIds, ...ids(cyborgs.rows, "unit_id"), ...ids(leaders.rows, "id")].toSorted(
      (a, b) => a - b,
    ),
    cyborgUsers: cyborgs.rows.map((row) => String(row.user_id)),
    npcBuildings: npcBuildings.toSorted((a, b) => a - b),
    playerGoods: goods.rows.length,
  };
}

/**
 * 옮길 계획: 옛 자리 도시마다 막는 까닭을 보고, 막히지 않은 도시를 국가마다 새 자리(place — 세계 배치가 국가마다 고른 자리, 국가 안 차례)에
 * ID 차례로 붙인다. 자리가 모자라면 남은 도시는 no_room으로 둔다
 */
export async function planRelayout(
  pool: QueryPool,
  options: {
    readonly planetId: string;
    readonly legacy: readonly LegacyCity[];
    /** 막히지 않은 도시(국가마다 수)를 받아 국가마다 새 자리를 고른다(막힌 도시는 그대로 선 도시로 친다) */
    readonly place: (
      movable: readonly LegacyCity[],
      kept: readonly LegacyCity[],
    ) => readonly { readonly factionId: number; readonly spot: LayoutSpot }[];
  },
): Promise<RelayoutPlan> {
  const { planetId, legacy } = options;
  if (legacy.length === 0) return { moves: [], kept: [] };
  const battles = await pool.query(`select id from world_battles where status = 'running' limit 1`);
  if (battles.rows.length > 0)
    return { moves: [], kept: legacy.map((city) => ({ ...city, reasons: ["battle_running"] })) };
  const inspected = [];
  for (const city of legacy) inspected.push({ city, ...(await inspectLegacyCity(pool, planetId, city)) });
  const movable = inspected.filter((entry) => entry.reasons.length === 0);
  const kept: (LegacyCity & { reasons: readonly string[] })[] = inspected
    .filter((entry) => entry.reasons.length > 0)
    .map((entry) => ({ ...entry.city, reasons: entry.reasons }));
  const spots = options.place(
    movable.map((entry) => entry.city),
    kept,
  );
  const left = new Map<number, LayoutSpot[]>();
  for (const { factionId, spot } of spots) left.set(factionId, [...(left.get(factionId) ?? []), spot]);
  const moves: RelayoutMove[] = [];
  for (const entry of movable) {
    const queue = left.get(entry.city.factionId);
    const to = queue?.shift();
    if (!to) {
      kept.push({ ...entry.city, reasons: ["no_room"] });
      continue;
    }
    moves.push({
      ...entry.city,
      to,
      units: entry.units,
      cyborgUsers: entry.cyborgUsers,
      npcBuildings: entry.npcBuildings,
      playerGoods: entry.playerGoods,
    });
  }
  return { moves, kept: kept.toSorted((a, b) => a.id - b.id) };
}

/** 계획대로 도시 줄을 옮기고 NPC 시설을 지운다(한 트랜잭션, 감사 기록 한 줄씩) */
export async function applyRelayout(
  pool: WriterPool,
  plan: RelayoutPlan,
  nowMs: number,
  /** 감사 기록 동작(옛 자리 옮기기 world.relayout_city, 사람이 고른 국가 자리 world.place_nation_city — D-528) */
  action = "world.relayout_city",
): Promise<void> {
  if (plan.moves.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const move of plan.moves) {
      await client.query(`update world_cities set map_key = $2, cell_x = $3, cell_y = $4 where id = $1`, [
        move.id,
        move.to.mapKey,
        move.to.x,
        move.to.y,
      ]);
      const buildings = [...move.npcBuildings];
      await client.query(`delete from facility_jobs where building_id = any($1::bigint[])`, [buildings]);
      await client.query(
        `update labor_postings set state = 'gone', closed_at_ms = $2 where state = 'open' and building_id = any($1::bigint[])`,
        [buildings, nowMs],
      );
      await client.query(`delete from labor_rents where building_id = any($1::bigint[])`, [buildings]);
      await client.query(`delete from world_facilities where building_id = any($1::bigint[])`, [buildings]);
      await client.query(`delete from world_buildings where id = any($1::bigint[])`, [buildings]);
      await client.query(
        `insert into audit_log (actor_kind, action, before, after, meta) values ('system', $4, $1, $2, $3)`,
        [
          JSON.stringify(move.spot),
          JSON.stringify(move.to),
          JSON.stringify({
            cityId: move.id,
            factionId: move.factionId,
            units: move.units.length,
            cyborgUsers: move.cyborgUsers,
            npcBuildings: buildings.length,
            playerGoods: move.playerGoods,
            atMs: nowMs,
          }),
          action,
        ],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** 새 도시 둘레에서 유닛을 세울 반경(칸) */
const STAND_RADIUS = 24;

/**
 * 부팅의 2차맵 복구 직전: 옮긴 도시의 유닛 줄을 새 2차맵의 도시 둘레 설 수 있는 칸(나선 차례, 유닛마다 다른 칸)으로 바꾸고 저장한다.
 * 봇(NPC 휴먼)은 곧 깨어 다시 걷는다. 바꾼 줄 목록을 돌려준다(그 밖의 줄은 그대로)
 */
export function relocateUnits(
  units: readonly UnitRow[],
  plan: RelayoutPlan | undefined,
  maps: ReadonlyMap<number, SecondMap>,
  save: (row: UnitRow) => void,
  nowMs: number,
): { rows: UnitRow[]; moved: number } {
  if (!plan || plan.moves.length === 0) return { rows: [...units], moved: 0 };
  const target = new Map<number, RelayoutMove>();
  for (const move of plan.moves) for (const unitId of move.units) target.set(unitId, move);
  const used = new Map<number, Set<string>>();
  let moved = 0;
  const rows = units.map((row) => {
    const move = target.get(row.id);
    const map = move ? maps.get(move.to.mapKey) : undefined;
    if (!move || !map) return row;
    const taken = used.get(move.id) ?? new Set<string>();
    used.set(move.id, taken);
    for (const cell of spiralCells(move.to.x, move.to.y, STAND_RADIUS)) {
      const key = `${cell.x},${cell.y}`;
      if (taken.has(key) || !map.isStandable(cell.x, cell.y, row.size)) continue;
      taken.add(key);
      const at = anchorCenter(cell.x, cell.y, row.size);
      const next: UnitRow = {
        ...row,
        mapKey: move.to.mapKey,
        path: [at.x, at.y],
        departAtMs: nowMs,
        wakeAtMs: row.kind === UNIT_KIND_BOT ? nowMs : null,
      };
      save(next);
      moved += 1;
      return next;
    }
    return row;
  });
  return { rows, moved };
}
