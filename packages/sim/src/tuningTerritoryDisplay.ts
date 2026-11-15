// 1차맵 영토 표시 설정 칸 값 ↔ 계수표 — 기획 D-544("표시 상수(잇기 상한 12칸·표시 배율 2·최소 4칸)는 기술 [임시] 값 그대로, 설정 칸"),
// D-546(1431 지금 배후지 기준·1434 도시 소유 비콘은 외곽선을 넓힌다), docs/adr/2026-11-07-planet-view.md "바뀜 (2026-11-15 D-546)". D-568부터
// 판정(서버 영토 칸 소속 claimAt·비콘 놓기·지방, @terra/shared/territoryMap)도 같은 값을 읽는다(ADR 2026-11-16-territory-judgement-map). 시뮬은
// 영토를 셈하지 않아 읽지 않는다. 49에 칸이 없어 planet_territory_*를 앞머리로 쓴다(이름은 옛 "표시" 그대로 — 칸 ID는 바꾸지 않는다). 출발값은
// @terra/shared/territoryMap TERRITORY_MAP_START. 서버 world.cities·영토 서비스가 부를 때마다 실효 값을 읽는다(live).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code: "",
  target: "society",
  path: `territoryDisplay.${path}`,
  structural: false,
  ko,
  en,
});

export const TERRITORY_DISPLAY_TUNING_KEYS: readonly TuningKey[] = [
  k(
    "planet_territory_corridor_cells",
    "corridorCells",
    "1차맵 영토 표시: 같은 국가 도시를 잇는 가장 먼 거리(칸)",
    "Planet territory display: farthest same-nation city link (cells)",
  ),
  k(
    "planet_territory_radius_scale_pm",
    "radiusScalePm",
    "1차맵 영토 표시: 도시 원 = 지금 배후지 반경 × 이 배율(‰)",
    "Planet territory display: city circle = current catchment radius × this (‰)",
  ),
  k(
    "planet_territory_min_cells",
    "minCells",
    "1차맵 영토 표시: 도시 원 반지름 아래 끝(칸)",
    "Planet territory display: smallest city circle radius (cells)",
  ),
  k(
    "planet_territory_beacon_cells",
    "beaconCells",
    "1차맵 영토 표시: 도시 소유 비콘 둘레 여유(칸)",
    "Planet territory display: margin around city-owned beacons (cells)",
  ),
];
