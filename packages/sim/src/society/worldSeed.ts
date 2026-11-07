// 세계 씨앗(고정 NPC 국가의 시작 도시 수·기본 시설 수) — 기획 D-6041(세력마다 시작 도시 여러 곳, 60 §7.1 "2~4곳")·46 §9.2(고정 국가)·
// 90 §2.1(기본 NPC 국가·시작 도시 배치), docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗"·"WP5 나라 성격". 수치는 모두 [임시](D-515: 밸런싱
// 단계에서 정한다). 시뮬은 읽지 않는다(서버가 켤 때 시험 세계를 차릴 때만 읽는다: apps/server/src/npc/nations.ts·facilities/npcSeed.ts·
// world/worldLayout.ts — 국가 자리, docs/adr/2026-11-07-world-layout.md).

export interface WorldSeedCoefficients {
  /**
   * [임시] 국가 하나의 시작 도시 수 아래 끝(60 §7.1 "2~4곳"). 국가 프리셋에 성격 칸(시작 도시 수)이 없는 국가는 모두 이 수다
   * (기획 답 504 다 — 칸이 없으면 나 "모든 국가 같은 수")
   */
  readonly startCitiesMin: number;
  /** [임시] 국가 하나의 시작 도시 수 위 끝. 프리셋 성격 칸의 수는 아래 끝~위 끝 안으로 자른다(둘이 거꾸로면 작은 값이 아래 끝) */
  readonly startCitiesMax: number;
  /** [임시] 시작 도시 하나의 농장 수(팩 시설 farm) */
  readonly farms: number;
  /** [임시] 시작 도시 하나의 벌목장 수(팩 시설 lumber_camp) */
  readonly lumberCamps: number;
  /** [임시] 시작 도시 하나의 광산 수(팩 시설 mine) */
  readonly mines: number;
  /** [임시] 시작 도시 하나의 창고 수(팩 시설 storehouse) */
  readonly storehouses: number;
  /**
   * [임시] 둘레 땅에 맞춘 채집 시설(기획 답 503 다, 60 §7.1 "주변 자원"): 시작 도시 고르기 판이 보이는 그 2차맵 칸의 행성 값으로 고른다.
   * 숲 밀도가 이 %(0~100, 화면의 "숲 N%"와 같은 셈) 이상이면 벌목장
   */
  readonly lumberMinForestPct: number;
  /** [임시] 칸 고도(게임 m)가 이 값 이상이면 광산(산·고원) */
  readonly mineMinHeightM: number;
  /** [임시] 기온(°C)이 이 값 이상이고 강수(mm)가 아래 값 이상이면 농장(농사지을 땅) */
  readonly farmMinTempC: number;
  readonly farmMinRainMm: number;
  /**
   * [임시] 국가 자리 고르기(사용자 지적 2026-11-07 "도시가 겹치고 세력 범위가 엉망", docs/adr/2026-11-07-world-layout.md): 첫 국가 수도
   * 둘레 이 반경(1차맵 칸) 안의 알맞은 땅에서 국가 수도를 서로 가장 멀게 고른다. 국가 사이 거리가 아래 값보다 짧으면 반경을 두 배씩 넓힌다
   */
  readonly layoutRegionCells: number;
  /** [임시] 국가 수도 사이 가장 짧은 거리(1차맵 칸). 비콘 거리(N42 위 끝 13.3칸)의 두 배보다 길어 국가 영토가 닿지 않는다 */
  readonly layoutNationGapCells: number;
  /** [임시] 한 국가 시작 도시 사이 칸(1 = 수도와 붙은 2차맵 — 띄운 2차맵끼리 이어져 걸어서 오간다) */
  readonly layoutCityStepCells: number;
  /** [임시] 시작 도시가 설 땅: 물(바다·호수·강·해안) 없음 + 칸 고도 0 초과 이 값(m) 이하 */
  readonly layoutLandMaxHeightM: number;
  /** [임시] 시작 도시가 설 땅: 기온(°C) 아래 끝·위 끝 */
  readonly layoutLandMinTempC: number;
  readonly layoutLandMaxTempC: number;
}

/** 출발값 — 모두 [임시](옛 규칙 없음, D-515). 시작 도시 2~4곳(60 §7.1), 기본 시설은 종류마다 하나 */
export const START_WORLD_SEED: WorldSeedCoefficients = {
  startCitiesMin: 2,
  startCitiesMax: 4,
  farms: 1,
  lumberCamps: 1,
  mines: 1,
  storehouses: 1,
  // 시작 도시 판의 숲 표시 문턱(숲 밀도 13/255 ≈ 5%)과 같다: 판에 숲이 보이면 벌목장
  lumberMinForestPct: 5,
  mineMinHeightM: 500,
  farmMinTempC: 5,
  farmMinRainMm: 250,
  // 국가 자리: 지금 시험 행성(반지름 약 531km)에서 국가 넷이 수십~백 km 떨어지게
  layoutRegionCells: 48,
  layoutNationGapCells: 30,
  layoutCityStepCells: 1,
  layoutLandMaxHeightM: 1500,
  layoutLandMinTempC: 0,
  layoutLandMaxTempC: 32,
};

/** 시작 도시 수가 놓일 수 있는 범위(60 §7.1 "2~4곳"을 넘지 않게, 칸이 1까지는 받는다) */
export const START_CITIES_LIMIT = { min: 1, max: 4 } as const;

/** 시작 도시 수 범위 안으로 자른다(정수) */
const clamp = (value: number) =>
  Math.max(START_CITIES_LIMIT.min, Math.min(START_CITIES_LIMIT.max, Math.trunc(value)));

/**
 * 고정 국가 하나가 가질 시작 도시 수(기획 답 504 다): 국가 프리셋 성격 칸의 수(personality)를 설정 칸 아래 끝~위 끝 안으로 자른 값.
 * 성격 칸이 없으면 모든 국가가 아래 끝(504 나). 칸 두 값이 거꾸로여도 작은 값을 아래로 친다. 결과는 START_CITIES_LIMIT 안이다
 */
export function startCitiesFor(seed: WorldSeedCoefficients, personality?: number): number {
  const low = clamp(Math.min(seed.startCitiesMin, seed.startCitiesMax));
  const high = clamp(Math.max(seed.startCitiesMin, seed.startCitiesMax));
  if (personality === undefined || !Number.isFinite(personality)) return low;
  return Math.max(low, Math.min(high, Math.trunc(personality)));
}
