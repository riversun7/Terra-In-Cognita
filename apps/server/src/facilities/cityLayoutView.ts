// 도시 건물 배치 조회·다시 놓기 예약(운영자 화면 /dev/world-layout "도시 건물 배치") — docs/adr/2026-11-11-city-building-layout.md 4·5절.
// tRPC worldLayout.cityLayout·requestCityRelayout·cancelCityRelayout(권한은 세계 배치 화면과 같다 — read / place). 세계 배치 서비스
// (world/placementService.ts)가 이 서비스를 실어 나른다.
// - 조회(읽기만): 지금 2차맵·시설 줄로 NPC 국가 시작 도시마다 지금 배치와 다시 놓은 뒤 배치(cityRelayout.ts planCityRelayout), 지표, 걸린 예약.
// - 예약·취소: 표 world_city_layout_requests, 감사 기록 world.city_relayout_request·world.city_relayout_cancel(admin, 사용자·IP).
import type { WorldCityLayoutMetrics, WorldCityRelayoutView } from "@terra/shared/worldPlacementApi";
import type { WorldSeedCoefficients } from "@terra/sim";
import type { GatherKind } from "../gather/kinds.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { FacilityCatalog } from "./catalog.ts";
import type { LayoutMetrics } from "./cityLayoutMetrics.ts";
import {
  cancelCityRelayout,
  loadCityRelayoutRequest,
  loadRelayoutInputs,
  planCityRelayout,
  requestCityRelayout,
} from "./cityRelayout.ts";
import type { SeedLand } from "./npcSeed.ts";
import type { FacilityRecord } from "./state.ts";

export interface CityLayoutActor {
  readonly userId: string;
  readonly ip: string | null;
}

export interface CityLayoutService {
  /** 미리 보기와 예약. 세계가 아직이면 undefined */
  view(): Promise<WorldCityRelayoutView | undefined>;
  request(actor: CityLayoutActor): Promise<WorldCityRelayoutView | undefined>;
  cancel(actor: CityLayoutActor): Promise<boolean>;
}

/** 세계 쪽 몫(준비되면) */
export interface CityLayoutWorld {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly facilities: ReadonlyMap<number, FacilityRecord>;
  readonly catalog: FacilityCatalog;
  readonly gatherKinds: readonly GatherKind[];
}

const metricsView = (metrics: LayoutMetrics): WorldCityLayoutMetrics => ({ ...metrics });

async function audit(pool: QueryPool, actor: CityLayoutActor, action: string, meta: unknown): Promise<void> {
  await pool.query(
    `insert into audit_log (actor_kind, actor_id, action, before, after, ip, meta) values ('admin', $1, $2, null, null, $3, $4)`,
    [actor.userId, action, actor.ip, JSON.stringify(meta)],
  );
}

export function createCityLayoutService(o: {
  readonly pool: QueryPool;
  readonly planetId: string;
  readonly world: () => CityLayoutWorld | undefined;
  readonly seed: () => WorldSeedCoefficients;
  readonly land?: ((mapKey: number) => SeedLand | undefined) | undefined;
  readonly now: () => number;
}): CityLayoutService {
  const view = async (): Promise<WorldCityRelayoutView | undefined> => {
    const world = o.world();
    if (!world) return undefined;
    const [inputs, request] = await Promise.all([
      loadRelayoutInputs(o.pool, o.planetId),
      loadCityRelayoutRequest(o.pool, o.planetId),
    ]);
    const plans = planCityRelayout({ ...world, seed: o.seed(), land: o.land }, inputs);
    return {
      cities: plans.map((plan) => ({
        cityId: plan.city.id,
        code: plan.city.code,
        name: plan.city.name,
        mapKey: String(plan.city.mapKey),
        center: { x: plan.city.cellX, y: plan.city.cellY },
        movable: plan.movable,
        pinned: plan.pinned,
        moves: plan.moves.length,
        stay: plan.stay,
        now: metricsView(plan.now),
        planned: metricsView(plan.planned),
        buildings: plan.buildings.map((building) => ({
          id: building.id,
          facility: building.facility,
          role: building.role,
          x: building.x,
          y: building.y,
          width: building.width,
          height: building.height,
          pinned: building.pinned,
          to: building.to,
        })),
      })),
      totals: {
        cities: plans.length,
        moves: plans.reduce((sum, plan) => sum + plan.moves.length, 0),
        pinned: plans.reduce((sum, plan) => sum + plan.pinned, 0),
      },
      request: request
        ? { requestedAtMs: request.requestedAtMs, appliedAtMs: request.appliedAtMs, report: request.report }
        : null,
    };
  };
  return {
    view,
    async request(actor) {
      const before = await view();
      if (!before) return undefined;
      await requestCityRelayout(o.pool, { planetId: o.planetId, userId: actor.userId, nowMs: o.now() });
      await audit(o.pool, actor, "world.city_relayout_request", { planetId: o.planetId, ...before.totals });
      return view();
    },
    async cancel(actor) {
      const cancelled = await cancelCityRelayout(o.pool, o.planetId);
      if (cancelled) await audit(o.pool, actor, "world.city_relayout_cancel", { planetId: o.planetId });
      return cancelled;
    },
  };
}

/** app.ts: 세계(준비되면 2차맵·시설 줄·팩)로 조회 서비스를 만든다. 행성 = 세계 시험 행성 */
export function cityLayoutServiceOf(
  world: {
    status(): { readonly state: string };
    readonly maps: ReadonlyMap<number, SecondMap>;
    readonly terrain: { cellValues?(mapKey: number): SeedLand | undefined } | undefined;
    readonly persistence:
      | {
          readonly facilities: {
            readonly service: { readonly facilities: ReadonlyMap<number, FacilityRecord> };
            catalog(): FacilityCatalog;
            gatherKinds(): readonly GatherKind[];
          };
        }
      | undefined;
  },
  pool: QueryPool,
  seed: () => WorldSeedCoefficients,
  now: () => number,
  planetId: string,
): CityLayoutService {
  return createCityLayoutService({
    pool,
    planetId,
    world: () => {
      const parts = world.persistence;
      if (world.status().state !== "ready" || !parts) return undefined;
      return {
        maps: world.maps,
        facilities: parts.facilities.service.facilities,
        catalog: parts.facilities.catalog(),
        gatherKinds: parts.facilities.gatherKinds(),
      };
    },
    seed,
    land: (mapKey) => world.terrain?.cellValues?.(mapKey),
    now,
  });
}
