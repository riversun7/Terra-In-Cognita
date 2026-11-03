// 영토 층 설정 칸 값 ↔ 계수표 — docs/adr/2026-11-03-territory-layer.md, 기획 D-104·D-485·D-486, 49 M2·M3·N42·N51
// 팩 항목 ID ↔ 세력·사회 계수표 territory 칸(경로). 출발값은 @terra/shared START_TERRITORY_COEFFICIENTS(영향권 = D-104 표,
// 비콘 수 = D-485 3~5, 거리 = N42 옛 15·20km ÷ 평균 칸 1.5007km, 내구도 = N51 옛 10, 등급 문턱 = [임시]).
// 팩 항목의 단위·기술 범위(unit·min·max)는 content/core/tuning.json에 적는다. 서버 영토 서비스가 쓸 때마다 읽는다(live).
import type { TuningKey } from "./tuning.ts";

const k = (id: string, code: string, path: string, ko: string, en: string): TuningKey => ({
  id,
  code,
  target: "society",
  path: `territory.${path}`,
  structural: false,
  ko,
  en,
});

/** 도시 등급 이름(D-104 표 차례) */
const GRADES = [
  ["마을", "village"],
  ["읍", "town"],
  ["소도시", "small city"],
  ["도시", "city"],
  ["대도시", "metropolis"],
  ["거대도시", "megacity"],
] as const;

export const TERRITORY_TUNING_KEYS: readonly TuningKey[] = [
  ...GRADES.slice(1).map(([ko, en], index) =>
    k(
      `m2_grade_l${index + 2}`,
      "M2",
      `gradeAtDevelopment.${index}`,
      `도시 등급 문턱: ${ko}(발전도)`,
      `City grade threshold: ${en} (development points)`,
    ),
  ),
  ...GRADES.map(([ko, en], index) =>
    k(
      `m3_city_radius_l${index + 1}`,
      "M3",
      `influenceMilli.${index}`,
      `도시 영향권 반경: ${ko}(1/1000칸)`,
      `City influence radius: ${en} (1/1000 cell)`,
    ),
  ),
  ...GRADES.map(([ko, en], index) =>
    k(
      `n42_beacons_l${index + 1}`,
      "N42",
      `beaconsPerCity.${index}`,
      `영토 비콘 수: ${ko}`,
      `Territory beacons: ${en} (count)`,
    ),
  ),
  ...GRADES.map(([ko, en], index) =>
    k(
      `n42_range_l${index + 1}`,
      "N42",
      `beaconRangeMilli.${index}`,
      `영토 비콘 최대 거리: ${ko}(1/1000칸)`,
      `Territory beacon max distance: ${en} (1/1000 cell)`,
    ),
  ),
  k(
    "n51_beacon_durability",
    "N51",
    "beaconDurability",
    "영토 비콘 내구도",
    "Territory beacon durability (points)",
  ),
];
