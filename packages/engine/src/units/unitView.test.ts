// 유닛 그림 시험 — 선택 링 그리는 차례(땅에 가려지지 않게, docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-11, 962)")
import { Mesh, RingGeometry } from "three";
import { describe, expect, it } from "vitest";
import { NationRings } from "./nationRings.ts";
import { RouteView } from "./routeView.ts";
import { SELECTION_RING_RENDER_ORDER, UnitView } from "./unitView.ts";

/** 무리 안에서 고리 도형(RingGeometry)을 쓰는 메시의 그리는 차례 */
function ringOrders(children: readonly unknown[]): number[] {
  return children.flatMap((child) =>
    child instanceof Mesh && child.geometry instanceof RingGeometry ? [child.renderOrder] : [],
  );
}

describe("선택 링 그리는 차례", () => {
  it("깊이를 쓰지 않는 링은 땅(0)보다 뒤, 나라 색 고리보다 뒤, 경로 고리보다 앞에 그린다", () => {
    const units = new UnitView(4);
    const rings = new NationRings(4);
    const route = new RouteView();
    expect(ringOrders(units.group.children)).toEqual([SELECTION_RING_RENDER_ORDER]);
    const nation = rings.group.children.map((child) => (child instanceof Mesh ? child.renderOrder : 0));
    const routeRings = ringOrders(route.group.children);
    expect(SELECTION_RING_RENDER_ORDER).toBeGreaterThan(0);
    expect(SELECTION_RING_RENDER_ORDER).toBeGreaterThan(Math.max(...nation));
    expect(routeRings.length).toBeGreaterThan(0);
    expect(SELECTION_RING_RENDER_ORDER).toBeLessThan(Math.min(...routeRings));
    units.dispose();
    rings.dispose();
    route.dispose();
  });
});
