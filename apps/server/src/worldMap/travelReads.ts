// 2차맵 사이 이동·내 전역 유닛 위치 조회(서버, 읽기만) — tRPC world.travelPlan·world.travels.
// docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동"·"WP11".
// - travelPlan: 1차맵 명령 판의 확인 단계(지나는 2차맵·거리·걸리는 시간·위험 구간).
// - travels: 내 유닛의 길(가는 중 + 최근 끝난 것, 1차맵 이동 경로 routePoints 포함),
//   좌표 유닛(parked), 그리고 행성 전체의 내 모든 유닛(units: 사이보그 본체 + 띄운 2차맵 + 좌표 유닛 + 이동 중)을 돌려준다.
// 메모리만 읽어 매우 가볍고, 세계가 준비되기 전이면 not_ready.
import { CELL_UNITS, PLACEMENT_SIZE, positionAt } from "@terra/sim";
import type {
  WorldMyUnit,
  WorldMyUnitKind,
  WorldParkedUnit,
  WorldTravel,
  WorldTravelDanger,
  WorldTravelPlanResponse,
  WorldTravelsResponse,
} from "@terra/shared/worldMap";
import type { TravelService, TravelTarget } from "../travel/service.ts";
import type { Viewer } from "../trpc/context.ts";
import type { SecondMap } from "../world/secondMap.ts";
import {
  UNIT_KIND_BOAT,
  UNIT_KIND_CYBORG,
  UNIT_KIND_CYBORG_UNIT,
  UNIT_KIND_HUMAN,
} from "../world/unitKinds.ts";

/** 확인 단계 입력: 목적 2차맵·칸, 보낼 유닛(없으면 내 사이보그 본체) */
export type TravelPlanInput = TravelTarget & { readonly unitId?: number | undefined };

/** 위험 구간을 붙이는 함수(없으면 위험 없음·모르는 2차맵 0) */
export type TravelDangerOf = (
  viewer: Viewer,
  route: readonly number[],
) => Promise<{ dangers: WorldTravelDanger[]; unknownMaps: number }>;

export interface TravelReads {
  travels(viewer: Viewer, nowMs: number): WorldTravelsResponse;
  travelPlan(viewer: Viewer, input: TravelPlanInput, nowMs: number): Promise<WorldTravelPlanResponse>;
}

/** 전역 내 유닛 수집에 쓰는 선택 출처(띄운 2차맵·사이보그 이름) */
export interface TravelUnitSource {
  readonly maps?: (() => Iterable<Pick<SecondMap, "mapKey" | "forEachUnit" | "unitInfo">>) | undefined;
  readonly cyborgName?: ((userId: string) => string | undefined) | undefined;
}

const clampCell = (value: number): number => Math.max(0, Math.min(PLACEMENT_SIZE - 1, value));
const MID_CELL = Math.floor(PLACEMENT_SIZE / 2);

function mapUnitKindOf(kind: number): WorldMyUnitKind {
  if (kind === UNIT_KIND_CYBORG) return "cyborg";
  if (kind === UNIT_KIND_HUMAN) return "human";
  if (kind === UNIT_KIND_CYBORG_UNIT) return "cyborg_unit";
  if (kind === UNIT_KIND_BOAT) return "boat";
  return "other";
}

function unitSortRank(unit: WorldMyUnit): number {
  if (unit.kind === "cyborg") return 0;
  if (unit.moving) return 1;
  if (unit.kind === "boat") return 2;
  if (unit.kind === "cyborg_unit") return 3;
  // 수호신(휴먼의 상태, 기획 D-589)은 휴먼 앞에
  if (unit.guardian === true) return 4;
  if (unit.kind === "human") return 5;
  return 6;
}

export function createTravelReads(
  travel: () => TravelService | undefined,
  latLon: (mapKey: number, x: number, y: number) => { latDeg: number; lonDeg: number },
  danger?: TravelDangerOf,
  ownerOf?: (userId: string) => number | undefined,
  unitSource?: TravelUnitSource,
): TravelReads {
  return {
    travels(viewer, nowMs) {
      const service = travel();
      if (!service) return { status: "not_ready", travels: [], generatedAt: nowMs };
      const rawTravels = service.list(viewer.id);
      const travels: WorldTravel[] = rawTravels.map((view) => {
        const current = latLon(view.mapKey, view.cellX, view.cellY);
        const routePoints: (readonly [number, number])[] = [];
        if (view.state === "going" && view.route.length > 0) {
          routePoints.push([current.latDeg, current.lonDeg]);
          const lastIdx = view.route.length - 1;
          for (let idx = Math.max(0, view.leg + 1); idx <= lastIdx; idx++) {
            const key = view.route[idx];
            if (key === undefined) continue;
            const pt =
              idx === lastIdx ? latLon(key, view.targetX, view.targetY) : latLon(key, MID_CELL, MID_CELL);
            routePoints.push([pt.latDeg, pt.lonDeg]);
          }
        }
        return {
          ...view,
          ...current,
          ...(routePoints.length >= 2 ? { routePoints } : {}),
        };
      });

      const ownerId = ownerOf?.(viewer.id);
      const coordUnits = ownerId === undefined ? [] : service.coordinateUnits(new Set([ownerId]));
      const parked: WorldParkedUnit[] = coordUnits
        .filter((unit) => !unit.moving && unit.aboard === null)
        .map((unit) => ({
          unitId: unit.unitId,
          mapKey: unit.mapKey,
          cellX: unit.cellX,
          cellY: unit.cellY,
          ...latLon(unit.mapKey, unit.cellX, unit.cellY),
          cyborg: unit.kind === UNIT_KIND_CYBORG,
          boat: unit.kind === UNIT_KIND_BOAT,
        }));

      // 행성 전역의 내 모든 유닛(띄운 2차맵 + 좌표 유닛 + 이동 중) — 중복 unitId는 하나로 합친다
      const byId = new Map<number, WorldMyUnit>();
      const cyborgName = unitSource?.cyborgName?.(viewer.id) ?? null;
      const goingByUnit = new Map(
        travels.filter((entry) => entry.state === "going").map((entry) => [entry.unitId, entry]),
      );

      if (ownerId !== undefined) {
        for (const map of unitSource?.maps?.() ?? []) {
          map.forEachUnit((summary) => {
            if (summary.ownerId !== ownerId) return;
            const info = map.unitInfo(summary.id);
            if (!info) return;
            const kind = mapUnitKindOf(info.kind);
            const at = positionAt(info.motion, nowMs);
            const cellX = clampCell(Math.floor(at.x / CELL_UNITS));
            const cellY = clampCell(Math.floor(at.y / CELL_UNITS));
            const going = goingByUnit.get(summary.id);
            const coords = going
              ? {
                  mapKey: going.mapKey,
                  cellX: going.cellX,
                  cellY: going.cellY,
                  latDeg: going.latDeg,
                  lonDeg: going.lonDeg,
                }
              : { mapKey: map.mapKey, cellX, cellY, ...latLon(map.mapKey, cellX, cellY) };
            byId.set(summary.id, {
              unitId: summary.id,
              kind,
              ...(kind === "cyborg" && cyborgName ? { name: cyborgName } : {}),
              ...coords,
              loaded: going ? !going.hidden : true,
              moving: going !== undefined,
              working: info.job.job !== 0,
              aboardId: info.aboard ?? null,
              ...(info.guardian ? { guardian: true } : {}),
            });
          });
        }
        for (const unit of coordUnits) {
          if (byId.has(unit.unitId)) continue;
          const kind = mapUnitKindOf(unit.kind);
          const going = goingByUnit.get(unit.unitId);
          const coords = going
            ? {
                mapKey: going.mapKey,
                cellX: going.cellX,
                cellY: going.cellY,
                latDeg: going.latDeg,
                lonDeg: going.lonDeg,
              }
            : {
                mapKey: unit.mapKey,
                cellX: unit.cellX,
                cellY: unit.cellY,
                ...latLon(unit.mapKey, unit.cellX, unit.cellY),
              };
          byId.set(unit.unitId, {
            unitId: unit.unitId,
            kind,
            ...(kind === "cyborg" && cyborgName ? { name: cyborgName } : {}),
            ...coords,
            loaded: false,
            moving: going !== undefined || unit.moving,
            working: false,
            aboardId: unit.aboard ?? null,
          });
        }
      }
      const units = [...byId.values()].toSorted(
        (a, b) => unitSortRank(a) - unitSortRank(b) || a.unitId - b.unitId,
      );

      return { status: "ready", travels, parked, units, generatedAt: nowMs };
    },
    async travelPlan(viewer, input, nowMs) {
      const service = travel();
      if (!service) return { status: "not_ready", plan: null, problem: null, generatedAt: nowMs };
      const result = service.plan(viewer.id, input);
      if (!result.ok) return { status: "ready", plan: null, problem: result.problem, generatedAt: nowMs };
      const known = danger ? await danger(viewer, result.plan.route) : { dangers: [], unknownMaps: 0 };
      return { status: "ready", plan: { ...result.plan, ...known }, problem: null, generatedAt: nowMs };
    },
  };
}
