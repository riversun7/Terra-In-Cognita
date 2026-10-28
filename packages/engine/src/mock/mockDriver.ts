// [임시] 가짜 "서버": 유닛 1,000개에 아무 경로나 준다. 서버 경로탐색(packages/sim)과 시험용 봇이 생기면 지운다.
// 진짜 흐름과 같게, 경로가 바뀔 때만 엔진에 보낸다(도착한 유닛에게 잠깐 쉰 뒤 새 경로). 위치는 엔진이 경로를 따라 계산한다.
// 손으로 명령한 유닛(claim)은 더 건드리지 않는다.
import { type Rng, createRng } from "@terra/shared";
import type { SecondMapEngine } from "../engineTypes.ts";
import { type MockWorld, segmentWalkable } from "./mockWorld.ts";

export interface MockDriver {
  /** 모두 그 자리에 세우고 새 경로를 주지 않는다 */
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  /** 이 유닛은 이제 손으로 움직인다(가짜 경로를 주지 않는다) */
  claim(id: number): void;
  stop(): void;
}

/** 도착했는지 보는 간격(ms) */
const TICK_MS = 400;
/** 도착한 뒤 쉬는 시간 범위(ms) */
const REST_MIN_MS = 300;
const REST_MAX_MS = 2500;
/** 처음 출발을 흩어 놓는 시간(ms) */
const START_SPREAD_MS = 3000;

const unit01 = (rng: Rng): number => rng.nextU32() / 0x1_0000_0000;

/** 지금 점에서 꺾이는 점 1~4개짜리 아무 경로(걸어갈 수 있는 칸만) */
function wander(rng: Rng, world: MockWorld, x: number, y: number): number[] {
  const points = [x, y];
  const legs = 1 + rng.nextInt(4);
  let cx = x;
  let cy = y;
  for (let leg = 0; leg < legs; leg++) {
    let placed = false;
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      const reach = 3 + rng.nextInt(10);
      const nx = cx + (unit01(rng) * 2 - 1) * reach;
      const ny = cy + (unit01(rng) * 2 - 1) * reach;
      if (!segmentWalkable(world.walkable, cx, cy, nx, ny)) continue;
      points.push(nx, ny);
      cx = nx;
      cy = ny;
      placed = true;
    }
    if (!placed) break;
  }
  return points;
}

export function startMockDriver(
  engine: SecondMapEngine,
  world: MockWorld,
  serverNow: () => number,
  seed: number,
): MockDriver {
  const rng = createRng(seed);
  const claimed = new Set<number>();
  const restUntil = new Map<number, number>();
  let paused = false;

  const send = (id: number, x: number, y: number, departAtMs: number): void => {
    const points = wander(rng, world, x, y);
    if (points.length < 4) return;
    engine.setUnitPath(id, { points, departAtMs, speedCellsPerSec: world.speeds.get(id) ?? 0.5 });
  };

  const now = serverNow();
  for (const unit of world.units) send(unit.id, unit.x, unit.y, now + unit01(rng) * START_SPREAD_MS);

  const tick = (): void => {
    if (paused) return;
    const time = serverNow();
    for (const unit of world.units) {
      if (claimed.has(unit.id)) continue;
      const state = engine.unitState(unit.id);
      if (!state || state.moving) continue;
      const until = restUntil.get(unit.id);
      if (until === undefined) {
        restUntil.set(unit.id, time + REST_MIN_MS + unit01(rng) * (REST_MAX_MS - REST_MIN_MS));
        continue;
      }
      if (time < until) continue;
      restUntil.delete(unit.id);
      send(unit.id, state.x, state.y, time);
    }
  };
  const timer = setInterval(tick, TICK_MS);

  return {
    pause() {
      paused = true;
      restUntil.clear();
      for (const unit of world.units) if (!claimed.has(unit.id)) engine.stopUnit(unit.id);
    },
    resume() {
      paused = false;
    },
    get paused() {
      return paused;
    },
    claim(id) {
      claimed.add(id);
      restUntil.delete(id);
    },
    stop() {
      clearInterval(timer);
    },
  };
}
