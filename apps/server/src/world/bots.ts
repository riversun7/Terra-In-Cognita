// S1 시험용 봇 — 서버가 움직이는 유닛 1,000개(S1_TEST_BOTS). 게임 규칙이 아니라 부하·화면 시험용이다(ADR 33 "측정").
// - 크기·속도는 (2차맵 시드, 유닛 ID)로 정한다. 판단마다의 난수는 (2차맵 시드, 유닛 ID, 판단 횟수)로 새로 뽑는다(botRng).
//   판단 횟수(ai_step)를 유닛과 함께 저장하므로 서버를 다시 켜도 같은 유닛은 이어서 같은 차례의 값을 쓴다(S3 ADR 1절).
//   (워커 결과가 오는 시각은 매번 달라서 전체 움직임이 똑같이 되풀이되지는 않는다.)
// - 크기 등급 1·2·3 = 90·8·2%, 속도는 걷기 85%·차 15%(packages/sim 출발값).
// - 목적지는 지금 자리 둘레 TRIP_RADIUS_CELLS칸 안에서 그 등급이 설 수 있는 칸. 도착하면 2~6초 쉬고 다시 간다.
// - 집이 있는 봇(NPC 휴먼)은 집(도시 시청 칸) 둘레 HOME_RADIUS_CELLS 안에서 고른다(homeArea, docs/adr/2026-11-07-play-flow.md "WP-NPC").
import { createRng, type Rng } from "@terra/shared";
import {
  CAR_SPEED,
  PLACEMENT_SIZE,
  type PlacementGrid,
  type Point,
  type SizeClass,
  WALK_SPEED,
  anchorAt,
  anchorCenter,
  isPassable,
  mix32,
} from "@terra/sim";

/** 목적지를 고르는 범위(칸). 걷기 평균 약 1~2분, 차 약 10초 걸리는 거리 */
export const TRIP_RADIUS_CELLS = 48;
/** 너무 가까운 목적지는 고르지 않는다(칸) */
const MIN_TRIP_CELLS = 4;
const IDLE_MIN_MS = 2_000;
const IDLE_SPREAD_MS = 4_000;
/** 길을 못 찾았을 때 다시 해 보기까지 */
const RETRY_MIN_MS = 1_000;
const RETRY_SPREAD_MS = 2_000;
/** 시작할 때 첫 출발을 이 시간 안에 흩어 놓는다(경로 요청이 한꺼번에 몰리지 않게) */
const START_SPREAD_MS = 5_000;
const PICK_ATTEMPTS = 16;
const SPAWN_ATTEMPTS = 4_096;

export interface BotPlan {
  /** 처음 자리 고르기에 쓰는 난수(판단 횟수 0) */
  rng: Rng;
  size: SizeClass;
  speed: number;
}

/** 봇 하나의 판단 step번째 난수 — (2차맵 시드, 유닛 ID, 판단 횟수)로 정해진다 */
export function botRng(mapSeed: number, unitId: number, step: number): Rng {
  return createRng(mix32(mapSeed ^ Math.imul(unitId, 0x9e37_79b1) ^ Math.imul(step + 1, 0x85eb_ca6b)));
}

/** 봇 하나의 크기·속도 (유닛 ID와 2차맵 시드로 정해진다)와 처음 자리 난수 */
export function botPlan(mapSeed: number, unitId: number): BotPlan {
  const rng = createRng(mix32(mapSeed ^ Math.imul(unitId, 0x9e37_79b1)));
  const sizeRoll = rng.nextInt(100);
  const size: SizeClass = sizeRoll < 90 ? 1 : sizeRoll < 98 ? 2 : 3;
  const speed = rng.nextInt(100) < 15 ? CAR_SPEED : WALK_SPEED;
  return { rng, size, speed };
}

/** 그 등급이 설 수 있는 아무 기준 칸의 중심. 없으면 undefined */
export function pickSpawn(grid: PlacementGrid, rng: Rng, size: SizeClass): Point | undefined {
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
    const x = rng.nextInt(PLACEMENT_SIZE);
    const y = rng.nextInt(PLACEMENT_SIZE);
    if (isPassable(grid, x, y, size)) return anchorCenter(x, y, size);
  }
  return undefined;
}

function clampCell(value: number): number {
  return value < 0 ? 0 : value >= PLACEMENT_SIZE ? PLACEMENT_SIZE - 1 : value;
}

/** 목적지를 고를 네모(가운데 칸·반경 칸) */
export interface TripArea {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * 집이 있는 봇(NPC 휴먼 — 집 = 그 도시 시청 칸, docs/adr/2026-11-07-play-flow.md "WP-NPC")이 그 둘레에서 고르는 반경(칸) [임시].
 * 사이보그 시야(24칸)·도시 기본 시설 자리(가운데에서 48칸 안)와 견줄 만큼 — 도시에 가면 휴먼이 보인다(사용자 지적 2026-11-08)
 */
export const HOME_RADIUS_CELLS = 32;
/** 집에서 멀리 있는 봇이 집 쪽으로 한 번에 다가가는 곳 둘레의 반경(칸) */
const HOME_STEP_RADIUS_CELLS = 8;

/**
 * 집이 있는 봇의 목적지 네모: 집에서 HOME_RADIUS_CELLS 안이면 집 둘레, 멀면 집 쪽으로 TRIP_RADIUS_CELLS만큼 다가간 칸 둘레(작은 반경).
 * 처음 들인 휴먼은 2차맵 아무 곳에 있다 → 몇 번 걸어 도시로 모인다(경로 예산 안의 짧은 길만 묻는다)
 */
export function homeArea(
  from: Point,
  size: SizeClass,
  home: { readonly x: number; readonly y: number },
): TripArea {
  const here = anchorAt(from, size);
  const dx = home.x - here.x;
  const dy = home.y - here.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (distance <= HOME_RADIUS_CELLS) return { x: home.x, y: home.y, radius: HOME_RADIUS_CELLS };
  return {
    x: clampCell(here.x + Math.round((dx * TRIP_RADIUS_CELLS) / distance)),
    y: clampCell(here.y + Math.round((dy * TRIP_RADIUS_CELLS) / distance)),
    radius: HOME_STEP_RADIUS_CELLS,
  };
}

/** 목적지 하나: 네모(없으면 지금 자리 둘레 TRIP_RADIUS_CELLS) 안 설 수 있는 칸. 못 고르면 undefined(잠시 뒤 다시) */
export function pickDestination(
  grid: PlacementGrid,
  rng: Rng,
  size: SizeClass,
  from: Point,
  area?: TripArea,
): Point | undefined {
  const here = anchorAt(from, size);
  const center = area ?? { x: here.x, y: here.y, radius: TRIP_RADIUS_CELLS };
  const span = center.radius * 2 + 1;
  for (let attempt = 0; attempt < PICK_ATTEMPTS; attempt++) {
    const x = clampCell(center.x + rng.nextInt(span) - center.radius);
    const y = clampCell(center.y + rng.nextInt(span) - center.radius);
    if (Math.max(Math.abs(x - here.x), Math.abs(y - here.y)) < MIN_TRIP_CELLS) continue;
    if (isPassable(grid, x, y, size)) return anchorCenter(x, y, size);
  }
  return undefined;
}

export function idleMs(rng: Rng): number {
  return IDLE_MIN_MS + rng.nextInt(IDLE_SPREAD_MS + 1);
}

export function retryMs(rng: Rng): number {
  return RETRY_MIN_MS + rng.nextInt(RETRY_SPREAD_MS + 1);
}

export function startDelayMs(rng: Rng): number {
  return rng.nextInt(START_SPREAD_MS);
}
