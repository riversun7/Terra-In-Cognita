import { describe, expect, it } from "vitest";
import { TARGET_WAIT_MS, createTargetLife, drapeRoute } from "./routePath.ts";

describe("drapeRoute", () => {
  it("구간을 step 이하로 자르고 누적 길이를 단다", () => {
    const route = drapeRoute([0, 0, 2, 0], 0.5);
    expect(route).not.toBeNull();
    expect(Array.from(route?.distances ?? [])).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(Array.from(route?.centres ?? []).slice(-2)).toEqual([2, 0]);
  });

  it("꺾이는 점을 그대로 넣고, 그 점의 옆 방향은 앞뒤 구간의 평균", () => {
    const route = drapeRoute([0, 0, 1, 0, 1, 1], 1);
    expect(Array.from(route?.centres ?? [])).toEqual([0, 0, 1, 0, 1, 1]);
    expect(Array.from(route?.distances ?? [])).toEqual([0, 1, 2]);
    // 첫 점: 동쪽으로 가니 옆 방향은 (0, −1). 꺾이는 점: 동·남 평균 → 대각선
    expect(route?.normals[0]).toBeCloseTo(0);
    expect(route?.normals[1]).toBeCloseTo(-1);
    expect(route?.normals[2]).toBeCloseTo(Math.SQRT1_2);
    expect(route?.normals[3]).toBeCloseTo(-Math.SQRT1_2);
  });

  it("길이 0인 구간은 건너뛰고, 점이 모자라면 null", () => {
    expect(drapeRoute([3, 3], 1)).toBeNull();
    expect(drapeRoute([3, 3, 3, 3], 1)).toBeNull();
    expect(drapeRoute([0, 0, 0, 0, 1, 0], 1)?.distances.length).toBe(2);
  });
});

describe("createTargetLife", () => {
  it("명령 뒤 새 경로로 움직이다 멈추면 거둔다", () => {
    const life = createTargetLife();
    life.set({ x: 5, y: 6 }, 1, 0);
    expect(life.update(1, false, 100)).toEqual({ x: 5, y: 6 });
    expect(life.update(2, true, 200)).toEqual({ x: 5, y: 6 });
    expect(life.update(2, false, 9_000)).toBeNull();
  });

  it("다시 길을 찾느라 옛 경로가 멈춘 것은 도착으로 치지 않는다", () => {
    const life = createTargetLife();
    // 옛 경로(판 1)로 움직이는 중에 다시 보냈다
    life.set({ x: 5, y: 6 }, 1, 0);
    expect(life.update(1, true, 50)).not.toBeNull();
    // 서버가 그 자리에 세운 경로(판 2, 서 있음)
    expect(life.update(2, false, 100)).not.toBeNull();
    // 새 경로(판 3)로 움직인다
    expect(life.update(3, true, 300)).not.toBeNull();
    expect(life.update(3, false, 2_000)).toBeNull();
  });

  it("새 경로가 기다리는 시간 안에 오지 않으면 거둔다(거절·길 없음)", () => {
    const life = createTargetLife();
    life.set({ x: 1, y: 1 }, 4, 1_000);
    expect(life.update(4, false, 1_000 + TARGET_WAIT_MS - 1)).not.toBeNull();
    expect(life.update(4, false, 1_000 + TARGET_WAIT_MS)).toBeNull();
  });

  it("shift: 남은 목적지를 다른 틀로 옮기고 거두는 규칙은 그대로", () => {
    const life = createTargetLife();
    life.set({ x: 260, y: 10 }, 4, 1_000);
    life.shift((cell) => ({ x: cell.x - 256, y: cell.y }));
    expect(life.update(4, false, 1_001)).toEqual({ x: 4, y: 10 });
    expect(life.update(5, true, 1_002)).toEqual({ x: 4, y: 10 });
    expect(life.update(5, false, 1_003)).toBeNull();
    // 목적지가 없으면 아무 일도 없다
    life.shift(() => ({ x: 1, y: 1 }));
    expect(life.update(5, false, 1_004)).toBeNull();
  });

  it("null로 거둔다", () => {
    const life = createTargetLife();
    life.set({ x: 1, y: 1 }, 0, 0);
    life.set(null, 0, 10);
    expect(life.update(0, false, 20)).toBeNull();
  });
});
