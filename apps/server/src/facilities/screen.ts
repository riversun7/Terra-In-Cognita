// 건물 화면 조회(tRPC facilities.overview) — docs/adr/2026-11-07-buildings-runtime.md
// 세계(DB)가 있고 준비되면 건물 서비스의 자료, 아니면 빈 자료(status "not_ready", 규칙 값은 출발값)다.
import type {
  FacilitiesOverviewResponse,
  FacilityLandRuleResponse,
  FacilityTargetView,
  FacilityWaterMaskResponse,
} from "@terra/shared/facilities";
import { OLD_FACILITY_RUNTIME_RULES as R } from "@terra/shared/facilityRuntime";
import type { BuildingOwnerResponse, BusinessBooksResponse } from "@terra/shared/businessBooks";
import type { MapLooksResponse } from "@terra/shared/mapLooks";
import { waterMaskToHex } from "@terra/shared/waterNearby";
import { rolesAllow } from "../auth/permissions.ts";
import type { Viewer } from "../trpc/context.ts";
import type { SecondMap } from "../world/secondMap.ts";
import type { LandCheck } from "./landRule.ts";
import { type BeaconEntry, type FacilityViewSource, facilitiesOverview } from "./views.ts";

export interface FacilityScreenServices {
  overview(viewer: Viewer, nowMs: number): Promise<FacilitiesOverviewResponse>;
  /** 2차맵 건물 겉모습(시설·레벨·상태·국가, mapLooks.ts — ADR 2026-11-08-building-art) */
  mapLooks(viewer: Viewer, mapKey: number, nowMs: number): Promise<MapLooksResponse>;
  /** 띄운 2차맵의 물 표(물가 조건 미리 보기, 질문 947 나) */
  waterMask(mapKey: number): FacilityWaterMaskResponse;
  /** 그 2차맵(의 배치 칸, 없으면 가운데)에 지을 수 있나(땅 규칙, landRule.ts — 건축 모드 미리 묻기) */
  landRule(
    viewer: Viewer,
    mapKey: number,
    at?: { readonly x: number; readonly y: number },
  ): Promise<FacilityLandRuleResponse>;
  /** 사업장 장부(누구나 — D-555 1513, business/books.ts) */
  books(viewer: Viewer, buildingId: number, days: number, nowMs: number): Promise<BusinessBooksResponse>;
  /** 건물 판 머리 이름표(주인·대주주 이름, 누구나 — docs/adr/2026-11-15-building-screen.md) */
  owner(viewer: Viewer, buildingId: number): Promise<BuildingOwnerResponse>;
}

/** 세계가 준비됐을 때의 자료 */
export interface FacilityScreenSource {
  readonly view: FacilityViewSource;
  /** 사용자의 소유 주체(없으면 undefined) */
  ownerOf(userId: string): number | undefined;
  /** 내 세력 영토 비콘(기획 336 건물 규칙 — 수리 화면)과 재료를 꺼내는 도시(질문 410 ①) */
  beaconsOf(userId: string): Promise<readonly BeaconEntry[]>;
  /** 칠 수 있는 남의 시설·다른 세력 비콘(질문 381) */
  targetsOf(userId: string, nowMs: number): Promise<readonly FacilityTargetView[]>;
  /** 띄운 2차맵의 건물 가운데 그 사람이 보는 것의 겉모습(주인 → 국가는 DB에서 찾는다) */
  mapLooks(viewer: Viewer, mapKey: number, nowMs: number): Promise<MapLooksResponse>;
  /** 띄운 2차맵(없으면 undefined) — 물 표 */
  map(mapKey: number): Pick<SecondMap, "waterMask"> | undefined;
  /** 땅 규칙(짓기 명령과 같은 판정) */
  land: LandCheck;
  /** 사업장 장부(보는 사람의 소유 주체 기준) */
  books(userId: string, buildingId: number, days: number, nowMs: number): Promise<BusinessBooksResponse>;
  /** 건물 판 머리 이름표 */
  owner(userId: string, buildingId: number): Promise<BuildingOwnerResponse>;
}

function notReady(nowMs: number, dev: boolean): FacilitiesOverviewResponse {
  return {
    status: "not_ready",
    generatedAt: nowMs,
    rules: { ...R },
    maps: [],
    catalog: [],
    facilities: [],
    beacons: [],
    cities: [],
    places: [],
    materials: [],
    units: [],
    holdings: [],
    targets: [],
    dev,
  };
}

export function createFacilityScreenServices(
  source?: () => FacilityScreenSource | undefined,
): FacilityScreenServices {
  return {
    async overview(viewer, nowMs) {
      // 개발 시험 명령(재료 받기·바로 끝내기)은 dev·admin(gateway.ts와 같은 권한)
      const dev = rolesAllow(viewer.roles, { secondMap: ["dev-test"] });
      const found = source?.();
      if (!found) return notReady(nowMs, dev);
      const beacons = await found.beaconsOf(viewer.id);
      const targets = await found.targetsOf(viewer.id, nowMs);
      return facilitiesOverview(
        found.view,
        { userId: viewer.id, ownerId: found.ownerOf(viewer.id), nowMs, dev },
        beacons,
        targets,
      );
    },
    async mapLooks(viewer, mapKey, nowMs) {
      const found = source?.();
      if (!found) return { status: "not_ready", mapKey, buildings: [], generatedAt: nowMs };
      return found.mapLooks(viewer, mapKey, nowMs);
    },
    async books(viewer, buildingId, days, nowMs) {
      const found = source?.();
      if (!found) return { status: "not_ready" };
      return found.books(viewer.id, buildingId, days, nowMs);
    },
    async owner(viewer, buildingId) {
      const found = source?.();
      if (!found) return { status: "not_ready" };
      return found.owner(viewer.id, buildingId);
    },
    async landRule(viewer, mapKey, at) {
      const found = source?.();
      const shut = { mapKey, allowed: false, reason: null, cityFaction: null } as const;
      if (!found) return { status: "not_ready", ...shut };
      if (!found.map(mapKey)) return { status: "unknown_map", ...shut };
      const ownerId = found.ownerOf(viewer.id);
      if (ownerId === undefined) return { status: "ready", ...shut };
      const verdict = await found.land(ownerId, mapKey, at);
      return verdict.allowed
        ? { status: "ready", mapKey, allowed: true, reason: null, cityFaction: null }
        : {
            status: "ready",
            mapKey,
            allowed: false,
            reason: verdict.reason,
            cityFaction: verdict.cityFaction,
          };
    },
    waterMask(mapKey) {
      const found = source?.();
      if (!found) return { status: "not_ready", mapKey };
      const map = found.map(mapKey);
      if (!map) return { status: "unknown_map", mapKey };
      const mask = map.waterMask();
      return { status: "ready", mapKey, size: mask.size, hex: waterMaskToHex(mask) };
    },
  };
}
