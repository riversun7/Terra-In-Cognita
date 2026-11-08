// 채집소 반경 고리 — 사용자 지적(2026-11-08) "원자재채집소의 기능도 필요"(반경을 지도에 그린다). 채집 덧그림(gatherOverlay.ts)의 프레임마다
// 반경 둘레 점들을 화면 좌표로 놓아 SVG 다각형 하나로 그린다(누르지 않는다). 색·두께는 gather.css 토큰. 카메라 뒤로 넘어간 점은 건너뛴다.
import type { EngineLayerView } from "@terra/engine";
import type { StationRing } from "./gatherState.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
/** 둘레 점 수 */
const RING_POINTS = 64;
/** 고리를 띄우는 높이(m) */
const RING_LIFT_M = 0.3;

export interface StationRingLayer {
  place(view: EngineLayerView, ring: StationRing | null): void;
}

export function createStationRing(root: HTMLElement): StationRingLayer {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "gather-ring");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(SVG_NS, "polygon");
  shape.setAttribute("class", "gather-ring-line");
  svg.append(shape);
  svg.style.display = "none";
  root.prepend(svg);
  let drawn = "";
  return {
    place(view, ring) {
      if (!ring) {
        if (drawn !== "") {
          drawn = "";
          svg.style.display = "none";
        }
        return;
      }
      const points: string[] = [];
      const cx = ring.x + 0.5;
      const cy = ring.y + 0.5;
      for (let i = 0; i < RING_POINTS; i++) {
        const angle = (i / RING_POINTS) * Math.PI * 2;
        const point = view.project(
          cx + Math.cos(angle) * ring.radius,
          cy + Math.sin(angle) * ring.radius,
          RING_LIFT_M,
        );
        if (point) points.push(`${Math.round(point.x)},${Math.round(point.y)}`);
      }
      const next = points.length >= 3 ? points.join(" ") : "";
      if (next === drawn) return;
      drawn = next;
      if (next === "") {
        svg.style.display = "none";
        return;
      }
      svg.setAttribute("viewBox", `0 0 ${Math.round(view.width)} ${Math.round(view.height)}`);
      shape.setAttribute("points", next);
      svg.style.display = "";
    },
  };
}
