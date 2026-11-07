// 세계 씨앗(고정 NPC 국가의 시작 도시 수·기본 시설 수) — 기획 D-6041(세력마다 시작 도시 여러 곳, 60 §7.1 "2~4곳")·46 §9.2(고정 국가)·
// 90 §2.1(기본 NPC 국가·시작 도시 배치), docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗". 수치는 모두 [임시](D-515: 밸런싱 단계에서 정한다).
// 시뮬은 읽지 않는다(서버가 켤 때 시험 세계를 차릴 때만 읽는다: apps/server/src/npc/nations.ts·facilities/npcSeed.ts).

export interface WorldSeedCoefficients {
  /** [임시] 국가 하나의 시작 도시 수 아래 끝(60 §7.1 "2~4곳") */
  readonly startCitiesMin: number;
  /** [임시] 국가 하나의 시작 도시 수 위 끝. 국가 차례로 아래 끝 → 위 끝을 돈다(둘이 거꾸로면 작은 값이 아래 끝) */
  readonly startCitiesMax: number;
  /** [임시] 시작 도시 하나의 농장 수(팩 시설 farm) */
  readonly farms: number;
  /** [임시] 시작 도시 하나의 벌목장 수(팩 시설 lumber_camp) */
  readonly lumberCamps: number;
  /** [임시] 시작 도시 하나의 광산 수(팩 시설 mine) */
  readonly mines: number;
  /** [임시] 시작 도시 하나의 창고 수(팩 시설 storehouse) */
  readonly storehouses: number;
}

/** 출발값 — 모두 [임시](옛 규칙 없음, D-515). 시작 도시 2~3곳(60 §7.1 아래쪽), 기본 시설은 종류마다 하나 */
export const START_WORLD_SEED: WorldSeedCoefficients = {
  startCitiesMin: 2,
  startCitiesMax: 3,
  farms: 1,
  lumberCamps: 1,
  mines: 1,
  storehouses: 1,
};

/** 시작 도시 수가 놓일 수 있는 범위(60 §7.1 "2~4곳"을 넘지 않게, 칸이 1까지는 받는다) */
export const START_CITIES_LIMIT = { min: 1, max: 4 } as const;

/** 시작 도시 수 범위 안으로 자른다(정수) */
const clamp = (value: number) =>
  Math.max(START_CITIES_LIMIT.min, Math.min(START_CITIES_LIMIT.max, Math.trunc(value)));

/**
 * n번째(1부터) 고정 국가가 가질 시작 도시 수: 아래 끝 + (n − 1) mod (위 − 아래 + 1). 칸 두 값이 거꾸로여도 작은 값을 아래로 친다.
 * 결과는 START_CITIES_LIMIT 안으로 자른다
 */
export function startCitiesFor(nation: number, seed: WorldSeedCoefficients): number {
  const low = clamp(Math.min(seed.startCitiesMin, seed.startCitiesMax));
  const high = clamp(Math.max(seed.startCitiesMin, seed.startCitiesMax));
  const index = Math.max(0, Math.trunc(nation) - 1);
  return low + (index % (high - low + 1));
}
