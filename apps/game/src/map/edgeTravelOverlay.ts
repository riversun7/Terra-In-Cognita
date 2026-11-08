// 2차맵 [옆 2차맵으로](WP14) 덧그림 — 엔진 덧그림 층(after(보기))에서 프레임마다 화면 좌표로 놓는다(채집 덧그림 gather/gatherOverlay.ts와 같은 방식:
// transform·data-*·글자만 바꾼다, 색·크기는 edgeTravel.css 토큰, 자리는 정수 px).
// - 변 화살표: 보낼 유닛이 변에서 ARROW_NEAR_CELLS 안이면 그 변 위(유닛에서 변에 곧게 내린 점)에 누를 수 있는 단추. 누르면 [옆 2차맵으로] 판이 그 변을
//   먼저 보인다. 화면 밖이면 숨긴다. 화살 글자는 유닛 → 변 점의 화면 방향으로 돌린다.
// - 가는 중 이름표: 보낸 유닛 머리 위 작은 이름표(옆 2차맵까지 남은 시간). 누르지 않는다.
import type { EngineLayer, EngineLayerView, SecondMapEngine } from "@terra/engine";
import { m } from "../paraglide/messages.js";
import type { EdgeTarget } from "./edgeTravelData.ts";

/** 변에서 이만큼(배치 칸) 안이면 그 변 화살표를 보인다 */
export const ARROW_NEAR_CELLS = 40;
const SIDE = 256;
const ARROW_LIFT_M = 1.5;
const CHIP_LIFT_M = 3.4;

export interface EdgeOverlayState {
  /** 변 화살표를 놓을 유닛과 변들(가는 중이면 null) */
  arrows: { readonly unitId: number; readonly targets: readonly EdgeTarget[] } | null;
  /** 가는 중 이름표 */
  chip: { readonly unitId: number; readonly text: string } | null;
  /** 변 이름(화살표 읽기 이름) */
  sideName: (target: EdgeTarget) => string;
}

interface Arrow {
  readonly button: HTMLButtonElement;
  readonly glyph: HTMLSpanElement;
  key: string;
  transform: string;
}

/** 유닛 자리에서 변에 곧게 내린 점(배치 칸) */
function borderPoint(target: EdgeTarget, x: number, y: number): { x: number; y: number } {
  if (target.ox !== 0) return { x: target.ox > 0 ? SIDE : 0, y };
  return { x, y: target.oy > 0 ? SIDE : 0 };
}

/** 유닛에서 그 변까지(배치 칸, 지금 자리) */
function liveDistance(target: EdgeTarget, x: number, y: number): number {
  if (target.ox !== 0) return target.ox > 0 ? SIDE - x : x;
  return target.oy > 0 ? SIDE - y : y;
}

export function attachEdgeOverlay(
  engine: Pick<SecondMapEngine, "addLayer" | "requestFrame" | "unitState">,
  host: HTMLElement,
  state: { readonly current: EdgeOverlayState },
  onArrow: (target: EdgeTarget) => void,
): () => void {
  const root = document.createElement("div");
  root.className = "edge-overlay";
  host.after(root);
  const arrows: Arrow[] = [];
  const targets: (EdgeTarget | null)[] = [];
  for (let i = 0; i < 4; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "edge-arrow";
    button.hidden = true;
    const glyph = document.createElement("span");
    glyph.className = "edge-arrow-glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "➜";
    button.append(glyph);
    const index = i;
    button.addEventListener("click", () => {
      const target = targets[index];
      if (target) onArrow(target);
    });
    root.append(button);
    arrows.push({ button, glyph, key: "", transform: "" });
    targets.push(null);
  }
  const chip = document.createElement("span");
  chip.className = "edge-chip";
  chip.hidden = true;
  chip.setAttribute("aria-hidden", "true");
  root.append(chip);
  let chipText = "";
  let chipTransform = "";

  const placeArrows = (view: EngineLayerView): void => {
    const wanted = state.current.arrows;
    const unit = wanted ? engine.unitState(wanted.unitId) : null;
    const from = unit ? view.project(unit.x, unit.y, ARROW_LIFT_M) : null;
    let shown = 0;
    for (const [index, arrow] of arrows.entries()) {
      const target = wanted?.targets[index] ?? null;
      const point =
        unit && target && liveDistance(target, unit.x, unit.y) <= ARROW_NEAR_CELLS
          ? borderPoint(target, unit.x, unit.y)
          : null;
      const screen = point ? view.project(point.x, point.y, ARROW_LIFT_M) : null;
      if (
        !target ||
        !screen ||
        screen.x < 0 ||
        screen.y < 0 ||
        screen.x > view.width ||
        screen.y > view.height
      ) {
        targets[index] = null;
        if (!arrow.button.hidden) arrow.button.hidden = true;
        continue;
      }
      shown += 1;
      targets[index] = target;
      const key = `${target.mapKey}:${target.compass ?? `${target.ox},${target.oy}`}`;
      if (arrow.key !== key) {
        arrow.key = key;
        arrow.button.dataset.map = String(target.mapKey);
        arrow.button.dataset.side = target.compass ?? `${target.ox},${target.oy}`;
        arrow.button.setAttribute("aria-label", m.map_edge_arrow({ side: state.current.sideName(target) }));
      }
      // 화살은 유닛 → 변 점의 화면 방향(유닛이 화면 밖이면 오른쪽)
      const angle = from ? Math.atan2(screen.y - from.y, screen.x - from.x) : 0;
      arrow.glyph.style.transform = `rotate(${angle.toFixed(3)}rad)`;
      const transform = `translate(${Math.round(screen.x)}px, ${Math.round(screen.y)}px) translate(-50%, -50%)`;
      if (arrow.transform !== transform) {
        arrow.transform = transform;
        arrow.button.style.transform = transform;
      }
      if (arrow.button.hidden) arrow.button.hidden = false;
    }
    root.dataset.arrows = String(shown);
  };

  const placeChip = (view: EngineLayerView): void => {
    const wanted = state.current.chip;
    const unit = wanted ? engine.unitState(wanted.unitId) : null;
    const point = unit ? view.project(unit.x, unit.y, CHIP_LIFT_M) : null;
    if (!wanted || !point) {
      if (!chip.hidden) chip.hidden = true;
      return;
    }
    if (chipText !== wanted.text) {
      chipText = wanted.text;
      chip.textContent = wanted.text;
    }
    const transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, -100%)`;
    if (chipTransform !== transform) {
      chipTransform = transform;
      chip.style.transform = transform;
    }
    if (chip.hidden) chip.hidden = false;
  };

  const layer: EngineLayer = {
    after(view) {
      placeArrows(view);
      placeChip(view);
    },
  };
  const detach = engine.addLayer(layer);
  return () => {
    detach();
    root.remove();
  };
}
