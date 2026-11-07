// 1차맵 처음 볼 곳·다가가기 — docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름"(기획 60 §4.1 "지도는 내 사이보그에서 열림").
// 처음 볼 곳: 주소 ?key= 2차맵 > 내 사이보그 자리(둘 다 지역이 보이는 거리), 없으면 엔진 기본. ?planet-view=(시험)는 화면이 그 위에 얹는다.
import { type PlanetView, latLonOfMapKey } from "@terra/engine/planet";

/** [임시] 내 자리·주소 2차맵을 가운데로 열 때 카메라 거리 = 행성 반지름 × 이 값(지역이 보이는 높이) */
export const FOCUS_DISTANCE_RATIO = 0.35;
/** [임시] 묶음 표시를 누르면 거리를 이만큼 줄인다 */
export const CLUSTER_ZOOM = 0.25;

/** 처음 볼 곳. 둘 다 없으면 null(엔진 기본 보기) */
export function focusView(
  mapKey: number | null,
  me: { readonly latDeg: number; readonly lonDeg: number } | null,
  radiusM: number,
): PlanetView | null {
  const place = (mapKey === null ? null : latLonOfMapKey(mapKey)) ?? me;
  return place
    ? { latDeg: place.latDeg, lonDeg: place.lonDeg, distanceM: radiusM * FOCUS_DISTANCE_RATIO }
    : null;
}

/** 묶음(겹친 도시 표시)을 누르면: 그곳을 가운데로, 지금 거리 × CLUSTER_ZOOM(거리를 모르면 그대로) */
export function clusterView(
  place: { readonly latDeg: number; readonly lonDeg: number },
  distanceM: number | undefined,
): PlanetView {
  const next = (distanceM ?? 0) * CLUSTER_ZOOM;
  return { latDeg: place.latDeg, lonDeg: place.lonDeg, ...(next > 0 ? { distanceM: next } : {}) };
}
