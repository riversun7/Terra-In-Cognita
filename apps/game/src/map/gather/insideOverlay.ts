// 건물 안 유닛 숨김·"안에 N명" 표시 — 사용자 지적 2026-11-15 "유닛이 건물에 들어갔다는데 … 유닛은 밖에 있다", 답 "숨기고 건물에 표시".
// - 서버 조회 gather.inside(그 2차맵에서 들어가기로 머무는 유닛)를 INSIDE_POLL_MS마다(채집 자료가 바뀌면 곧바로 한 번 더) 묻는다.
// - 그 유닛은 엔진이 그리지 않는다(setHiddenUnits — 모델·캡슐·점·나라 고리). 이름표도 숨긴다(isHidden — unitNames.ts가 묻는다).
// - 건물마다 머무는 수를 건물 위 작은 이름표("안에 N명", 내 유닛이 있으면 data-own)로 띄운다. 누르지 않는다(건물 판이 안의 유닛·[나가기]를 보인다).
// 엔진 덧그림 층 방식(after(보기)에서 화면 좌표, transform만 바꿈)은 gatherOverlay.ts와 같다.
import type { EngineLayer, EngineLayerView, SecondMapEngine } from "@terra/engine";
import type { GatherInsideResponse } from "@terra/shared/gather";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { buildingCentre } from "../nearby/nearbyData.ts";
import type { GatherState } from "./gatherState.ts";

/** 조회 시간 제한(ms) — 채집 조회(gatherData.ts)와 같다 */
const REQUEST_TIMEOUT_MS = 10_000;
/** 다시 묻는 간격(ms) */
export const INSIDE_POLL_MS = 4_000;
/** 채집 자료가 바뀐 뒤 다시 묻기까지 기다림(ms) — 들어가기 끝을 빨리 보이려고 */
const INSIDE_KICK_MS = 600;
/** 이름표를 띄우는 높이(m) — 누른 건물 이름표(7m)보다 낮게 */
const BADGE_LIFT_M = 4.5;
/** 한 화면에 놓는 이름표 수 */
const BADGES = 12;

export interface InsideOverlay {
  /** 그 유닛이 건물 안이라 숨겼나 */
  isHidden(unitId: number): boolean;
  stop(): void;
}

/** 건물마다 머무는 수·내 유닛이 있나(순수 함수, 시험 대상) */
export function insideCounts(
  units: GatherInsideResponse["units"],
): Map<number, { readonly count: number; readonly own: boolean }> {
  const out = new Map<number, { count: number; own: boolean }>();
  for (const unit of units) {
    const entry = out.get(unit.buildingId) ?? { count: 0, own: false };
    entry.count += 1;
    if (unit.own) entry.own = true;
    out.set(unit.buildingId, entry);
  }
  return out;
}

export function attachInsideOverlay(
  engine: Pick<SecondMapEngine, "addLayer" | "requestFrame" | "setHiddenUnits">,
  host: HTMLElement,
  state: GatherState,
  options: { readonly mapKey: number; readonly load?: (mapKey: number) => Promise<GatherInsideResponse> },
): InsideOverlay {
  const load =
    options.load ??
    ((mapKey: number) =>
      api.gather.inside.query({ mapKey }, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }));
  const root = document.createElement("div");
  root.className = "inside-overlay";
  host.after(root);
  const badges = Array.from({ length: BADGES }, () => {
    const element = document.createElement("span");
    element.className = "inside-badge";
    element.hidden = true;
    element.setAttribute("aria-hidden", "true");
    root.append(element);
    return { element, transform: "", text: "" };
  });
  let hidden = new Set<number>();
  let counts = new Map<number, { readonly count: number; readonly own: boolean }>();
  let hiddenKey = "";
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const apply = (answer: GatherInsideResponse): void => {
    if (stopped || answer.status !== "ok" || answer.mapKey !== options.mapKey) return;
    const ids = answer.units.map((unit) => unit.unitId);
    hidden = new Set(ids);
    counts = insideCounts(answer.units);
    const key = ids.join(",");
    if (key !== hiddenKey) {
      hiddenKey = key;
      engine.setHiddenUnits(ids);
    }
    engine.requestFrame();
  };
  const poll = (delayMs: number): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      load(options.mapKey)
        .then(apply)
        .catch(() => undefined)
        .finally(() => {
          if (!stopped && timer === undefined) poll(INSIDE_POLL_MS);
        });
    }, delayMs);
  };

  const place = (view: EngineLayerView): void => {
    let used = 0;
    for (const building of state.buildings) {
      if (used >= BADGES) break;
      const entry = counts.get(building.id);
      if (!entry) continue;
      const centre = buildingCentre(building);
      const point = view.project(centre.x, centre.y, BADGE_LIFT_M);
      if (!point || point.x < 0 || point.y < 0 || point.x > view.width || point.y > view.height) continue;
      const badge = badges[used];
      used += 1;
      if (!badge) continue;
      const text = m.gather_inside_badge({ count: entry.count });
      if (badge.text !== text) {
        badge.text = text;
        badge.element.textContent = text;
      }
      badge.element.dataset.own = entry.own ? "true" : "false";
      badge.element.dataset.building = String(building.id);
      const transform = `translate(${String(Math.round(point.x))}px, ${String(Math.round(point.y))}px) translate(-50%, -100%)`;
      if (badge.transform !== transform) {
        badge.transform = transform;
        badge.element.style.transform = transform;
      }
      badge.element.hidden = false;
    }
    for (let i = used; i < badges.length; i++) {
      const badge = badges[i];
      if (badge && !badge.element.hidden) badge.element.hidden = true;
    }
  };

  const layer: EngineLayer = { after: place };
  const detach = engine.addLayer(layer);
  // 채집 자료(들어가기 끝 등)가 바뀌면 곧 다시 묻는다
  let lastVersion = state.version;
  const unsubscribe = state.subscribe(() => {
    if (state.version === lastVersion) return;
    lastVersion = state.version;
    poll(INSIDE_KICK_MS);
  });
  poll(0);
  return {
    isHidden: (unitId) => hidden.has(unitId),
    stop() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      unsubscribe();
      detach();
      engine.setHiddenUnits([]);
      root.remove();
    },
  };
}
