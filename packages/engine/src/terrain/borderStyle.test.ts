import { describe, expect, it } from "vitest";
import { localStageDistance } from "../camera/secondMapZoom.ts";
import { NO_TERRAIN_BORDER, borderStyleForZoom, zoomProgress } from "./borderStyle.ts";

const RANGE = { minDistance: 20, maxDistance: 2_000 };

describe("2차맵 경계 표시 세기(borderStyleForZoom)", () => {
  it("이웃 2차맵이 없으면 모든 세기가 0이다", () => {
    expect(borderStyleForZoom(RANGE.maxDistance, RANGE, false)).toEqual(NO_TERRAIN_BORDER);
    expect(borderStyleForZoom(RANGE.minDistance, RANGE, false)).toEqual(NO_TERRAIN_BORDER);
  });

  it("1단계(가장 멀리)에서는 중심·이웃 경계와 톤 낮추기가 모두 최대(1)다", () => {
    const far = borderStyleForZoom(RANGE.maxDistance, RANGE, true);
    expect(far).toEqual({ mainLine: 1, subLine: 1, neighbourTone: 1 });
  });

  it("6단계(가장 가까이)에서는 이웃 경계·톤 낮추기가 0으로 풀리고 중심 점선만 은은하게 남는다", () => {
    const close = borderStyleForZoom(RANGE.minDistance, RANGE, true);
    expect(close.subLine).toBe(0);
    expect(close.neighbourTone).toBe(0);
    expect(close.mainLine).toBeGreaterThan(0.15);
    expect(close.mainLine).toBeLessThan(0.3);
  });

  it("확대 단계 1→6으로 다가갈수록 세 값이 단조 감소한다", () => {
    const stages = [1, 2, 3, 4, 5, 6].map((stage) =>
      borderStyleForZoom(localStageDistance(stage, RANGE), RANGE, true),
    );
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1]!;
      const cur = stages[i]!;
      expect(cur.mainLine).toBeLessThanOrEqual(prev.mainLine);
      expect(cur.subLine).toBeLessThanOrEqual(prev.subLine);
      expect(cur.neighbourTone).toBeLessThanOrEqual(prev.neighbourTone);
    }
    // 3단계(중간)에서는 아직 중심 테두리와 톤 낮추기가 분명히 살아 있다
    expect(stages[2]!.mainLine).toBeGreaterThan(0.6);
    expect(stages[2]!.neighbourTone).toBeGreaterThan(0.45);
  });

  it("범위가 한 점이거나 비정상이면 안전하게 최대 확대(1)로 묶는다", () => {
    expect(zoomProgress(100, { minDistance: 100, maxDistance: 100 })).toBe(1);
    expect(zoomProgress(Number.NaN, RANGE)).toBe(1);
  });
});
