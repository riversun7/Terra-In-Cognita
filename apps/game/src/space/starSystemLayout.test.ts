// 항성계 평면 배치 시험 — 제곱근 눈금, 범위(가장 먼 궤도·생명 가능 지대), 띠 반지름, 천체 각도
import { habitableZone } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { STAR_RADIUS, type SystemLayout, VIEW_EDGE, bodyPosition, systemLayout } from "./starSystemLayout.ts";

/** 안쪽 넷(수성~화성)이 차지하는 폭 */
const spread = (layout: SystemLayout): number => layout.radiusOf(1.524) - layout.radiusOf(0.387);

describe("항성계 배치", () => {
  it("0 AU는 항성 가장자리, 범위 끝은 VIEW_EDGE, 사이는 제곱근 눈금", () => {
    const layout = systemLayout(1, [0.4, 1, 5.2, 30]);
    expect(layout.radiusOf(0)).toBe(STAR_RADIUS);
    expect(layout.radiusOf(layout.maxAu)).toBeCloseTo(VIEW_EDGE, 12);
    expect(layout.radiusOf(layout.maxAu * 4)).toBeCloseTo(VIEW_EDGE, 12);
    const quarter = layout.radiusOf(layout.maxAu / 4);
    expect(quarter).toBeCloseTo(STAR_RADIUS + (VIEW_EDGE - STAR_RADIUS) / 2, 12);
    // 멀수록 바깥(줄지 않는다)
    const radii = [0.4, 1, 5.2, 30].map((distance) => layout.radiusOf(distance));
    expect(radii.toSorted((a, b) => a - b)).toEqual(radii);
    expect(radii.every((radius) => radius < VIEW_EDGE)).toBe(true);
  });

  it("범위는 가장 먼 궤도와 생명 가능 지대 바깥 끝 중 큰 것보다 조금 넓다", () => {
    expect(systemLayout(1, [30]).maxAu).toBeGreaterThan(30);
    const inner = systemLayout(1, [0.1]);
    expect(inner.maxAu).toBeGreaterThan(habitableZone(1).outer);
    expect(inner.habitable.outer).toBeLessThan(VIEW_EDGE);
  });

  it("궤도가 없어도 생명 가능 지대 띠가 보인다", () => {
    const layout = systemLayout(0.069, []);
    expect(layout.habitable.inner).toBeGreaterThan(STAR_RADIUS);
    expect(layout.habitable.outer).toBeLessThan(VIEW_EDGE);
    expect(layout.habitable.outer).toBeGreaterThan(layout.habitable.inner);
  });

  it("띠는 같은 눈금으로 옮긴 habitableZone(√L)", () => {
    const layout = systemLayout(38, [1, 50]);
    const zone = habitableZone(38);
    expect(layout.habitable.inner).toBe(layout.radiusOf(zone.inner));
    expect(layout.habitable.outer).toBe(layout.radiusOf(zone.outer));
  });

  it("천체 자리는 반지름 위에 있고, 이웃 차례는 각도가 다르다", () => {
    const seen: string[] = [];
    for (let index = 0; index < 24; index += 1) {
      const { x, y } = bodyPosition(index, 0.5);
      expect(Math.hypot(x, y)).toBeCloseTo(0.5, 12);
      seen.push(`${x.toFixed(3)},${y.toFixed(3)}`);
    }
    expect(new Set(seen).size).toBe(24);
    // 0번은 오른쪽 위(SVG는 y가 아래로 커진다)
    const first = bodyPosition(0, 1);
    expect(first.x).toBeGreaterThan(0);
    expect(first.y).toBeLessThan(0);
  });

  it("로그 눈금: 순서를 지키고 안쪽 궤도를 제곱근보다 넓게 벌린다", () => {
    const solar = [0.387, 0.723, 1, 1.524, 2.77, 5.2, 9.54, 19.2, 30.1];
    const log = systemLayout(1, solar, "log");
    const sqrt = systemLayout(1, solar);
    const radii = solar.map((distance) => log.radiusOf(distance));
    expect(radii.toSorted((a, b) => a - b)).toEqual(radii);
    expect(radii[0] ?? 0).toBeGreaterThan(STAR_RADIUS);
    expect(radii.at(-1) ?? 1).toBeLessThan(VIEW_EDGE);
    expect(log.radiusOf(0)).toBe(STAR_RADIUS);
    expect(spread(log)).toBeGreaterThan(spread(sqrt) * 1.8);
  });
});
