// 2차맵 소품(map_props) 공용 이름표 — ADR 2026-10-31-second-map-from-planet(46) 4·5절.
// 콘텐츠 팩 스키마(packages/content), 2차맵 생성기(packages/planet secondMap), 엔진 그림(packages/engine)이 같은 표를 쓴다.
// - 그림 종류(art): 배치 칸마다 1바이트(지형 파일 TCTR 2판 소품 그림 층). 번호 = 이 배열의 위치다. 판정에는 쓰지 않는다(기기 장식).
//   한 번 쓴 번호는 다른 뜻으로 다시 쓰지 않는다(저장된 고정본 2차맵이 가리킨다). 새 그림은 끝에 더한다.
// - 배치 방식: forest = 숲 칸(숲 밀도와 노이즈로 차폐·은폐를 정한 칸)의 나무 그림을 고른다. scatter = 자기 엄폐 값으로 흩어 놓는다.
// - 환경 곡선 축과 단위: 콘텐츠에 적는 값의 단위다. 범위 밖 값은 스키마가 막는다.

/** 소품 그림 종류. 0(none)은 "없음"이라 콘텐츠 항목에는 쓰지 않는다 */
export const MAP_PROP_ARTS = [
  "none",
  "tree_broadleaf",
  "tree_conifer",
  "tree_palm",
  "bush",
  "reeds",
  "boulder",
  "log",
  // 2026-11-11 장식 소품(엄폐 0, 판정 없음 — 바이옴·환경 곡선으로 생성기가 놓아 그 땅다운 모습을 만든다. ADR 46 "바뀜 (2026-11-11)")
  "cactus",
  "dry_shrub",
  "tall_grass",
  "flowers",
  "stones",
  "driftwood",
  "termite_mound",
  "dead_tree",
  "fern",
  "ice_block",
  "bones",
] as const;

export type MapPropArt = (typeof MAP_PROP_ARTS)[number];

/** 그림 종류 → 번호(없으면 −1) */
export function mapPropArtCode(art: string): number {
  return (MAP_PROP_ARTS as readonly string[]).indexOf(art);
}

/** 배치 방식 */
export const MAP_PROP_PLACEMENTS = ["forest", "scatter"] as const;

export type MapPropPlacement = (typeof MAP_PROP_PLACEMENTS)[number];

/**
 * 환경 곡선 축 → 콘텐츠 값 범위 [최소, 최대](양끝 포함, 정수).
 * - temperatureC: 연평균 기온(°C). humidity: 습도(0 ~ 255, 행성 생성기와 같은 단위). precipitationMm: 연 강수(mm).
 * - realAltitudeM: 실제 환산 고도(m, 게임 높이 × 12, D-215). slopePct: 지형 칸(기준 11.72m) 높이 차 ÷ 칸 길이(%).
 * - absLatitude: 위도 절댓값(도). waterDistance: 가장 가까운 물(바다·호수·강) 배치 칸까지 칸 수(64에서 자름).
 */
export const MAP_PROP_CURVE_AXES = {
  temperatureC: [-100, 100],
  humidity: [0, 255],
  precipitationMm: [0, 20_000],
  realAltitudeM: [-20_000, 20_000],
  slopePct: [0, 1000],
  absLatitude: [0, 90],
  waterDistance: [0, 64],
} as const;

export type MapPropCurveAxis = keyof typeof MAP_PROP_CURVE_AXES;

/** 곡선 축 이름 목록(위 표 순서, 시험이 표와 같은지 본다) */
export const MAP_PROP_CURVE_AXIS_NAMES: readonly MapPropCurveAxis[] = [
  "temperatureC",
  "humidity",
  "precipitationMm",
  "realAltitudeM",
  "slopePct",
  "absLatitude",
  "waterDistance",
];

/** 덩이 크기(배치 칸): 노이즈 격자 간격이라 2의 거듭제곱만 */
export const MAP_PROP_CLUMP_CELLS = [2, 4, 8, 16, 32, 64] as const;
