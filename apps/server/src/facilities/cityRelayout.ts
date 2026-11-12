// 이미 선 NPC 도시 건물 다시 놓기(전략 배치) — docs/adr/2026-11-11-city-building-layout.md 4절. 사용자 요청(2026-11-11) "건물들도 바둑판 배열이
// 아닌 전략적으로"를 세계를 새로 시작하지 않고 이미 선 세계에 들이는 운영자 동작.
// - 미리 보기(planCityRelayout — 메모리 2차맵·DB 읽기만): NPC 국가(factions.kind = npc) 시작 도시마다, 그 도시 시설 줄이고 주인이 그 도시 세력의
//   소유 주체인 건물 가운데 "움직일 수 있는 것"을 cityLayout.ts로 다시 계획한다. 움직일 수 없는 것(플레이어가 걸린 건물 = 열린 노동 계약·임대 조건·
//   열린 구인 게시·직무 배치·건물 작업이 있는 건물)과 다른 주인 건물(플레이어 건물 포함)은 그 자리에 두고 피한다.
// - 예약(world_city_layout_requests, 감사 기록 world.city_relayout_request) → 서버가 다음에 켤 때 한 번(world.ts, 세계 씨앗 직전 — 경로 서비스를
//   켜기 전, 동기): 같은 계획을 다시 세워 건물을 옮긴다. 건물 ID는 그대로(치우고 같은 ID로 다시 놓기 — 시설 줄·창고 물건·직무가 ID로 이어진다).
//   도시 하나 안에서 하나라도 못 놓으면(유닛이 선 칸 등) 그 도시는 모두 제자리로 되돌린다. 든 결과·감사 기록 world.city_relayout.
// - 성벽 고리(질문 1071 가, 기획 D-534): 그 도시 성벽(방어 단계)은 다른 건물을 다 계획한 뒤 새 행정 건물 자리 둘레에 같은 고리 함수(@terra/sim/city
//   planCityWalls)로 다시 세운다 — 있던 성벽을 같은 ID로 고리 토막 차례대로 옮긴다(건물 ID 차례 → 토막 차례, 세로 변은 90° 돌림). 고리 토막이
//   성벽보다 적으면(새 자리 둘레가 막힘) 남는 성벽은 제자리, 많으면 빈 토막은 공성 때 성문이 된다(cityGates). 행정 건물이 없는 도시·플레이어가
//   걸린 성벽은 옮기지 않는다.
// - 하지 않는 것: 건물을 짓거나 지우지 않는다(모자란 숙소 등은 같은 부팅의 세계 씨앗이 더한다), 플레이어 것은 옮기지 않는다, 가문·반란 세력 도시는
//   건드리지 않는다(kind = npc 시작 도시만).
import type { CityCell } from "@terra/shared/goodsPlaces";
import { PLACEMENT_SIZE, type Rotation, type WorldSeedCoefficients, footprintRect } from "@terra/sim";
import { CITY_WALL_FACILITY, DEFENSE_STAGE, cityWallRulesOf, planCityWalls } from "@terra/sim/city";
import type { GatherKind } from "../gather/kinds.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import { type LayoutExisting, type LayoutItem, type LayoutRect, planCityLayout } from "@terra/sim/city";
import {
  cityLayoutRulesOf,
  cityLayoutSeed,
  layoutGroundOf,
  layoutItemOf,
  layoutObjectsOf,
  layoutRoleOf,
} from "./cityLayoutGround.ts";
import { type LayoutBuilding, type LayoutMetrics, layoutMetrics } from "./cityLayoutMetrics.ts";
import type { SeedLand } from "./npcSeed.ts";
import type { FacilityRecord } from "./state.ts";

/** 다시 놓을 도시(NPC 국가 시작 도시) */
export interface RelayoutCity {
  readonly id: number;
  readonly factionId: number;
  readonly ownerId: number;
  readonly code: string | null;
  readonly name: string | null;
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
}

/** DB에서 읽는 것: 도시·같은 2차맵 도시 칸(가장 가까운 도시)·플레이어가 걸린 건물 */
export interface RelayoutInputs {
  readonly cities: readonly RelayoutCity[];
  readonly anchors: readonly CityCell[];
  readonly pinned: ReadonlySet<number>;
}

export async function loadRelayoutInputs(pool: QueryPool, planetId: string): Promise<RelayoutInputs> {
  const cities = await pool.query(
    `select c.id, c.faction_id, c.map_key, c.cell_x, c.cell_y, c.name, f.code, o.id as owner_id
       from world_cities c join factions f on f.id = c.faction_id join world_owners o on o.faction_id = f.id
      where c.planet_id = $1 and c.start and f.kind = 'npc' order by c.id`,
    [planetId],
  );
  const anchors = await pool.query(
    `select id, map_key, cell_x, cell_y from world_cities where planet_id = $1`,
    [planetId],
  );
  // 플레이어가 걸릴 수 있는 건물: 열린 노동 계약·임대 조건·열린 구인 게시·직무 배치·건물 작업(짓기·수리·레벨 올리기·장비 수리)
  const pinned = await pool.query(
    `select building_id from labor_contracts where state <> 'ended'
     union select building_id from labor_rents
     union select building_id from labor_postings where state = 'open'
     union select building_id from unit_work where building_id is not null
     union select building_id from facility_jobs where building_id is not null`,
  );
  return {
    cities: cities.rows.map((row) => ({
      id: Number(row.id),
      factionId: Number(row.faction_id),
      ownerId: Number(row.owner_id),
      code: typeof row.code === "string" ? row.code : null,
      name: typeof row.name === "string" ? row.name : null,
      mapKey: Number(row.map_key),
      cellX: Number(row.cell_x),
      cellY: Number(row.cell_y),
    })),
    anchors: anchors.rows.map((row) => ({
      id: Number(row.id),
      mapKey: Number(row.map_key),
      x: Number(row.cell_x),
      y: Number(row.cell_y),
    })),
    pinned: new Set(pinned.rows.map((row) => Number(row.building_id))),
  };
}

export interface RelayoutDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly facilities: ReadonlyMap<number, FacilityRecord>;
  readonly catalog: FacilityCatalog;
  readonly gatherKinds: readonly GatherKind[];
  readonly seed: WorldSeedCoefficients;
  readonly land?: ((mapKey: number) => SeedLand | undefined) | undefined;
}

/** 건물 하나 옮기기(from·to = 돌리기 전 배치 크기, 돌림은 fromRotation·toRotation — 없으면 0) */
export interface RelayoutMove {
  readonly buildingId: number;
  readonly facility: string;
  readonly from: LayoutRect;
  readonly to: LayoutRect;
  readonly fromRotation?: Rotation | undefined;
  readonly toRotation?: Rotation | undefined;
}

export interface CityRelayoutPlan {
  readonly city: RelayoutCity;
  /** 옮길 수 있는 NPC 건물 수·플레이어가 걸려 그대로 두는 수 */
  readonly movable: number;
  readonly pinned: number;
  readonly moves: readonly RelayoutMove[];
  /** 자리를 못 찾아 그대로 두는 건물 */
  readonly stay: number;
  /** 지금·옮긴 뒤 지표(이 도시 건물 — 주인이 같은 시설 줄) */
  readonly now: LayoutMetrics;
  readonly planned: LayoutMetrics;
  /** 지금·옮긴 뒤 건물(화면 그림) */
  readonly buildings: readonly (LayoutBuilding & {
    readonly id: number;
    readonly facility: string;
    readonly pinned: boolean;
    readonly to: LayoutRect | null;
  })[];
}

const ROLE_ORDER = ["core", "gather", "storage", "living", "other"] as const;

/** 도시마다 다시 놓기 계획(읽기만 — 2차맵을 바꾸지 않는다) */
export function planCityRelayout(deps: RelayoutDeps, inputs: RelayoutInputs): CityRelayoutPlan[] {
  const out: CityRelayoutPlan[] = [];
  const rules = cityLayoutRulesOf(deps.seed);
  for (const city of inputs.cities) {
    const map = deps.maps.get(city.mapKey);
    if (!map) continue;
    // 차지한 칸(돌린 건물은 돌린 뒤 크기)과 돌리기 전 배치(성벽을 옮길 때 되돌릴 자리)
    const placements = new Map<number, LayoutRect>();
    const raw = new Map<number, { rect: LayoutRect; rotation: Rotation }>();
    map.forEachBuilding((building) => {
      const { x, y, width, height, rotation } = building.placement;
      placements.set(building.id, footprintRect(building.placement));
      raw.set(building.id, { rect: { x, y, width, height }, rotation });
    });
    const mine: { id: number; facility: string; rect: LayoutRect; pinned: boolean; wall: boolean }[] = [];
    for (const record of deps.facilities.values()) {
      const rect = placements.get(record.buildingId);
      if (record.cityId !== city.id || !rect || map.buildingOwner(record.buildingId) !== city.ownerId)
        continue;
      mine.push({
        id: record.buildingId,
        facility: record.facilityId,
        rect,
        pinned: inputs.pinned.has(record.buildingId),
        // 성벽(방어 단계, 질문 1048 가)은 다른 건물처럼 계획하지 않고 새 행정 건물 둘레 고리로 다시 세운다(질문 1071 가)
        wall: deps.catalog.facility(record.facilityId)?.stage === DEFENSE_STAGE,
      });
    }
    if (mine.length === 0) continue;
    const roleOf = (facility: string) => layoutRoleOf(deps.catalog.facility(facility)?.stage);
    // 행정 건물이 없으면 고리를 둘 곳이 없다: 성벽은 그 자리에 둔다(옛 동작)
    const hasHall = mine.some((building) => !building.wall && roleOf(building.facility) === "core");
    for (const building of mine) if (building.wall && !hasHall) building.pinned = true;
    const walls = mine
      .filter((building) => building.wall && !building.pinned)
      .toSorted((a, b) => a.id - b.id);
    const movable = mine
      .filter((building) => !building.pinned && !building.wall)
      .toSorted(
        (a, b) =>
          ROLE_ORDER.indexOf(roleOf(a.facility)) - ROLE_ORDER.indexOf(roleOf(b.facility)) || a.id - b.id,
      );
    const items: LayoutItem[] = [];
    for (const building of movable) {
      const item = layoutItemOf(deps.catalog, building.facility, deps.gatherKinds);
      // 발자국이 팩과 다르면(돌린 건물 등) 지금 크기로 계획한다
      if (item)
        items.push({ ...item, width: building.rect.width, height: building.rect.height, key: building.id });
    }
    const existing: LayoutExisting[] = mine
      .filter((building) => building.pinned)
      .map((building) => ({
        ...building.rect,
        facility: building.facility,
        role: roleOf(building.facility),
      }));
    const ground = layoutGroundOf({
      map,
      catalog: deps.catalog,
      anchors: inputs.anchors.filter((anchor) => anchor.mapKey === city.mapKey),
      cityId: city.id,
      objects: layoutObjectsOf(map, deps.gatherKinds, deps.land?.(city.mapKey), deps.seed),
      ignore: new Set([...movable, ...walls].map((building) => building.id)),
    });
    const layout = planCityLayout({
      center: { x: city.cellX, y: city.cellY },
      items,
      existing,
      ground,
      rules,
      seed: cityLayoutSeed(city.mapKey, city.id),
      size: PLACEMENT_SIZE,
    });
    const target = new Map<number, LayoutRect>();
    for (const building of layout.placed)
      if (building.key !== undefined)
        target.set(building.key, {
          x: building.x,
          y: building.y,
          width: building.width,
          height: building.height,
        });
    const moves: RelayoutMove[] = [];
    for (const building of movable) {
      const to = target.get(building.id);
      if (to && (to.x !== building.rect.x || to.y !== building.rect.y))
        moves.push({ buildingId: building.id, facility: building.facility, from: building.rect, to });
    }
    // 성벽 고리: 새 행정 건물 자리(옮기면 새 자리, 아니면 지금 자리) 둘레에 다시 세운다(질문 1071 가)
    const hall = mine.find((building) => !building.wall && roleOf(building.facility) === "core");
    if (hall && walls.length > 0) {
      const wallDef = deps.catalog.facility(CITY_WALL_FACILITY)?.footprint;
      const first = walls[0];
      const length = wallDef
        ? Math.max(wallDef.width, wallDef.height)
        : Math.max(first?.rect.width ?? 1, first?.rect.height ?? 1);
      const ring = planCityWalls(
        target.get(hall.id) ?? hall.rect,
        cityWallRulesOf(deps.seed),
        length,
        (placement) => {
          const rect = footprintRect(placement);
          if (!ground.canPlace(rect)) return false;
          ground.place(rect);
          return true;
        },
      );
      walls.forEach((wall, index) => {
        const spot = ring[index];
        if (!spot) return;
        const before = raw.get(wall.id);
        const fromRotation = before?.rotation ?? 0;
        const from = before?.rect ?? wall.rect;
        const to = { x: spot.x, y: spot.y, width: spot.width, height: spot.height };
        target.set(wall.id, footprintRect(spot));
        if (to.x === from.x && to.y === from.y && spot.rotation === fromRotation) return;
        moves.push({
          buildingId: wall.id,
          facility: wall.facility,
          from,
          to,
          fromRotation,
          toRotation: spot.rotation,
        });
      });
    }
    const metrics = (useTarget: boolean) =>
      layoutMetrics({
        center: { x: city.cellX, y: city.cellY },
        buildings: mine.map((building) => ({
          ...((useTarget ? target.get(building.id) : undefined) ?? building.rect),
          role: roleOf(building.facility),
        })),
        passable: (x, y) => (ground.grid.terrainCost[y * PLACEMENT_SIZE + x] ?? 0) !== 0,
        plazaCells: rules.plazaCells,
        size: PLACEMENT_SIZE,
      });
    out.push({
      city,
      movable: movable.length + walls.length,
      pinned: mine.length - movable.length,
      moves,
      stay: [...movable, ...walls].filter((building) => !target.has(building.id)).length,
      now: metrics(false),
      planned: metrics(true),
      buildings: mine.map((building) => ({
        ...building.rect,
        id: building.id,
        facility: building.facility,
        role: roleOf(building.facility),
        pinned: building.pinned,
        to: target.get(building.id) ?? null,
      })),
    });
  }
  return out;
}

export interface CityRelayoutReport {
  /** 계획한 도시·옮긴 도시·되돌린 도시(못 놓은 건물이 있어 제자리) */
  readonly cities: number;
  readonly relaid: number;
  readonly rolledBack: number;
  /** 옮긴 건물·플레이어가 걸려 그대로 둔 건물 */
  readonly moved: number;
  readonly pinned: number;
}

/** 계획대로 옮긴다(같은 ID로 다시 놓기). 도시 하나에서 하나라도 못 놓으면 그 도시는 모두 제자리로 */
export function applyCityRelayout(
  maps: ReadonlyMap<number, SecondMap>,
  plans: readonly CityRelayoutPlan[],
): CityRelayoutReport {
  let relaid = 0;
  let rolledBack = 0;
  let moved = 0;
  let pinned = 0;
  for (const plan of plans) {
    pinned += plan.pinned;
    const map = maps.get(plan.city.mapKey);
    if (!map || plan.moves.length === 0) continue;
    const owner = plan.city.ownerId;
    for (const move of plan.moves) map.removeBuilding(move.buildingId);
    const done: RelayoutMove[] = [];
    let failed = false;
    for (const move of plan.moves) {
      const result = map.placeBuilding(
        { ...move.to, rotation: move.toRotation ?? 0 },
        owner,
        move.buildingId,
      );
      if (!result.ok) {
        failed = true;
        break;
      }
      done.push(move);
    }
    if (failed) {
      // 되돌리기: 새 자리에 놓은 것을 치우고 모두 옛 자리에(옛 자리는 처음 상태라 늘 놓인다)
      for (const move of done) map.removeBuilding(move.buildingId);
      for (const move of plan.moves)
        map.placeBuilding({ ...move.from, rotation: move.fromRotation ?? 0 }, owner, move.buildingId);
      rolledBack += 1;
      continue;
    }
    relaid += 1;
    moved += done.length;
  }
  return { cities: plans.length, relaid, rolledBack, moved, pinned };
}

/** 요청 한 줄 */
export interface CityRelayoutRequest {
  readonly requestedBy: string | null;
  readonly requestedAtMs: number;
  readonly appliedAtMs: number | null;
  readonly report: Readonly<Record<string, unknown>> | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function loadCityRelayoutRequest(
  pool: QueryPool,
  planetId: string,
): Promise<CityRelayoutRequest | undefined> {
  const result = await pool.query(
    `select requested_by, requested_at_ms, applied_at_ms, report from world_city_layout_requests where planet_id = $1`,
    [planetId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    requestedBy: typeof row.requested_by === "string" ? row.requested_by : null,
    requestedAtMs: Number(row.requested_at_ms),
    appliedAtMs: row.applied_at_ms === null ? null : Number(row.applied_at_ms),
    report: isRecord(row.report) ? row.report : null,
  };
}

/** 예약을 적는다(같은 행성의 옛 줄을 덮어쓴다 — 든 시각·결과를 비운다) */
export async function requestCityRelayout(
  pool: QueryPool,
  input: { planetId: string; userId: string; nowMs: number },
): Promise<void> {
  await pool.query(
    `insert into world_city_layout_requests (planet_id, requested_by, requested_at_ms, applied_at_ms, report)
     values ($1, $2, $3, null, null)
     on conflict (planet_id) do update set requested_by = excluded.requested_by,
       requested_at_ms = excluded.requested_at_ms, applied_at_ms = null, report = null`,
    [input.planetId, input.userId, input.nowMs],
  );
}

/** 아직 들지 않은 예약을 지운다. 지웠으면 true */
export async function cancelCityRelayout(pool: QueryPool, planetId: string): Promise<boolean> {
  const result = await pool.query(
    `delete from world_city_layout_requests where planet_id = $1 and applied_at_ms is null returning planet_id`,
    [planetId],
  );
  return result.rows.length > 0;
}

/**
 * 부팅 때 한 번(world.ts — 2차맵 복구 뒤, 세계 씨앗·경로 서비스 전): 들 예약이 있으면 계획·옮기기 → 든 시각·결과·감사 기록(system,
 * world.city_relayout). 예약이 없으면 아무것도 하지 않는다(undefined)
 */
export async function applyCityRelayoutAtBoot(options: {
  readonly pool: QueryPool;
  readonly planetId: string;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly facilities: {
    readonly service: { readonly facilities: ReadonlyMap<number, FacilityRecord> };
    readonly catalog: () => FacilityCatalog;
    readonly gatherKinds?: (() => readonly GatherKind[]) | undefined;
  };
  /** 설정 칸 실효 값(세계 씨앗 계수표) */
  readonly rules: () => { readonly worldSeed: WorldSeedCoefficients };
  /** 2차맵 지형 서비스(cellValues = 2차맵 칸의 행성 값 — 밭·목초지 자리) */
  readonly terrain?: { cellValues?(mapKey: number): SeedLand | undefined } | undefined;
  readonly log: { info(obj: object, message: string): void };
  readonly nowMs: number;
}): Promise<CityRelayoutReport | undefined> {
  const request = await loadCityRelayoutRequest(options.pool, options.planetId);
  if (!request || request.appliedAtMs !== null) return undefined;
  const inputs = await loadRelayoutInputs(options.pool, options.planetId);
  const plans = planCityRelayout(
    {
      maps: options.maps,
      facilities: options.facilities.service.facilities,
      catalog: options.facilities.catalog(),
      gatherKinds: options.facilities.gatherKinds?.() ?? [],
      seed: options.rules().worldSeed,
      land: (mapKey) => options.terrain?.cellValues?.(mapKey),
    },
    inputs,
  );
  const report = applyCityRelayout(options.maps, plans);
  const marked = await options.pool.query(
    `update world_city_layout_requests set applied_at_ms = $2, report = $3
      where planet_id = $1 and applied_at_ms is null returning requested_by, requested_at_ms`,
    [options.planetId, options.nowMs, JSON.stringify(report)],
  );
  const row = marked.rows[0];
  if (row)
    await options.pool.query(
      `insert into audit_log (actor_kind, action, before, after, meta) values ('system', 'world.city_relayout', $1, $2, $3)`,
      [
        null,
        JSON.stringify(report),
        JSON.stringify({
          planetId: options.planetId,
          requestedBy: typeof row.requested_by === "string" ? row.requested_by : null,
          requestedAtMs: Number(row.requested_at_ms),
          atMs: options.nowMs,
        }),
      ],
    );
  options.log.info(report, "world boot: npc city buildings relaid");
  return report;
}
