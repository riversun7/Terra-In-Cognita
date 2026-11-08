// 시험 봇 목적지 고르기 시험 — 집이 있는 봇(NPC 휴먼, docs/adr/2026-11-07-play-flow.md "WP-NPC")의 목적지 네모(homeArea), 일터가 있는
// NPC 휴먼의 일 주기·목적지·쉬는 시간("WP-NPC2", 기획 답 740 나)
import { createRng } from "@terra/shared";
import { anchorCenter, createPlacementGrid } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  HOME_RADIUS_CELLS,
  TRIP_RADIUS_CELLS,
  WORK_CYCLE_MS,
  WORK_SHIFT_MS,
  arrivalIdleMs,
  atWork,
  homeArea,
  idleMs,
  pickDestination,
  tripArea,
} from "./bots.ts";

const at = (x: number, y: number) => anchorCenter(x, y, 1);

describe("homeArea", () => {
  it("집 반경 안이면 집 둘레 네모", () => {
    expect(homeArea(at(130, 120), 1, { x: 128, y: 128 })).toEqual({
      x: 128,
      y: 128,
      radius: HOME_RADIUS_CELLS,
    });
  });

  it("멀면 집 쪽으로 TRIP_RADIUS_CELLS만큼 다가간 칸 둘레(작은 반경)", () => {
    const area = homeArea(at(10, 128), 1, { x: 200, y: 128 });
    expect(area.x).toBe(10 + TRIP_RADIUS_CELLS);
    expect(area.y).toBe(128);
    expect(area.radius).toBeLessThan(HOME_RADIUS_CELLS);
    // 대각선: 체비셰프 거리로 나눈다(두 축 모두 다가간다)
    const diagonal = homeArea(at(0, 0), 1, { x: 200, y: 100 });
    expect(diagonal.x).toBe(TRIP_RADIUS_CELLS);
    expect(diagonal.y).toBe(TRIP_RADIUS_CELLS / 2);
  });
});

describe("pickDestination", () => {
  it("네모를 주면 그 안에서, 안 주면 지금 자리 둘레 TRIP_RADIUS_CELLS 안에서 고른다(난수 차례는 예전과 같다)", () => {
    const grid = createPlacementGrid();
    for (let seed = 1; seed <= 40; seed++) {
      const inside = pickDestination(grid, createRng(seed), 1, at(20, 20), { x: 128, y: 128, radius: 10 });
      expect(inside).toBeDefined();
      const x = Math.floor((inside?.x ?? 0) / 1024);
      const y = Math.floor((inside?.y ?? 0) / 1024);
      expect(Math.abs(x - 128)).toBeLessThanOrEqual(10);
      expect(Math.abs(y - 128)).toBeLessThanOrEqual(10);
      // 네모 없이 = 지금 자리 둘레(옛 규칙과 같은 값)
      const plain = pickDestination(grid, createRng(seed), 1, at(128, 128));
      const sameAsArea = pickDestination(grid, createRng(seed), 1, at(128, 128), {
        x: 128,
        y: 128,
        radius: TRIP_RADIUS_CELLS,
      });
      expect(plain).toEqual(sameAsArea);
    }
  });
});

describe("일터가 있는 NPC 휴먼(WP-NPC2)", () => {
  const NOW = 1_800_000_000_000;
  const work = { x: 60, y: 60, radius: 5 };
  const home = { x: 128, y: 128, work };

  it("일 주기: 한 주기 가운데 일하는 몫만 일터, 유닛마다 시작이 흩어진다", () => {
    for (const unitId of [1, 2, 77, 9001]) {
      let working = 0;
      for (let t = 0; t < WORK_CYCLE_MS; t += 60_000) if (atWork(unitId, NOW + t)) working += 1;
      expect(working).toBe(WORK_SHIFT_MS / 60_000);
    }
    const starts = new Set(
      Array.from({ length: 20 }, (_, index) => {
        for (let t = 0; t < WORK_CYCLE_MS; t += 60_000)
          if (atWork(index + 1, NOW + t) && !atWork(index + 1, NOW + t - 60_000)) return t;
        return -1;
      }),
    );
    expect(starts.size).toBeGreaterThan(5);
  });

  /** 그 유닛이 일하는 몫 / 쉬는 몫인 시각 하나 */
  const timeWhen = (unitId: number, working: boolean): number => {
    for (let t = 0; t < WORK_CYCLE_MS; t += 60_000) if (atWork(unitId, NOW + t) === working) return NOW + t;
    throw new Error("no time");
  };

  it("일하는 몫이면 일터 쪽(멀면 다가간 칸), 쉬는 몫이면 집 둘레. 일터가 없으면 늘 집 둘레", () => {
    const t = timeWhen(5, true);
    expect(tripArea(at(62, 58), 1, home, 5, t)).toEqual(work);
    // 일터에서 43칸 안이면 한 번에 일터 네모로(일터 반경 5 + 고르는 칸 ≤ 한 번 길 48칸)
    expect(tripArea(at(100, 60), 1, home, 5, t)).toEqual(work);
    const far = tripArea(at(200, 60), 1, home, 5, t);
    expect(far.x).toBe(200 - TRIP_RADIUS_CELLS);
    expect(far.radius).toBeLessThan(HOME_RADIUS_CELLS);
    const off = timeWhen(5, false);
    expect(tripArea(at(130, 130), 1, home, 5, off)).toEqual({ x: 128, y: 128, radius: HOME_RADIUS_CELLS });
    expect(tripArea(at(130, 130), 1, { x: 128, y: 128 }, 5, t)).toEqual({
      x: 128,
      y: 128,
      radius: HOME_RADIUS_CELLS,
    });
  });

  it("쉬는 시간: 시험 봇·다가가는 중은 예전 값, 일터 안은 길게, 집 둘레 안은 조금 길게(난수는 한 번)", () => {
    const t = timeWhen(5, true);
    const off = timeWhen(5, false);
    for (let seed = 1; seed <= 20; seed++) {
      const plain = idleMs(createRng(seed));
      expect(arrivalIdleMs(createRng(seed), { id: 5, size: 1, home: undefined }, at(10, 10), t)).toBe(plain);
      // 일하는 몫인데 일터 밖(다가가는 중)
      expect(arrivalIdleMs(createRng(seed), { id: 5, size: 1, home }, at(200, 200), t)).toBe(plain);
      const working = arrivalIdleMs(createRng(seed), { id: 5, size: 1, home }, at(62, 60), t);
      expect(working).toBeGreaterThanOrEqual(45_000);
      expect(working).toBeLessThanOrEqual(135_000);
      const resting = arrivalIdleMs(createRng(seed), { id: 5, size: 1, home }, at(130, 130), off);
      expect(resting).toBeGreaterThanOrEqual(8_000);
      expect(resting).toBeLessThanOrEqual(24_000);
    }
  });
});
