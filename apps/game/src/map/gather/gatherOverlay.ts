// 2차맵 원자재 오브젝트·채집 줄 덧그림 — docs/adr/2026-11-07-gather-objects.md 6절. 엔진 덧그림 층(after(보기))에서 프레임마다 화면 좌표로 놓는다
// (다시보기 HUD battleHud.ts와 같은 방식: transform·data-*·글자만 바꾼다, 색·크기는 gather.css 토큰). 자리는 도시 표시(CityOverlay)처럼 정수 px로
// 놓는다 — 소수 px 이동이면 단추 상자가 44px에서 부동소수 오차만큼 모자라게 재진다(화면 시험 smallTapTargets, 합치기 2026-11-08).
// - 근처 판(nearby/, docs/adr/2026-11-08-seamless-second-map.md WP-2): 자원 표시는 근처 판이 자원 탭일 때만, 건물 표시는 건물 탭일 때만 놓는다
//   (사용자 지적 2026-11-08 "자원 오브젝트를 항상 표시하지 않는다"). 판이 닫혀 있으면 둘 다 없다. 놓는 것 = 근처 목록과 같은 것(기준 유닛에서 가까운
//   차례로 목록 줄 수까지) 가운데 화면 안에 든 것. 기준 유닛이 없으면(운영자 자유 시점) 화면 가운데에 가까운 차례.
// - 오브젝트 표시: 단추(누르면 채집 판). 많아야 MARKERS개(묶음 하나에 하나라 2차맵 하나에 많아야 1,024개).
//   떨어진 오브젝트는 다른 모양(data-state="depleted": 속 빈 회색 고리). 멀리서 보면(1m가 MIN_PX_PER_M보다 작게) 숨긴다.
// - 건물 표시: 많아야 BUILDING_MARKERS개 건물 위 작은 단추(누르면 건물 판 — 들어가기·안에 있는 유닛). 땅을 눌러도 같은 판이 열린다.
// - 채집 줄 표시: 내 유닛 머리 위 작은 이름표(단계·화물 kg). 누르지 않는다.
// - 채집소 반경: 채집소 판이 열려 있으면 그 반경 고리(stationRing.ts, 사용자 지적 2026-11-08).
// 누르기(사용자 지적 2026-11-08 "맵조작시 오브젝트가 걸려 드래그가 안되고 계속 오브젝트가 잘못눌린다", docs/adr/2026-11-08-map-input.md 1절):
// 표시는 손가락·마우스를 받지 않고(gather.css pointer-events: none) 지도 캔버스로 지나보낸다 — 표시 위에서 시작한 끌기도 지도를 끈다.
// 엔진이 누르기(움직임이 누르기 거리 안인 짧은 한 손가락)로 판정한 뒤 유닛을 누르지 않았으면 이 층의 tap()이 화면 거리로 가장 가까운 표시를
// 고른다(반경 HIT_RADIUS_PX = 누름 영역 44px의 반). 키보드는 그대로 단추로 닿는다(Tab·Enter).
import type { EngineLayer, EngineLayerView, SecondMapEngine } from "@terra/engine";
import { m } from "../../paraglide/messages.js";
import { type Point, buildingCentre, objectCentre, rankByDistance } from "../nearby/nearbyData.ts";
import type { NearbyState } from "../nearby/nearbyState.ts";
import { kgText, nameText, phaseText } from "./gatherData.ts";
import type { GatherObjectEntry, GatherSheet, GatherState } from "./gatherState.ts";
import { createStationRing } from "./stationRing.ts";

/** 한 화면에 놓는 오브젝트 표시 수 */
const MARKERS = 40;
/** 채집 줄 이름표 수 */
const CHIPS = 8;
/** 한 화면에 놓는 건물 표시 수(누르면 건물 판 — 들어가기·안에 있는 유닛) — 근처 목록 한 쪽(20줄)만큼 */
const BUILDING_MARKERS = 20;
/** 건물 표시 높이(m) */
const BUILDING_LIFT_M = 4;
/** 누르기로 표시를 고르는 반경(CSS px) — 누름 영역(--tap-size 44px)의 반, 엔진 유닛 고르기와 같다 */
const HIT_RADIUS_PX = 22;
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

/** 누르기로 고를 수 있는 표시 하나(마지막 프레임의 화면 자리) */
interface Hit {
  readonly x: number;
  readonly y: number;
  readonly sheet: GatherSheet;
}

/** 누른 곳에서 반경 안 가장 가까운 표시(없으면 null) */
export function pickHit(hits: readonly Hit[], point: { readonly x: number; readonly y: number }): Hit | null {
  let best: Hit | null = null;
  let bestDistance = HIT_RADIUS_PX * HIT_RADIUS_PX;
  for (const hit of hits) {
    const distance = (hit.x - point.x) ** 2 + (hit.y - point.y) ** 2;
    if (distance <= bestDistance) {
      best = hit;
      bestDistance = distance;
    }
  }
  return best;
}

interface Chip {
  readonly root: HTMLElement;
  text: string;
  transform: string;
}

/** 아이템 ID(+ 맡는 시설) → 표시 무리(색): 원목·돌·광석·약초·밭·목초지·물터 */
export function kindClass(
  item: string,
  facility?: string | null,
): "wood" | "stone" | "ore" | "herb" | "crop" | "animal" | "fish" {
  // 밭·목초지·물터(시설 일꾼만, docs/adr/2026-11-11-city-catchment.md)는 맡는 시설로 가른다
  if (facility === "farm") return "crop";
  if (facility === "ranch") return "animal";
  if (facility === "fishing_spot") return "fish";
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

/** 근처 목록과 같은 것 가운데 화면 안에 든 것(at = 기준점, 없으면 화면 가운데에 가까운 차례). limit = 목록 줄 수 */
function pickOnScreen<T>(
  items: readonly T[],
  view: EngineLayerView,
  at: Point | null,
  centreOf: (item: T) => Point,
  idOf: (item: T) => number,
  liftM: number,
  limit: number,
): { item: T; x: number; y: number }[] {
  const ordered = at ? rankByDistance(items, at, centreOf, idOf, limit).map((row) => row.item) : items;
  const cx = view.width / 2;
  const cy = view.height / 2;
  const seen: { item: T; x: number; y: number; d: number }[] = [];
  for (const item of ordered) {
    const centre = centreOf(item);
    const point = view.project(centre.x, centre.y, liftM);
    if (!point || point.x < 0 || point.y < 0 || point.x > view.width || point.y > view.height) continue;
    seen.push({ item, x: point.x, y: point.y, d: (point.x - cx) ** 2 + (point.y - cy) ** 2 });
  }
  if (!at) seen.sort((a, b) => a.d - b.d);
  return seen.slice(0, limit);
}

export function attachGatherOverlay(
  engine: Pick<SecondMapEngine, "addLayer" | "requestFrame" | "unitState">,
  host: HTMLElement,
  state: GatherState,
  options: {
    readonly mapKey: number;
    readonly serverNow: () => number;
    /** 근처 판(고른 탭·줄 수·기준 유닛) */
    readonly nearby: Pick<NearbyState, "tab" | "limit" | "anchor" | "subscribe">;
  },
): () => void {
  const { nearby } = options;
  /** 기준 유닛의 지금 자리(배치 칸, 엔진이 모르면 null) */
  const anchorAt = (): Point | null => {
    const unit = nearby.anchor === null ? null : engine.unitState(nearby.anchor);
    return unit ? { x: unit.x, y: unit.y } : null;
  };
  const root = document.createElement("div");
  root.className = "gather-overlay";
  host.after(root);
  const ring = createStationRing(root);
  const markers: Marker[] = [];
  const chips: Chip[] = [];
  // 이번 프레임에 보인 표시 자리(누르기 고르기, tap)
  let hits: Hit[] = [];
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
  const buildingMarkers: Marker[] = [];
  for (let i = 0; i < BUILDING_MARKERS; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gather-building-marker";
    button.hidden = true;
    button.addEventListener("click", () => {
      const id = Number(button.dataset.building);
      if (Number.isInteger(id)) state.open({ kind: "building", id });
    });
    root.append(button);
    buildingMarkers.push({ button, key: "", transform: "" });
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
    if (nearby.tab !== "resources" || view.pixelsPerMetre < MIN_PX_PER_M) {
      hideAll(markers);
      root.dataset.markers = "0";
      return 0;
    }
    const now = options.serverNow();
    const seen = pickOnScreen(
      state.objects,
      view,
      anchorAt(),
      objectCentre,
      (object: GatherObjectEntry) => object.id,
      MARKER_LIFT_M,
      Math.min(nearby.limit, MARKERS),
    );
    let shown = 0;
    for (const [index, marker] of markers.entries()) {
      const entry = seen[index];
      if (!entry) {
        if (!marker.button.hidden) marker.button.hidden = true;
        continue;
      }
      shown += 1;
      const object = entry.item;
      const kind = state.kinds[object.kind];
      const depleted = object.usesLeft <= 0 && object.regrowAtMs > now;
      const key = `${object.id}:${depleted ? "d" : "a"}:${object.usesLeft}`;
      if (marker.key !== key) {
        marker.key = key;
        marker.button.dataset.object = String(object.id);
        marker.button.dataset.state = depleted ? "depleted" : "ready";
        marker.button.dataset.kind = kindClass(kind?.item ?? "", kind?.facility);
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
      const x = Math.round(entry.x);
      const y = Math.round(entry.y);
      hits.push({ x, y, sheet: { kind: "object", id: object.id } });
      const transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      if (marker.transform !== transform) {
        marker.transform = transform;
        marker.button.style.transform = transform;
      }
      if (marker.button.hidden) marker.button.hidden = false;
    }
    root.dataset.markers = String(shown);
    return shown;
  };

  const placeBuildings = (view: EngineLayerView): void => {
    if (nearby.tab !== "buildings" || view.pixelsPerMetre < MIN_PX_PER_M) {
      hideAll(buildingMarkers);
      return;
    }
    const seen = pickOnScreen(
      state.buildings,
      view,
      anchorAt(),
      buildingCentre,
      (building) => building.id,
      BUILDING_LIFT_M,
      Math.min(nearby.limit, BUILDING_MARKERS),
    ).map((entry) => ({ id: entry.item.id, x: entry.x, y: entry.y }));
    for (const [index, marker] of buildingMarkers.entries()) {
      const entry = seen[index];
      if (!entry) {
        if (!marker.button.hidden) marker.button.hidden = true;
        continue;
      }
      const key = String(entry.id);
      if (marker.key !== key) {
        marker.key = key;
        marker.button.dataset.building = key;
        marker.button.textContent = m.gather_building_marker_text();
        marker.button.setAttribute("aria-label", m.gather_building_marker({ id: entry.id }));
      }
      const x = Math.round(entry.x);
      const y = Math.round(entry.y);
      hits.push({ x, y, sheet: { kind: "building", id: entry.id } });
      const transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      if (marker.transform !== transform) {
        marker.transform = transform;
        marker.button.style.transform = transform;
      }
      if (marker.button.hidden) marker.button.hidden = false;
    }
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
      const transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, -100%)`;
      if (chip.transform !== transform) {
        chip.transform = transform;
        chip.root.style.transform = transform;
      }
      if (chip.root.hidden) chip.root.hidden = false;
    }
  };

  const layer: EngineLayer = {
    after(view) {
      hits = [];
      ring.place(view, state.ring);
      placeMarkers(view);
      placeBuildings(view);
      placeChips(view);
    },
    // 엔진이 누르기로 판정하고 유닛을 누르지 않았을 때: 화면 거리로 가장 가까운 표시의 판을 연다
    tap(point) {
      const hit = pickHit(hits, point);
      if (!hit) return false;
      state.open(hit.sheet);
      return true;
    },
  };
  const detach = engine.addLayer(layer);
  // 자료·판이 바뀌면 한 번 더 그린다(카메라가 멈춰 있어도 표시가 바뀌게)
  const redraw = (): void => {
    for (const marker of markers) marker.key = "";
    for (const marker of buildingMarkers) marker.key = "";
    engine.requestFrame();
  };
  const unsubscribe = state.subscribe(redraw);
  // 근처 판 탭·줄 수·기준 유닛이 바뀌면 표시를 다시 고른다
  const unsubscribeNearby = nearby.subscribe(redraw);
  return () => {
    unsubscribe();
    unsubscribeNearby();
    detach();
    root.remove();
  };
}
