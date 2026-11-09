import { describe, expect, it } from "vitest";
import {
  BLOCK_MS,
  DOWN_BLOCKS,
  UP_BLOCKS,
  VIEW_DISTANCE_LEVELS,
  VIEW_DISTANCE_START_LEVEL,
  ViewDistanceController,
} from "./viewDistance.ts";

/** ms 동안 같은 프레임 간격·엔진 시간으로 그린다. 단계가 바뀐 횟수를 돌려준다 */
function run(controller: ViewDistanceController, ms: number, frameMs: number, engineMs: number): number {
  let changes = 0;
  for (let t = 0; t < ms; t += frameMs) if (controller.record(frameMs, engineMs)) changes++;
  return changes;
}

describe("가시거리 자동 조절", () => {
  it("가운데 단계에서 시작하고 단계 표는 거리·상한이 함께 커진다", () => {
    const controller = new ViewDistanceController();
    expect(controller.index).toBe(VIEW_DISTANCE_START_LEVEL);
    for (let i = 1; i < VIEW_DISTANCE_LEVELS.length; i++) {
      const [a, b] = [VIEW_DISTANCE_LEVELS[i - 1], VIEW_DISTANCE_LEVELS[i]];
      expect(b?.reachM).toBeGreaterThan(a?.reachM ?? 0);
      expect(b?.maxProps).toBeGreaterThan(a?.maxProps ?? 0);
    }
  });

  it("120fps·엔진 1ms가 이어지면 한 단계씩 올라 상한에서 멈춘다", () => {
    const controller = new ViewDistanceController();
    // 처음 묶음(버림) + 여유 묶음 UP_BLOCKS개가 지나야 한 단계
    expect(run(controller, BLOCK_MS * (1 + UP_BLOCKS) - 100, 8.3, 1)).toBe(0);
    expect(run(controller, 300, 8.3, 1)).toBe(1);
    expect(controller.index).toBe(VIEW_DISTANCE_START_LEVEL + 1);
    run(controller, 60_000, 8.3, 1);
    expect(controller.index).toBe(VIEW_DISTANCE_LEVELS.length - 1);
    expect(controller.level).toEqual(VIEW_DISTANCE_LEVELS.at(-1));
  });

  it("느려지면(30fps) 올리기보다 빨리 한 단계씩 내려 맨 아래에서 멈춘다", () => {
    const controller = new ViewDistanceController();
    expect(run(controller, BLOCK_MS * (1 + DOWN_BLOCKS) - 100, 33.3, 3)).toBe(0);
    expect(run(controller, 300, 33.3, 3)).toBe(1);
    expect(controller.index).toBe(VIEW_DISTANCE_START_LEVEL - 1);
    run(controller, 30_000, 33.3, 3);
    expect(controller.index).toBe(0);
  });

  it("엔진 시간이 크면 프레임 간격이 좋아도 내린다", () => {
    const controller = new ViewDistanceController();
    run(controller, BLOCK_MS * (1 + DOWN_BLOCKS) + 200, 16.7, 14);
    expect(controller.index).toBe(VIEW_DISTANCE_START_LEVEL - 1);
  });

  it("문턱 사이(약 42fps)에서는 오르내리지 않는다(히스테리시스)", () => {
    const controller = new ViewDistanceController();
    expect(run(controller, 60_000, 24, 4)).toBe(0);
    expect(controller.index).toBe(VIEW_DISTANCE_START_LEVEL);
  });

  it("좋음·느림이 짧게 번갈아 오면 바뀌지 않는다(깜박임 없음)", () => {
    const controller = new ViewDistanceController();
    // 여유 2초 + 느림 0.4초(한 번 튄 순간)를 되풀이: 느린 묶음이 셋 이어지지 않고, 여유 묶음도 여섯 이어지지 않는다
    for (let i = 0; i < 20; i++) {
      run(controller, 2_000, 8.3, 1);
      run(controller, 400, 40, 2);
    }
    expect(controller.index).toBe(VIEW_DISTANCE_START_LEVEL);
  });

  it("가끔 튀는 프레임 하나(p95 밖)는 올리기를 막지 않는다", () => {
    const controller = new ViewDistanceController();
    let changes = 0;
    for (let frame = 0; frame < 1_200; frame++) {
      if (controller.record(frame % 60 === 0 ? 90 : 8.3, 1)) changes++;
    }
    expect(changes).toBeGreaterThanOrEqual(1);
  });

  it("멈췄다 다시 그린 첫 프레임(간격 0)과 꺼진 상태는 재지 않는다", () => {
    const controller = new ViewDistanceController();
    for (let i = 0; i < 10_000; i++) expect(controller.record(0, 50)).toBe(false);
    controller.enabled = false;
    expect(run(controller, 60_000, 50, 30)).toBe(0);
    expect(controller.index).toBe(VIEW_DISTANCE_START_LEVEL);
  });
});
