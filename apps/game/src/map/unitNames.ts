// 2차맵 유닛 이름표 — 사용자 요청 2026-11-12 "유닛 이름이 표시되게 하자"(docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 유닛 겉모습)").
// 지도자 이름표(leaderTags.ts)와 같은 덧그림 층 방식: 엔진 after(보기)에서 프레임마다 화면 좌표로 놓고 transform·글자만 바꾼다(색·크기는
// unitNames.css 토큰, 자리는 정수 px). 손가락·마우스를 받지 않고(pointer-events: none) 읽기 프로그램에는 숨긴다(이름은 유닛 목록·한눈 정보에 있다).
// - 늘 보이는 이름: 내 사이보그와 고른 유닛(확대와 상관없이). 이름이 없는 고른 유닛은 "종류 #번호".
// - 다른 유닛 이름: 사람 키(1.8m)가 화면 NAME_MIN_PX 이상일 때만([임시] — 휴대폰 세로 6/6·5/6, 넓은 화면 6/6~4/6), 화면 가운데에서 가까운
//   차례로 NAME_MAX개까지. 화면 안 이름 있는 유닛이 NAME_CROWD개를 넘으면 다른 유닛 이름은 모두 숨긴다(빽빽한 도시에서 읽히고 빠르게).
//   앞서 놓은 이름표와 겹치는 이름표는 건너뛴다.
// - NPC 국가 지도자는 지도자 이름표가 따로 그린다(여기서는 건너뛴다).
// - 이름·종류는 유닛 외형 조회의 이름표 자료(unitModels.ts labels — 내가 보는 유닛만, 서버가 시야를 본다).
import type { EngineLayer, EngineLayerView, SecondMapEngine } from "@terra/engine";
import { localName } from "../roster/rosterText.ts";
import { m } from "../paraglide/messages.js";
import { kindLabel } from "./mapUnits.ts";
import type { UnitLabels } from "./unitModels.ts";

/** [임시] 다른 유닛 이름을 띄우는 사람 키의 화면 크기(CSS px) */
export const NAME_MIN_PX = 20;
/** [임시] 다른 유닛 이름표 수 상한 */
export const NAME_MAX = 10;
/** [임시] 화면 안 이름 있는 유닛이 이보다 많으면 다른 유닛 이름은 숨긴다 */
export const NAME_CROWD = 40;
/** 이름표를 띄우는 높이: 유닛 키 + 여유(m) — 지도자 이름표(머리 위 0.6m)와 같은 여유 */
const NAME_LIFT_M = 0.6;
/** 늘 보이는 이름표 둘(내 사이보그·고른 유닛) + 다른 유닛 */
const TAGS = NAME_MAX + 2;
/** 겹침 판정에 쓰는 이름표 높이(CSS px) — 글자 한 줄 + 안쪽 여백(--font-size-xs × 줄 높이 + 테두리 둘레) */
const TAG_HEIGHT_PX = 22;

/** 지도자 이름표 높이(m, leaderTags.ts TAG_LIFT_M)와 넉넉히 잡은 너비(CSS px — 이름표 최대 너비 --tap-size × 4) */
const LEADER_TAG_LIFT_M = 2.4;
const LEADER_TAG_WIDTH_PX = 176;
/** 늘 보이는 이름표를 비키려고 위로 올리는 최대 줄 수 */
const MAX_LIFTS = 3;
/** 한 줄 올림(CSS px) — 이름표 높이 + 틈 */
const LIFT_STEP_PX = TAG_HEIGHT_PX + 4;

/** 앞서 놓은 상자와 겹치지 않을 때까지 한 줄씩 올린다(최대 lifts줄). 그래도 겹치면 null(lifts = 0이면 그 자리에서만 본다) */
export function liftClear(box: Placed, placed: readonly Placed[], lifts: number): Placed | null {
  for (let step = 0; step <= lifts; step++) {
    const moved = { ...box, y: box.y - step * LIFT_STEP_PX };
    if (!placed.some((other) => overlaps(moved, other))) return moved;
  }
  return lifts > 0 ? { ...box, y: box.y - lifts * LIFT_STEP_PX } : null;
}

/** 이름표 종류: 내 사이보그·고른 유닛·다른 유닛(색이 다르다) */
type TagRole = "own" | "selected" | "other";

interface Tag {
  readonly element: HTMLSpanElement;
  unitId: number;
  text: string;
  role: TagRole | "";
  transform: string;
  /** 마지막으로 잰 너비(CSS px, 글자가 바뀌면 다시 잰다) */
  width: number;
}

interface Placed {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/** 이름표 상자 둘이 겹치는가(가운데 아래 끝이 (x, y)인 상자) */
export function overlaps(a: Placed, b: Placed): boolean {
  return Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) < TAG_HEIGHT_PX;
}

export interface NameCandidate {
  readonly unitId: number;
  readonly x: number;
  readonly y: number;
}

/**
 * 다른 유닛 이름 고르기(순수): 화면 가운데에서 가까운 차례로 NAME_MAX개. 화면 안 후보가 NAME_CROWD개를 넘으면 없음
 */
export function chooseOthers(
  candidates: readonly NameCandidate[],
  center: { readonly x: number; readonly y: number },
): NameCandidate[] {
  if (candidates.length > NAME_CROWD) return [];
  const distance = (c: NameCandidate): number =>
    (c.x - center.x) * (c.x - center.x) + (c.y - center.y) * (c.y - center.y);
  return candidates.toSorted((a, b) => distance(a) - distance(b) || a.unitId - b.unitId).slice(0, NAME_MAX);
}

export interface UnitNameOptions {
  readonly labels: UnitLabels;
  /** 내 사이보그 유닛(없으면 null) */
  readonly own: () => number | null;
  /** NPC 국가 지도자인가(지도자 이름표가 따로 그린다) */
  readonly isLeader: (unitId: number) => boolean;
  /** 지금 보이는 지도자 유닛(그 이름표와 겹치지 않게 비킨다) */
  readonly leaderIds: () => readonly number[];
}

export function attachUnitNames(
  engine: Pick<SecondMapEngine, "addLayer" | "unitState" | "selected">,
  host: HTMLElement,
  options: UnitNameOptions,
): () => void {
  const { labels } = options;
  const root = document.createElement("div");
  root.className = "unit-name-overlay";
  root.setAttribute("aria-hidden", "true");
  host.after(root);
  const tags: Tag[] = [];
  for (let i = 0; i < TAGS; i++) {
    const element = document.createElement("span");
    element.className = "unit-name";
    element.hidden = true;
    root.append(element);
    tags.push({ element, unitId: 0, text: "", role: "", transform: "", width: 0 });
  }

  /** 이름표 글: 이름, 없으면 고른 유닛만 "종류 #번호"(종류를 모르면 "유닛 #번호"). 그 밖은 null */
  const textOf = (unitId: number, role: TagRole): string | null => {
    const name = labels.nameOf(unitId);
    if (name) return localName(name, String(unitId));
    if (role !== "selected") return null;
    const kind = labels.kindOf(unitId);
    return kind
      ? m.roster_unnamed({ type: kindLabel(kind), number: String(unitId) })
      : m.map_unit_number({ id: unitId });
  };

  const place = (view: EngineLayerView): void => {
    const placed: Placed[] = [];
    let shown = 0;
    const show = (unitId: number, role: TagRole, x: number, y: number): void => {
      const text = textOf(unitId, role);
      const tag = tags[shown];
      if (text === null || !tag) return;
      if (tag.text !== text || tag.role !== role || tag.unitId !== unitId) {
        tag.unitId = unitId;
        tag.element.dataset.unit = String(unitId);
        if (tag.role !== role) {
          tag.role = role;
          tag.element.dataset.role = role;
        }
        if (tag.text !== text) {
          tag.text = text;
          tag.element.textContent = text;
          tag.width = 0;
        }
      }
      if (tag.element.hidden) tag.element.hidden = false;
      if (tag.width === 0) tag.width = tag.element.offsetWidth;
      // 다른 유닛 이름표는 앞서 놓은 것(지도자 이름표·내 사이보그·고른 유닛 먼저)과 겹치면 건너뛰고, 늘 보이는 이름표는 겹치지 않을 때까지
      // 한 줄씩 위로 올린다(지도자 옆에 선 내 사이보그 — 지도자 이름표 아래 가려지지 않게)
      const box = liftClear({ x, y, width: tag.width }, placed, role === "other" ? 0 : MAX_LIFTS);
      if (!box) {
        tag.element.hidden = true;
        return;
      }
      placed.push(box);
      const transform = `translate(${box.x}px, ${box.y}px) translate(-50%, -100%)`;
      if (tag.transform !== transform) {
        tag.transform = transform;
        tag.element.style.transform = transform;
      }
      shown += 1;
    };
    /** 그 유닛 머리 위 화면 점(화면 밖·모름이면 null) */
    const pointOf = (unitId: number): { x: number; y: number } | null => {
      const unit = engine.unitState(unitId);
      if (!unit) return null;
      const point = view.project(unit.x, unit.y, labels.heightOf(unitId) + NAME_LIFT_M);
      if (!point || point.x < 0 || point.y < 0 || point.x > view.width || point.y > view.height) return null;
      return { x: Math.round(point.x), y: Math.round(point.y) };
    };

    // 지도자 이름표 자리(leaderTags.ts와 같은 높이 — 유닛 바닥 위 2.4m, 너비는 이름표 최대 너비로 넉넉히)
    for (const unitId of options.leaderIds()) {
      const unit = engine.unitState(unitId);
      const point = unit ? view.project(unit.x, unit.y, LEADER_TAG_LIFT_M) : null;
      if (point) placed.push({ x: Math.round(point.x), y: Math.round(point.y), width: LEADER_TAG_WIDTH_PX });
    }
    const own = options.own();
    const selected = engine.selected();
    const always: [number, TagRole][] = [];
    if (own !== null) always.push([own, "own"]);
    if (selected !== null && selected !== own) always.push([selected, "selected"]);
    for (const [unitId, role] of always) {
      if (options.isLeader(unitId)) continue;
      const point = pointOf(unitId);
      if (point) show(unitId, role, point.x, point.y);
    }

    if (1.8 * view.pixelsPerMetre >= NAME_MIN_PX) {
      const candidates: NameCandidate[] = [];
      for (const unitId of labels.named()) {
        if (unitId === own || unitId === selected || options.isLeader(unitId)) continue;
        const point = pointOf(unitId);
        if (point) candidates.push({ unitId, ...point });
      }
      for (const candidate of chooseOthers(candidates, { x: view.width / 2, y: view.height / 2 }))
        show(candidate.unitId, "other", candidate.x, candidate.y);
    }
    for (const tag of tags.slice(shown)) {
      if (!tag.element.hidden) tag.element.hidden = true;
    }
    root.dataset.names = String(shown);
  };

  const layer: EngineLayer = { after: place };
  const detach = engine.addLayer(layer);
  return () => {
    detach();
    root.remove();
  };
}
