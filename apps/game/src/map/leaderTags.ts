// 2차맵 NPC 국가 지도자 이름표 — docs/adr/2026-11-07-play-flow.md "WP-NPC3", 기획 정리 748 나(지도자 표시·이름표를 지도 위에 늘 붙임)·742 나
// (지도자 = 정부 창구). 엔진 덧그림 층(after(보기))에서 프레임마다 화면 좌표로 놓는다(채집 덧그림 gather/gatherOverlay.ts와 같은 방식: transform·
// data-*·글자만 바꾼다, 색·크기는 leaderTags.css 토큰, 자리는 정수 px).
// - 어느 유닛이 지도자인가: 2차맵 전송의 표시 종류(프로토콜 18 unitMotionSchema kind = npc_leader, mapFeed.ts unitKinds) — 시야 전송으로 받은
//   유닛만이라 "그 유닛을 볼 수 있는 사람 모두"에게 보인다. 이름은 한눈 정보(tRPC world.unitGlance — 서버가 시야를 다시 본다)로 한 번 받는다.
// - 표시(지도자 표시 + 이름)는 손가락·마우스를 받지 않는다(pointer-events: none, docs/adr/2026-11-08-map-input.md 1절 "다른 HTML 표시에도 같은
//   규칙"). 엔진이 유닛을 누르지 않았을 때 이 층의 tap()이 화면 거리 22px 안 가장 가까운 이름표를 고른다 → onPick(그 지도자를 고른 것과 같다 —
//   화면이 지도자 판을 연다). 키보드는 단추로 닿는다(Tab·Enter).
// - 이름표 상태(지도자 ID·이름)는 화면 판(government/LeaderSheet.tsx)도 구독한다(React 밖 작은 상태, gatherState.ts와 같은 꼴).
import type { EngineLayer, EngineLayerView, SecondMapEngine } from "@terra/engine";
import type { MapUnitGlance } from "@terra/shared/mapUnits";
import type { LocalizedName } from "@terra/shared/roster";
import { m } from "../paraglide/messages.js";
import { localName } from "../roster/rosterText.ts";

/** 지도자 표시 종류(프로토콜 UNIT_WIRE_KINDS — 기기 묶음에 zod 스키마를 끌어오지 않게 글자로 둔다) */
export const LEADER_WIRE_KIND = "npc_leader";
/** 한 화면에 놓는 이름표 수(고정 국가마다 지도자 하나 — 한 2차맵에 보통 하나) */
const TAGS = 8;
/** 이름표를 띄우는 높이(m) — 유닛 머리(1.8m) 바로 위 */
const TAG_LIFT_M = 2.4;
/** 누르기로 이름표를 고르는 반경(CSS px) — 누름 영역(--tap-size 44px)의 반, 엔진 유닛 고르기와 같다 */
const HIT_RADIUS_PX = 22;
/** 누름 영역 한 변(CSS px) — 토큰 --tap-size를 읽지 못할 때 */
const FALLBACK_TAP_PX = 44;
/** 이름을 받지 못했으면 다시 묻기까지(ms) */
const NAME_RETRY_MS = 15_000;
const SVG_NS = "http://www.w3.org/2000/svg";

/** 지도자 이름표 상태(이 2차맵에 보이는 지도자와 이름) */
export interface LeaderTagState {
  subscribe(listener: () => void): () => void;
  readonly version: number;
  /** 지금 보이는 지도자 유닛(ID 차례) */
  readonly ids: readonly number[];
  isLeader(unitId: number): boolean;
  /** 지도자 이름(한눈 정보, 받기 전·없으면 null) */
  nameOf(unitId: number): LocalizedName | null;
  /** 덧그림이 바꾼다 */
  setIds(ids: readonly number[]): void;
  setName(unitId: number, name: LocalizedName | null): void;
}

export function createLeaderTagState(): LeaderTagState {
  const listeners = new Set<() => void>();
  const names = new Map<number, LocalizedName | null>();
  let ids: readonly number[] = [];
  let version = 0;
  const changed = (): void => {
    version += 1;
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get version() {
      return version;
    },
    get ids() {
      return ids;
    },
    isLeader: (unitId) => ids.includes(unitId),
    nameOf: (unitId) => names.get(unitId) ?? null,
    setIds(next) {
      if (next.length === ids.length && next.every((id, index) => id === ids[index])) return;
      ids = next;
      for (const id of names.keys()) if (!next.includes(id)) names.delete(id);
      changed();
    },
    setName(unitId, name) {
      if (!ids.includes(unitId) || names.get(unitId) === name) return;
      names.set(unitId, name);
      changed();
    },
  };
}

/** 표시 종류 목록 → 지도자 유닛 ID(차례대로) */
export function leaderIdsOf(kinds: ReadonlyMap<number, string>): number[] {
  const out: number[] = [];
  for (const [id, kind] of kinds) if (kind === LEADER_WIRE_KIND) out.push(id);
  return out.toSorted((a, b) => a - b);
}

/** 이름표 글(이름을 받기 전·없으면 "지도자") */
export function leaderTagText(name: LocalizedName | null): string {
  return name ? localName(name, m.map_unit_kind_npc_leader()) : m.map_unit_kind_npc_leader();
}

interface Hit {
  readonly x: number;
  readonly y: number;
  readonly unitId: number;
}

/** 누른 곳에서 반경 안 가장 가까운 이름표(없으면 null) */
export function pickLeaderTag(
  hits: readonly Hit[],
  point: { readonly x: number; readonly y: number },
): number | null {
  let best: number | null = null;
  let bestDistance = HIT_RADIUS_PX * HIT_RADIUS_PX;
  for (const hit of hits) {
    const distance = (hit.x - point.x) * (hit.x - point.x) + (hit.y - point.y) * (hit.y - point.y);
    if (distance <= bestDistance) {
      best = hit.unitId;
      bestDistance = distance;
    }
  }
  return best;
}

interface Tag {
  readonly button: HTMLButtonElement;
  readonly label: HTMLSpanElement;
  unitId: number;
  text: string;
  transform: string;
}

/** 지도자 표시(왕관 꼴 선 그림, 글자와 같은 색 — 꾸밈이라 읽기 프로그램에는 숨긴다) */
function crown(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "leader-tag-mark");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M4 17.5h16l1.2-9.5-5.2 3.8L12 5l-4 6.8L2.8 8z");
  svg.append(path);
  return svg;
}

export interface LeaderTagOptions {
  readonly mapKey: number;
  /** 지금 표시 종류가 붙은 유닛(mapFeed unitKinds) */
  readonly kinds: () => ReadonlyMap<number, string>;
  /** 지도자 이름 받기(한눈 정보). 시야 밖이면 null */
  readonly loadGlance: (mapKey: number, unitId: number, signal: AbortSignal) => Promise<MapUnitGlance | null>;
  /** 이름표를 눌렀다(키보드 Enter 포함) — 그 지도자를 고른 것처럼 */
  readonly onPick: (unitId: number) => void;
  /** 이름을 물은 시각(ms, 다시 묻기) */
  readonly now?: () => number;
}

export function attachLeaderTags(
  engine: Pick<SecondMapEngine, "addLayer" | "requestFrame" | "unitState">,
  host: HTMLElement,
  state: LeaderTagState,
  options: LeaderTagOptions,
): () => void {
  const now = options.now ?? (() => performance.now());
  const root = document.createElement("div");
  root.className = "leader-overlay";
  host.after(root);
  // 이름표 상자(누름 영역)의 반 — 누르기 고르기는 보이는 이름표 가운데(유닛 머리 위 점에서 이만큼 위)를 잰다. 붙일 때 한 번 읽는다
  const tapPx = Number.parseFloat(getComputedStyle(root).getPropertyValue("--tap-size"));
  const halfBox = (Number.isFinite(tapPx) && tapPx > 0 ? tapPx : FALLBACK_TAP_PX) / 2;
  const tags: Tag[] = [];
  for (let i = 0; i < TAGS; i++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "leader-tag";
    button.hidden = true;
    const pill = document.createElement("span");
    pill.className = "leader-tag-pill";
    const label = document.createElement("span");
    label.className = "leader-tag-name";
    pill.append(crown(), label);
    button.append(pill);
    const tag: Tag = { button, label, unitId: 0, text: "", transform: "" };
    button.addEventListener("click", () => {
      if (tag.unitId > 0) options.onPick(tag.unitId);
    });
    root.append(button);
    tags.push(tag);
  }
  /** 이름을 물은 시각(다시 묻기), 답을 받은 지도자(이름이 없는 팩이어도 다시 묻지 않는다), 끊을 물음 */
  const asked = new Map<number, number>();
  const answered = new Set<number>();
  const controller = new AbortController();
  let hits: Hit[] = [];

  /** 이름이 없는 지도자는 한눈 정보로 한 번 묻는다(못 받으면 NAME_RETRY_MS 뒤 다시) */
  const askNames = (ids: readonly number[]): void => {
    const at = now();
    // 사라진 지도자는 잊는다(다시 보이면 이름을 다시 묻는다 — 상태도 그 이름을 지웠다)
    for (const id of answered) if (!ids.includes(id)) answered.delete(id);
    for (const id of asked.keys()) if (!ids.includes(id)) asked.delete(id);
    for (const id of ids) {
      if (answered.has(id)) continue;
      const last = asked.get(id);
      if (last !== undefined && at - last < NAME_RETRY_MS) continue;
      asked.set(id, at);
      options.loadGlance(options.mapKey, id, controller.signal).then(
        (glance) => {
          // 시야 밖(null)이면 나중에 다시 묻는다
          if (!glance) return;
          answered.add(id);
          if (glance.name) state.setName(id, glance.name);
        },
        () => undefined,
      );
    }
  };

  const place = (view: EngineLayerView): void => {
    const ids = leaderIdsOf(options.kinds());
    state.setIds(ids);
    askNames(ids);
    hits = [];
    let shown = 0;
    for (const id of ids) {
      if (shown >= TAGS) break;
      const unit = engine.unitState(id);
      const point = unit ? view.project(unit.x, unit.y, TAG_LIFT_M) : null;
      if (!point || point.x < 0 || point.y < 0 || point.x > view.width || point.y > view.height) continue;
      const tag = tags[shown];
      if (!tag) break;
      shown += 1;
      const text = leaderTagText(state.nameOf(id));
      if (tag.unitId !== id || tag.text !== text) {
        tag.unitId = id;
        tag.text = text;
        tag.button.dataset.unit = String(id);
        tag.label.textContent = text;
        tag.button.setAttribute("aria-label", m.map_leader_tag_label({ name: text }));
      }
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      hits.push({ x, y: y - halfBox, unitId: id });
      // 이름표 아래 끝이 유닛 머리 위에 오게(누름 상자 44px 가운데에 보이는 이름표)
      const transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      if (tag.transform !== transform) {
        tag.transform = transform;
        tag.button.style.transform = transform;
      }
      if (tag.button.hidden) tag.button.hidden = false;
    }
    for (const tag of tags.slice(shown)) {
      if (!tag.button.hidden) tag.button.hidden = true;
      tag.unitId = 0;
    }
    root.dataset.tags = String(shown);
  };

  const layer: EngineLayer = {
    after: place,
    // 엔진이 누르기로 판정하고 유닛을 누르지 않았을 때: 화면 거리로 가장 가까운 이름표의 지도자를 고른다
    tap(point) {
      const unitId = pickLeaderTag(hits, point);
      if (unitId === null) return false;
      options.onPick(unitId);
      return true;
    },
  };
  const detach = engine.addLayer(layer);
  // 이름이 오면 카메라가 멈춰 있어도 한 번 더 그린다
  const unsubscribe = state.subscribe(() => engine.requestFrame());
  return () => {
    unsubscribe();
    controller.abort(new DOMException("leader tags detached", "AbortError"));
    detach();
    root.remove();
  };
}
