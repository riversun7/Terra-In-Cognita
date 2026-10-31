// [시험용] 1차맵 처음 볼 곳 — 주소에 ?planet-view=<위도>,<경도>[,<거리 km>]를 붙이면 엔진 처음 보기(initialView)로 넘긴다.
// 하늘 사진·휴대폰 측정을 같은 자리·거리에서 하려고 둔다(ADR 2026-10-29-primary-map-sky "구현하며 정한 것"). 거리는 목표점에서
// 카메라까지이고 엔진이 가장 가까운·먼 거리로 묶는다. 틀린 값은 무시한다(엔진 기본 보기).
import type { PlanetView } from "@terra/engine/planet";

export const PLANET_VIEW_PARAM = "planet-view";

/** 주소 검색 문자열에서 처음 볼 곳을 읽는다. 없거나 틀리면 undefined */
export function planetViewOverride(search: string): PlanetView | undefined {
  const raw = new URLSearchParams(search).get(PLANET_VIEW_PARAM);
  if (raw === null) return undefined;
  const parts = raw.split(",").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => part === "")) return undefined;
  const [latDeg = Number.NaN, lonDeg = Number.NaN, distanceKm] = parts.map(Number);
  if (!(Number.isFinite(latDeg) && latDeg >= -90 && latDeg <= 90)) return undefined;
  if (!(Number.isFinite(lonDeg) && lonDeg >= -180 && lonDeg <= 360)) return undefined;
  if (distanceKm === undefined) return { latDeg, lonDeg };
  if (!(Number.isFinite(distanceKm) && distanceKm > 0)) return undefined;
  return { latDeg, lonDeg, distanceM: distanceKm * 1000 };
}

/** 엔진 옵션에 펼쳐 넣는다(값이 없으면 넣지 않는다 — exactOptionalPropertyTypes) */
export function planetViewOption(search: string): { initialView?: PlanetView } {
  const view = planetViewOverride(search);
  return view === undefined ? {} : { initialView: view };
}
