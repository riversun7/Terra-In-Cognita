// 지금 2차맵 유닛 + 옆 2차맵 유닛을 엔진 하나에 — 사용자 지적 2026-11-09 "맵이 끊김없이 이어지게 다른 유닛도 보이고 해야한다"
// (docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜 2"). 옆 2차맵 흐름(mapFeedPool.ts)이 받은 유닛 경로를 놓는 자리로 지금 2차맵 틀로
// 옮겨(경로는 곧은 선이라 90° 돌림 + 옮김을 해도 같은 움직임) 지금 2차맵 유닛과 함께 엔진에 넣는다. 서버가 그 구독에 보내는 유닛만 보이므로
// (내 시야 안·내 유닛, 운영자 전체 보기면 모두) 숨김 정보는 새지 않는다.
// - 지금 2차맵 자료(mapFeed.ts)의 setUnits·setUnitPath를 가로채 경로를 기억한다: 목록을 다시 넣을 때(엔진은 목록을 바꾸면 경로를 처음 자리로 둔다)
//   모든 경로를 다시 건다. 고른 유닛은 다시 고른다.
// - 옆 2차맵 유닛은 모인 것이 바뀌면(들고 남) 목록을 다시 넣고, 경로만 바뀌면 그 유닛 경로만 건다.
// - 같은 ID가 지금 2차맵에도 있으면(넘어가는 순간) 지금 2차맵 것만 쓴다. 엔진 상한을 넘는 옆 2차맵 유닛은 넣지 않는다.
// 이어 보이기("바뀜 (2026-11-11)", 사용자 지적 "미세한 화면전환의 흔적"): 카메라가 따라가는 유닛(carry)은 넘는 순간에도 끊기지 않게 한다.
// - 지금 2차맵에서 사라지면(서버가 옆 2차맵으로 넘겼다) onCarryGone으로 알리고, 넘는 중이라고 하면 잠깐 "남은 그림"(ghost)을 둔다:
//   걷던 쪽으로 계속 걷는다(GHOST_CELLS까지). 옆 2차맵 흐름에 나타나거나 화면이 넘어가 새 자료가 오면 남은 그림은 사라진다.
// - 그 뒤 잠깐(BLEND_WINDOW_MS)은 새 경로를 화면에 보이던 자리에서 잇는다(unitBlend.ts blendPath) — 서버가 첫 칸에 세우는 한 칸 건너뜀이 안 보인다.
// - 화면이 옆 2차맵으로 넘을 때 carryOut으로 그 유닛의 보이던 자리·걷던 쪽을 꺼내 새 틀로 옮겨 다음 합치기에 carryIn으로 넣는다(mapSession.ts).
import type { NeighbourPlacement, UnitPath, UnitSpawn } from "@terra/engine";
import type { FeedSink } from "./feedTypes.ts";
import {
  type CellPoint,
  blendPath,
  pathEnd,
  pathThroughPlacement,
  pointThroughPlacement,
} from "./unitBlend.ts";

/** 남은 그림을 두는 시간(ms)과 그동안 걷는 길이(배치 칸) */
export const GHOST_MS = 4_000;
export const GHOST_CELLS = 1.5;
/** 넘은 뒤 새 경로를 보이던 자리에서 잇는 시간(ms) */
export const BLEND_WINDOW_MS = 5_000;

interface Entry {
  readonly spawn: UnitSpawn;
  /** 엔진에 건 경로(지금 2차맵 틀. 받기 전 null — 처음 자리에 선다) */
  readonly path: UnitPath | null;
}

/** 넘을 때 이어 보일 유닛(그 합치기의 틀 — 화면이 새 틀로 옮긴다) */
export interface CarriedUnit {
  readonly id: number;
  readonly look: UnitSpawn["look"];
  /** 화면에 보이던 자리 */
  readonly at: CellPoint;
  /** 걷던 쪽(단위 벡터, 서 있었으면 null)과 속도(배치 칸/초) */
  readonly heading: CellPoint | null;
  readonly speed: number;
}

export interface UnitMergerOptions {
  /** 엔진 유닛 상한(넘는 옆 2차맵 유닛은 넣지 않는다) */
  readonly capacity: number;
  /** 화면에 보이는 그 유닛의 지금 자리(엔진 unitState). 엔진이 모르면 null */
  readonly unitAt: (id: number) => CellPoint | null;
  /** 서버 시계(ms, 경로 출발 시각과 같은 시계) */
  readonly now: () => number;
  /** 이어 보일 유닛(카메라가 따라가는 기준 유닛, 없으면 null) */
  readonly carry: () => number | null;
  /**
   * 이어 보일 유닛이 지금 2차맵에서 사라졌다(last = 보이던 자리, goal = 걷던 경로의 끝 — 서 있었으면 null). 옆 2차맵으로 넘는 중이면 true —
   * 남은 그림을 둔다. 아니면(시야 밖·쓰러짐) false
   */
  readonly onCarryGone?: (unitId: number, last: CellPoint, goal: CellPoint | null) => boolean;
}

export interface UnitMerger {
  /** 지금 2차맵 자료가 넣는 받는 쪽(next = 엔진 쪽)을 감싼다 */
  wrap(next: FeedSink): FeedSink;
  /** 옆 2차맵 흐름이 넣는 받는 쪽(그 틀의 유닛 — 놓는 자리로 지금 틀로 옮겨 넣는다) */
  neighbourSink(mapKey: number, placement: NeighbourPlacement): Pick<FeedSink, "setUnits" | "setUnitPath">;
  /** 옆 2차맵 유닛을 지운다(그 흐름을 닫았다) */
  clearNeighbour(mapKey: number): void;
  /** 옆 2차맵에서 온 유닛인가 */
  isNeighbourUnit(id: number): boolean;
  /** 지금 2차맵 유닛의 엔진에 건 경로(없거나 받기 전이면 null) — 기준 유닛이 어디로 가는지 */
  mainPath(id: number): UnitPath | null;
  /** 넘을 때: 이어 보일 유닛의 지금 모습(없거나 엔진이 모르면 null) */
  carryOut(): CarriedUnit | null;
  /** 넘어온 뒤: 이어 보일 유닛(이 합치기의 틀로 옮긴 것). 새 자료가 올 때까지 남은 그림으로 두고, 오면 그 자리에서 잇는다 */
  carryIn(unit: CarriedUnit): void;
  /** 남은 그림 타이머를 멈춘다 */
  stop(): void;
}

/** 경로가 지금(nowMs) 가는 쪽(단위 벡터). 서 있거나 다 갔으면 마지막 구간, 구간이 없으면 null */
function headingOf(path: UnitPath, nowMs: number): CellPoint | null {
  const count = Math.floor(path.points.length / 2);
  let travelled = (Math.max(0, nowMs - path.departAtMs) / 1000) * path.speedCellsPerSec;
  let heading: CellPoint | null = null;
  for (let i = 0; i + 1 < count; i++) {
    const dx = Number(path.points[i * 2 + 2]) - Number(path.points[i * 2]);
    const dy = Number(path.points[i * 2 + 3]) - Number(path.points[i * 2 + 1]);
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    heading = { x: dx / length, y: dy / length };
    if (travelled < length) break;
    travelled -= length;
  }
  return heading;
}

export function createUnitMerger(options: UnitMergerOptions): UnitMerger {
  let sink: FeedSink | null = null;
  const main = new Map<number, Entry>();
  const neighbours = new Map<number, Map<number, Entry>>();
  /** 남은 그림(이어 보일 유닛이 어느 목록에도 없을 때만 넣는다) */
  let ghost: { readonly entry: Entry; readonly untilMs: number } | null = null;
  let ghostTimer: ReturnType<typeof setTimeout> | undefined;
  /** 새 경로를 보이던 자리에서 잇는 유닛과 끝나는 시각 */
  let blend: { readonly id: number; readonly untilMs: number } | null = null;
  /** 목록을 다시 넣기 직전에 잰 보이던 자리(다음 그 유닛 경로에 쓴다) */
  let pendingShown: { readonly id: number; readonly at: CellPoint } | null = null;

  const inNeighbour = (id: number): boolean => {
    for (const units of neighbours.values()) if (units.has(id)) return true;
    return false;
  };

  const push = (): void => {
    if (!sink) return;
    const keep = sink.selected();
    const all: Entry[] = [...main.values()];
    const seen = new Set<number>(main.keys());
    for (const units of neighbours.values()) {
      for (const [id, entry] of units) {
        if (seen.has(id) || all.length >= options.capacity) continue;
        seen.add(id);
        all.push(entry);
      }
    }
    if (ghost && (seen.has(ghost.entry.spawn.id) || options.now() >= ghost.untilMs)) ghost = null;
    if (ghost && all.length < options.capacity) all.push(ghost.entry);
    sink.setUnits(all.map((entry) => entry.spawn));
    for (const entry of all) if (entry.path) sink.setUnitPath(entry.spawn.id, entry.path);
    if (keep !== null && all.some((entry) => entry.spawn.id === keep)) sink.select(keep);
  };

  const setGhost = (unit: CarriedUnit): void => {
    const now = options.now();
    const points =
      unit.heading && unit.speed > 0
        ? [
            unit.at.x,
            unit.at.y,
            unit.at.x + unit.heading.x * GHOST_CELLS,
            unit.at.y + unit.heading.y * GHOST_CELLS,
          ]
        : [unit.at.x, unit.at.y];
    ghost = {
      entry: {
        spawn: { id: unit.id, look: unit.look, x: unit.at.x, y: unit.at.y },
        path: { points, departAtMs: now, speedCellsPerSec: unit.speed },
      },
      untilMs: now + GHOST_MS,
    };
    blend = { id: unit.id, untilMs: now + BLEND_WINDOW_MS };
    if (ghostTimer !== undefined) clearTimeout(ghostTimer);
    ghostTimer = setTimeout(() => {
      ghostTimer = undefined;
      if (ghost) push();
    }, GHOST_MS + 50);
  };

  /** 잇는 중인 유닛이면 새 경로를 보이던 자리에서 시작하게 고친다 */
  const blended = (id: number, path: UnitPath): UnitPath => {
    const shown = pendingShown?.id === id ? pendingShown.at : null;
    if (pendingShown?.id === id) pendingShown = null;
    if (!blend || blend.id !== id) return path;
    const now = options.now();
    if (now >= blend.untilMs) {
      blend = null;
      return path;
    }
    const from = shown ?? options.unitAt(id);
    return from ? blendPath(from, path, now) : path;
  };

  /**
   * 목록을 다시 넣기 전에 잇는 중인 유닛의 보이던 자리를 잰다(다시 넣으면 엔진은 처음 자리로 둔다). 돌려준 함수를 목록을 바꾼 뒤 부른다:
   * 그 유닛의 경로를 곧 새로 받는 목록(fresh)이면 그 자리를 다음 경로에 쓰고, 아니면 버린다(기억한 경로를 그대로 다시 걸었다)
   */
  const noteShown = (): ((fresh: boolean) => void) => {
    const id = blend?.id ?? null;
    const at =
      id === null ? null : (options.unitAt(id) ?? (pendingShown?.id === id ? pendingShown.at : null));
    return (fresh) => {
      pendingShown = fresh && id !== null && at ? { id, at } : null;
    };
  };

  return {
    wrap(next) {
      sink = next;
      return {
        ...next,
        setUnits: (list) => {
          const carry = options.carry();
          const previous = carry === null ? undefined : main.get(carry);
          const last = previous ? options.unitAt(previous.spawn.id) : null;
          const keepShown = noteShown();
          main.clear();
          for (const spawn of list) main.set(spawn.id, { spawn, path: null });
          keepShown(blend !== null && main.has(blend.id));
          // 이어 보일 유닛이 지금 2차맵에서 사라졌다: 넘는 중이면 남은 그림을 두고 그 자리에서 잇는다
          if (previous && last && !main.has(previous.spawn.id) && !inNeighbour(previous.spawn.id)) {
            const now = options.now();
            const gone: CarriedUnit = {
              id: previous.spawn.id,
              look: previous.spawn.look,
              at: last,
              heading: previous.path ? headingOf(previous.path, now) : null,
              speed: previous.path?.speedCellsPerSec ?? 0,
            };
            const goal = previous.path ? pathEnd(previous.path) : null;
            if (options.onCarryGone?.(gone.id, last, goal) === true) setGhost(gone);
          }
          push();
        },
        setUnitPath: (id, path) => {
          const entry = main.get(id);
          if (!entry) return;
          const shown = blended(id, path);
          main.set(id, { spawn: entry.spawn, path: shown });
          next.setUnitPath(id, shown);
        },
      };
    },
    neighbourSink(mapKey, placement) {
      return {
        setUnits: (list) => {
          const keepShown = noteShown();
          const entries = new Map<number, Entry>();
          for (const spawn of list) {
            const at = pointThroughPlacement(spawn, placement);
            entries.set(spawn.id, { spawn: { ...spawn, x: at.x, y: at.y }, path: null });
          }
          neighbours.set(mapKey, entries);
          keepShown(blend !== null && !main.has(blend.id) && entries.has(blend.id));
          push();
        },
        setUnitPath: (id, path) => {
          const entries = neighbours.get(mapKey);
          const entry = entries?.get(id);
          if (!entries || !entry) return;
          const moved = pathThroughPlacement(path, placement);
          // 지금 2차맵에도 있으면 그쪽을 그린다(이 경로는 기억만)
          if (main.has(id)) {
            entries.set(id, { spawn: entry.spawn, path: moved });
            return;
          }
          const shown = blended(id, moved);
          entries.set(id, { spawn: entry.spawn, path: shown });
          sink?.setUnitPath(id, shown);
        },
      };
    },
    clearNeighbour(mapKey) {
      if (!neighbours.delete(mapKey)) return;
      push();
    },
    isNeighbourUnit(id) {
      return !main.has(id) && inNeighbour(id);
    },
    mainPath: (id) => main.get(id)?.path ?? null,
    carryOut() {
      const id = options.carry();
      if (id === null) return null;
      const at = options.unitAt(id);
      if (!at) return null;
      let entry = main.get(id);
      if (!entry) for (const units of neighbours.values()) entry ??= units.get(id);
      if (!entry && ghost?.entry.spawn.id === id) entry = ghost.entry;
      if (!entry) return null;
      const now = options.now();
      const walking = entry.path ? headingOf(entry.path, now) : null;
      return {
        id,
        look: entry.spawn.look,
        at,
        heading: walking,
        speed: entry.path?.speedCellsPerSec ?? 0,
      };
    },
    carryIn(unit) {
      setGhost(unit);
      // 엔진에 아직 넣지 못해도(받는 쪽을 감싸기 전) 다음 경로는 이 자리에서 잇는다
      pendingShown = { id: unit.id, at: unit.at };
      push();
    },
    stop() {
      if (ghostTimer !== undefined) clearTimeout(ghostTimer);
      ghostTimer = undefined;
    },
  };
}
