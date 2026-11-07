// 2차맵 원자재 오브젝트·채집 줄 덧그림 — docs/adr/2026-11-07-gather-objects.md 6절. 엔진 덧그림 층(after(보기))에서 프레임마다 화면 좌표로 놓는다
// (다시보기 HUD battleHud.ts와 같은 방식: transform·data-*·글자만 바꾼다, 색·크기는 gather.css 토큰).
// - 오브젝트 표시: 누를 수 있는 단추(누르면 채집 판). 화면 안 가장 가운데에 가까운 MARKERS개만 놓는다(묶음 하나에 하나라 2차맵 하나에 많아야 1,024개).
//   떨어진 오브젝트는 다른 모양(data-state="depleted": 속 빈 회색 고리). 멀리서 보면(1m가 MIN_PX_PER_M보다 작게) 숨긴다.
// - 채집 줄 표시: 내 유닛 머리 위 작은 이름표(단계·화물 kg). 누르지 않는다.
import type { EngineLayer, EngineLayerView, SecondMapEngine } from "@terra/engine";
import { m } from "../../paraglide/messages.js";
import { kgText, nameText, phaseText } from "./gatherData.ts";
import type { GatherObjectEntry, GatherState } from "./gatherState.ts";

/** 한 화면에 놓는 오브젝트 표시 수 */
const MARKERS = 40;
/** 채집 줄 이름표 수 */
const CHIPS = 8;
/** 표시를 띄우는 높이(m) */
const MARKER_LIFT_M = 1.2;
const CHIP_LIFT_M = 3.4;
/** 이보다 멀리서 보면(목표점 1m가 이 CSS 픽셀보다 작게) 오브젝트 표시를 숨긴다 */
const MIN_PX_PER_M = 1;

interface Marker {
  readonly button: HTMLButtonElement;
  key: string;
  transform: string;
}

interface Chip {
  readonly root: HTMLElement;
  text: string;
  transform: string;
}

/** 아이템 ID → 표시 무리(색): 원목·돌·광석·약초 */
export function kindClass(item: string): "wood" | "stone" | "ore" | "herb" {
  if (item.endsWith("_log")) return "wood";
  if (item === "stone" || item === "rubble") return "stone";
  if (item.endsWith("_ore") || item === "mithril" || item === "orichalcum") return "ore";
  return "herb";
}

function hideAll(list: readonly { readonly root?: HTMLElement; readonly button?: HTMLElement }[]): void {
  for (const entry of list) {
    const element = entry.button ?? entry.root;
    if (element && !element.hidden) element.hidden = true;
  }
}

export function attachGatherOverlay(
  engine: Pick<SecondMapEngine, "addLayer" | "requestFrame" | "unitState">,
  host: HTMLElement,
  state: GatherState,
  options: { readonly mapKey: number; readonly serverNow: () => number },
): () => void {
  const root = document.createElement("div");
  root.className = "gather-overlay";
  host.after(root);
  const markers: Marker[] = [];
  const chips: Chip[] = [];
  for (let i = 0; i < MARKERS; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gather-marker";
    button.hidden = true;
    const dot = document.createElement("span");
    dot.className = "gather-marker-dot";
    dot.setAttribute("aria-hidden", "true");
    button.append(dot);
    button.addEventListener("click", () => {
      const id = Number(button.dataset.object);
      if (Number.isInteger(id)) state.open({ kind: "object", id });
    });
    root.append(button);
    markers.push({ button, key: "", transform: "" });
  }
  for (let i = 0; i < CHIPS; i++) {
    const chip = document.createElement("span");
    chip.className = "gather-chip";
    chip.hidden = true;
    chip.setAttribute("aria-hidden", "true");
    root.append(chip);
    chips.push({ root: chip, text: "", transform: "" });
  }

  const placeMarkers = (view: EngineLayerView): number => {
    if (view.pixelsPerMetre < MIN_PX_PER_M) {
      hideAll(markers);
      return 0;
    }
    const now = options.serverNow();
    const cx = view.width / 2;
    const cy = view.height / 2;
    const seen: { object: GatherObjectEntry; x: number; y: number; d: number }[] = [];
    for (const object of state.objects) {
      const point = view.project(object.x + 0.5, object.y + 0.5, MARKER_LIFT_M);
      if (!point || point.x < 0 || point.y < 0 || point.x > view.width || point.y > view.height) continue;
      seen.push({ object, x: point.x, y: point.y, d: (point.x - cx) ** 2 + (point.y - cy) ** 2 });
    }
    seen.sort((a, b) => a.d - b.d);
    let shown = 0;
    for (const [index, marker] of markers.entries()) {
      const entry = seen[index];
      if (!entry) {
        if (!marker.button.hidden) marker.button.hidden = true;
        continue;
      }
      shown += 1;
      const { object } = entry;
      const kind = state.kinds[object.kind];
      const depleted = object.usesLeft <= 0 && object.regrowAtMs > now;
      const key = `${object.id}:${depleted ? "d" : "a"}:${object.usesLeft}`;
      if (marker.key !== key) {
        marker.key = key;
        marker.button.dataset.object = String(object.id);
        marker.button.dataset.state = depleted ? "depleted" : "ready";
        marker.button.dataset.kind = kindClass(kind?.item ?? "");
        const name = nameText(kind?.name ?? null, m.gather_object_unknown());
        marker.button.setAttribute(
          "aria-label",
          depleted ? m.gather_marker_depleted({ name }) : m.gather_marker_ready({ name }),
        );
        marker.button.setAttribute(
          "aria-pressed",
          String(state.sheet?.kind === "object" && state.sheet.id === object.id),
        );
      }
      const transform = `translate(${entry.x.toFixed(1)}px, ${entry.y.toFixed(1)}px) translate(-50%, -50%)`;
      if (marker.transform !== transform) {
        marker.transform = transform;
        marker.button.style.transform = transform;
      }
      if (marker.button.hidden) marker.button.hidden = false;
    }
    root.dataset.markers = String(shown);
    return shown;
  };

  const placeChips = (view: EngineLayerView): void => {
    const active = state.loops.filter((loop) => loop.mapKey === options.mapKey && loop.phase !== "done");
    for (const [index, chip] of chips.entries()) {
      const loop = active[index];
      const unit = loop ? engine.unitState(loop.unitId) : null;
      const point = unit ? view.project(unit.x, unit.y, CHIP_LIFT_M) : null;
      if (!loop || !point) {
        if (!chip.root.hidden) chip.root.hidden = true;
        continue;
      }
      const text =
        loop.kindId === null
          ? phaseText(loop.phase)
          : m.gather_chip({
              phase: phaseText(loop.phase),
              kg: kgText(loop.carriedGrams),
              max: kgText(loop.capacityGrams),
            });
      if (chip.text !== text) {
        chip.text = text;
        chip.root.textContent = text;
        chip.root.dataset.phase = loop.phase;
      }
      const transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px) translate(-50%, -100%)`;
      if (chip.transform !== transform) {
        chip.transform = transform;
        chip.root.style.transform = transform;
      }
      if (chip.root.hidden) chip.root.hidden = false;
    }
  };

  const layer: EngineLayer = {
    after(view) {
      placeMarkers(view);
      placeChips(view);
    },
  };
  const detach = engine.addLayer(layer);
  // 자료·판이 바뀌면 한 번 더 그린다(카메라가 멈춰 있어도 표시가 바뀌게)
  const unsubscribe = state.subscribe(() => {
    for (const marker of markers) marker.key = "";
    engine.requestFrame();
  });
  return () => {
    unsubscribe();
    detach();
    root.remove();
  };
}
