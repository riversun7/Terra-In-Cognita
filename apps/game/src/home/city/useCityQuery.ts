// 홈 [도시 활동] 카드의 조회 — 열쇠(2차맵 키 등) 하나에 조회 하나. 열쇠가 null이면 묻지 않는다(유닛·자원 탭은 눌러야 받는다 — 사용자 요청
// 2026-11-25 "유닛이나 자원탭은 눌러야 로딩되게하여 부하줄임"). 주기 타이머는 두지 않는다: 열쇠가 바뀔 때·[새로고침]·건물 판을 닫을 때만 받는다.
// 다시 받는 동안에는 같은 열쇠의 앞 값을 그대로 그린다(깜빡이지 않게). 늦게 온 답은 버린다(roster/useRosterQuery.ts와 같은 틀).
import type { FacilityLandRuleResponse } from "@terra/shared/facilities";
import type { GatherLoopsResponse, GatherObjectsResponse } from "@terra/shared/gather";
import type { MapLooksResponse } from "@terra/shared/mapLooks";
import type { MapUnitsResponse, NearbyUnitsResponse } from "@terra/shared/mapUnits";
import type { WorldCitiesResponse, WorldTravelsResponse } from "@terra/shared/worldMap";
import { type TerrainData, decodeTerrain, terrainPath } from "@terra/protocol";
import { useCallback, useEffect, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { loadGatherLoops, loadGatherObjects } from "../../map/gather/gatherData.ts";
import { loadMapUnits } from "../../map/mapUnits.ts";
import { loadTravels } from "../../map/travelData.ts";
import { loadWorldCities } from "../../map/worldMapData.ts";
import { api } from "../../net/api.ts";
import { apiErrorInfo } from "../../net/apiErrors.ts";

/** 응답이 오지 않으면 끊는 시간 */
const REQUEST_TIMEOUT_MS = 10_000;

/** 열쇠(글자)와 끊기 신호를 받아 묻는 함수. 모듈 바깥 값(바뀌지 않는 함수)을 넘긴다 */
export type CityLoader<T> = (key: string, signal: AbortSignal) => Promise<T>;

export type CityQueryState<T> =
  | { readonly status: "idle"; readonly data: null }
  | { readonly status: "loading"; readonly data: T | null }
  | { readonly status: "ready"; readonly data: T }
  | { readonly status: "error"; readonly data: T | null };

export interface CityQuery<T> {
  readonly state: CityQueryState<T>;
  readonly reload: () => void;
}

interface Held<T> {
  readonly key: string;
  readonly version: number;
  readonly data: T | null;
  readonly failed: boolean;
}

const IDLE = { status: "idle", data: null } as const;

export function useCityQuery<T>(key: string | null, load: CityLoader<T>): CityQuery<T> {
  const [version, setVersion] = useState(0);
  const [held, setHeld] = useState<Held<T> | null>(null);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    if (key === null) return undefined;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    load(key, controller.signal).then(
      (data) => {
        if (active) setHeld({ key, version, data, failed: false });
      },
      (error: unknown) => {
        if (!active) return;
        if (apiErrorInfo(error).sessionEnded) void refreshSession();
        // 실패해도 같은 열쇠의 앞 값은 남긴다(목록을 비우지 않는다)
        setHeld((before) => ({
          key,
          version,
          data: before !== null && before.key === key ? before.data : null,
          failed: true,
        }));
      },
    );
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [key, version, load]);

  if (key === null) return { state: IDLE, reload };
  const same = held !== null && held.key === key ? held : null;
  if (same === null || same.version !== version) {
    return { state: { status: "loading", data: same?.data ?? null }, reload };
  }
  if (same.failed) return { state: { status: "error", data: same.data }, reload };
  // 실패가 아니면 값이 있다(성공한 답만 failed: false로 든다)
  return same.data === null
    ? { state: { status: "error", data: null }, reload }
    : { state: { status: "ready", data: same.data }, reload };
}

/** 내 유닛 전체(사이보그 본체 + 모든 2차맵의 내 유닛 — world.travels의 units). 열쇠는 쓰지 않는다 */
export const loadMyUnits: CityLoader<WorldTravelsResponse> = (_key, signal) => loadTravels(signal);

/** 도시·국가 목록(이 2차맵의 도시 이름·등급·둘레 땅). 열쇠는 쓰지 않는다 */
export const loadCities: CityLoader<WorldCitiesResponse> = (_key, signal) => loadWorldCities(signal);

/** 그 2차맵의 보이는 건물(시야 규칙은 서버 — 2차맵 화면과 같다) */
export const loadBuildings: CityLoader<MapLooksResponse> = (key, signal) =>
  api.facilities.mapLooks.query({ mapKey: Number(key) }, { signal });

/** 그 2차맵에 지을 수 있나·정부 건물을 지으면 새 도시가 되나 */
export const loadLandRule: CityLoader<FacilityLandRuleResponse> = (key, signal) =>
  api.facilities.landRule.query({ mapKey: Number(key) }, { signal });

/** 그 2차맵의 내 유닛(직무·상태) */
export const loadUnitsHere: CityLoader<MapUnitsResponse> = (key, signal) => loadMapUnits(Number(key), signal);

/** 그 2차맵의 자원 오브젝트 */
export const loadResources: CityLoader<GatherObjectsResponse> = (key, signal) =>
  loadGatherObjects(Number(key), signal);

/** 내 채집·들어가기 줄(건물 판에서 보낸 명령의 진행). 열쇠는 쓰지 않는다 */
export const loadLoops: CityLoader<GatherLoopsResponse> = (_key, signal) => loadGatherLoops(signal);

/**
 * 그 2차맵에서 지금 내 시야 안에 있는 남의 유닛(가까운 차례). 열쇠 = "2차맵 키:기준 유닛 ID"(거리를 그 유닛에서 잰다)
 */
export const loadNearbyUnits: CityLoader<NearbyUnitsResponse> = (key, signal) => {
  const [mapKey = "0", unitId = "0"] = key.split(":");
  return api.world.nearbyUnits.query({ mapKey: Number(mapKey), unitId: Number(unitId) }, { signal });
};

/**
 * 그 2차맵의 지형 파일(미니맵). 판 표지를 모르므로(지도 자료 스냅샷이 알려 준다) 아무 표지로 묻는다 — 서버가 지금 표지 주소로 넘겨 주고(307,
 * apps/server world/terrainRoute.ts) 그 주소의 답은 기기에 오래 남는다(불변 주소). 볼 수 없는 2차맵·띄우지 않은 곳은 404 → 실패
 */
export const loadTerrain: CityLoader<TerrainData> = async (key, signal) => {
  const response = await fetch(terrainPath(Number(key), "current"), { credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`terrain request failed: HTTP ${response.status}`);
  return decodeTerrain(await response.arrayBuffer());
};
