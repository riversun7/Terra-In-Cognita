// S1 시험용 봇 — 서버가 움직이는 유닛 1,000개(S1_TEST_BOTS). 게임 규칙이 아니라 부하·화면 시험용이다(ADR 33 "측정").
// - 크기·속도는 (2차맵 시드, 유닛 ID)로 정한다. 판단마다의 난수는 (2차맵 시드, 유닛 ID, 판단 횟수)로 새로 뽑는다(botRng).
//   판단 횟수(ai_step)를 유닛과 함께 저장하므로 서버를 다시 켜도 같은 유닛은 이어서 같은 차례의 값을 쓴다(S3 ADR 1절).
//   (워커 결과가 오는 시각은 매번 달라서 전체 움직임이 똑같이 되풀이되지는 않는다.)
// - 크기 등급 1·2·3 = 90·8·2%, 속도는 걷기 85%·차 15%(packages/sim 출발값).
// - 목적지는 지금 자리 둘레 TRIP_RADIUS_CELLS칸 안에서 그 등급이 설 수 있는 칸. 도착하면 2~6초 쉬고 다시 간다.
// - 집이 있는 봇(NPC 휴먼)은 집(도시 시청 칸) 둘레 HOME_RADIUS_CELLS 안에서 고른다(homeArea, docs/adr/2026-11-07-play-flow.md "WP-NPC").
// - 일터가 있는 NPC 휴먼(도시 경제가 일꾼으로 둔 시설, 기획 답 740 나 — docs/adr/2026-11-07-play-flow.md "WP-NPC2")은 일 주기의 일하는
//   몫 동안 그 시설 둘레에서 짧게 옮기며 오래 쉬고, 나머지 몫은 집 둘레를 걷는다(tripArea·arrivalIdleMs). 주기 시작은 유닛마다 흩는다.
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

/** 집이 있는 봇(NPC 휴먼)의 자리: 집(도시 시청 칸)과 일터(없으면 집 둘레만 걷는다). 저장하지 않는다(NPC 사회 런타임이 다시 넣는다) */
export interface BotHome {
  readonly x: number;
  readonly y: number;
  /** 일터 네모(도시 경제가 일꾼으로 둔 시설 건물 둘레, npc/humanPlaces.ts). 없으면 일하지 않는 휴먼(집 둘레) */
  readonly work?: TripArea | undefined;
}

/**
 * [임시] 일 주기(기획 답 740 나 — 수치는 정해진 것이 없다, D-515): 한 주기 WORK_CYCLE_MS 가운데 WORK_SHIFT_MS 동안 일터, 나머지는 집 둘레.
 * 유닛마다 주기 시작을 흩어(유닛 ID 해시) 한꺼번에 길을 묻지 않는다. 판정에 쓰지 않는다(보이는 움직임만 — 산출은 도시 경제가 센다)
 */
export const WORK_CYCLE_MS = 30 * 60_000;
export const WORK_SHIFT_MS = 20 * 60_000;
/** [임시] 일터 안에서 옮긴 뒤 쉬는 시간(일하는 모습 — 경로 요청을 줄인다) */
const WORK_IDLE_MIN_MS = 45_000;
const WORK_IDLE_SPREAD_MS = 90_000;
/** [임시] 집 둘레에 닿은 NPC 휴먼이 쉬는 시간(시험 봇 2~6초보다 길게 — 사람처럼 서 있다가 걷는다) */
const HOME_IDLE_MIN_MS = 8_000;
const HOME_IDLE_SPREAD_MS = 16_000;

/** 그 유닛이 지금 일하는 몫인가(일 주기, 유닛마다 흩은 시작) */
export function atWork(unitId: number, nowMs: number): boolean {
  const offset = (mix32(Math.imul(unitId, 0x2545_f491)) >>> 0) % WORK_CYCLE_MS;
  return (nowMs + offset) % WORK_CYCLE_MS < WORK_SHIFT_MS;
}

/** 지금 가려는 네모: 일하는 몫이고 일터가 있으면 일터, 아니면 집 둘레 */
function targetOf(home: BotHome, unitId: number, nowMs: number): TripArea {
  return home.work && atWork(unitId, nowMs) ? home.work : { x: home.x, y: home.y, radius: HOME_RADIUS_CELLS };
}

/**
 * 네모로 다가가는 목적지 네모: 그 네모에 들었거나 한 번 길(TRIP_RADIUS_CELLS) 안에 닿으면 그 네모, 멀면 그쪽으로 TRIP_RADIUS_CELLS만큼 다가간
 * 칸 둘레(작은 반경). 처음 들인 휴먼은 2차맵 아무 곳에 있다 → 몇 번 걸어 도시로 모인다(경로 예산 안의 짧은 길만 묻는다)
 */
function approach(from: Point, size: SizeClass, target: TripArea): TripArea {
  const here = anchorAt(from, size);
  const dx = target.x - here.x;
  const dy = target.y - here.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (distance <= Math.max(target.radius, TRIP_RADIUS_CELLS - target.radius)) return target;
  return {
    x: clampCell(here.x + Math.round((dx * TRIP_RADIUS_CELLS) / distance)),
    y: clampCell(here.y + Math.round((dy * TRIP_RADIUS_CELLS) / distance)),
    radius: HOME_STEP_RADIUS_CELLS,
  };
}

/** 집이 있는 봇의 목적지 네모(일터 없이 집만): 집에서 HOME_RADIUS_CELLS 안이면 집 둘레, 멀면 집 쪽으로 다가간 칸 둘레 */
export function homeArea(
  from: Point,
  size: SizeClass,
  home: { readonly x: number; readonly y: number },
): TripArea {
  return approach(from, size, { x: home.x, y: home.y, radius: HOME_RADIUS_CELLS });
}

/** 집이 있는 봇의 목적지 네모(일 주기에 따라 일터 또는 집) */
export function tripArea(
  from: Point,
  size: SizeClass,
  home: BotHome,
  unitId: number,
  nowMs: number,
): TripArea {
  return approach(from, size, targetOf(home, unitId, nowMs));
}

/**
 * 도착한 뒤 쉬는 시간: 집 없는 봇(시험 봇)은 예전과 같다(idleMs). 집이 있는 봇이 지금 가려는 네모 안에 닿았으면 일터는 길게(일하는 모습),
 * 집 둘레는 조금 길게, 아직 다가가는 중이면 짧게(예전 값). 난수는 어느 쪽이든 한 번 뽑는다(판단 차례가 같다)
 */
export function arrivalIdleMs(
  rng: Rng,
  bot: { readonly id: number; readonly size: SizeClass; readonly home: BotHome | undefined },
  at: Point,
  nowMs: number,
): number {
  const { home } = bot;
  if (!home) return idleMs(rng);
  const target = targetOf(home, bot.id, nowMs);
  const here = anchorAt(at, bot.size);
  if (Math.max(Math.abs(target.x - here.x), Math.abs(target.y - here.y)) > target.radius) return idleMs(rng);
  return target === home.work
    ? WORK_IDLE_MIN_MS + rng.nextInt(WORK_IDLE_SPREAD_MS + 1)
    : HOME_IDLE_MIN_MS + rng.nextInt(HOME_IDLE_SPREAD_MS + 1);
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
