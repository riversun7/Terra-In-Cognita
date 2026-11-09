// 지금 2차맵 유닛 + 옆 2차맵 유닛을 엔진 하나에 — 사용자 지적 2026-11-09 "맵이 끊김없이 이어지게 다른 유닛도 보이고 해야한다"
// (docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜 2"). 옆 2차맵 구독(neighbourVision.ts)이 받은 유닛 경로를 놓는 자리로 지금 2차맵 틀로
// 옮겨(경로는 곧은 선이라 90° 돌림 + 옮김을 해도 같은 움직임) 지금 2차맵 유닛과 함께 엔진에 넣는다. 서버가 그 구독에 보내는 유닛만 보이므로
// (내 시야 안·내 유닛) 숨김 정보는 새지 않는다.
// - 지금 2차맵 자료(mapFeed.ts)의 setUnits·setUnitPath를 가로채 경로를 기억한다: 목록을 다시 넣을 때(엔진은 목록을 바꾸면 경로를 처음 자리로 둔다)
//   모든 경로를 다시 건다. 고른 유닛은 다시 고른다.
// - 옆 2차맵 유닛은 모인 것이 바뀌면(들고 남) 목록을 다시 넣고, 경로만 바뀌면 그 유닛 경로만 건다.
// - 같은 ID가 지금 2차맵에도 있으면(넘어가는 순간) 지금 2차맵 것만 쓴다.
import type { NeighbourPlacement, UnitPath, UnitSpawn } from "@terra/engine";
import { POSITION_UNITS_PER_CELL, type UnitMotionWire } from "@terra/protocol";
import type { FeedSink } from "./feedTypes.ts";
import { toUnitPath, toUnitSpawn } from "./mapWire.ts";

/** 옆 틀의 경로를 지금 2차맵 틀로(위치 단위. 놓는 자리는 지형 칸 = 배치 칸의 반) */
export function wireToMainFrame(wire: UnitMotionWire, placement: NeighbourPlacement): UnitMotionWire {
  const { a, b, cc, d, tx, tz } = placement;
  const path: number[] = [];
  for (let i = 0; i + 1 < wire.path.length; i += 2) {
    const x = (wire.path[i] ?? 0) / POSITION_UNITS_PER_CELL / 2;
    const y = (wire.path[i + 1] ?? 0) / POSITION_UNITS_PER_CELL / 2;
    path.push(
      (a * x + b * y + tx) * 2 * POSITION_UNITS_PER_CELL,
      (cc * x + d * y + tz) * 2 * POSITION_UNITS_PER_CELL,
    );
  }
  return { ...wire, path };
}

interface Entry {
  readonly spawn: UnitSpawn;
  /** 받은 경로(지금 2차맵 유닛은 경로를 받기 전 null — 처음 자리에 선다) */
  readonly path: UnitPath | null;
}

export interface UnitMerger {
  /** 지금 2차맵 자료가 넣는 받는 쪽(next = 엔진 쪽)을 감싼다 */
  wrap(next: FeedSink): FeedSink;
  /** 옆 2차맵 유닛(그 틀의 경로)을 통째로 바꾼다. changed = 경로만 바뀐 유닛(null이면 들고 남이 있다) */
  setNeighbour(
    mapKey: number,
    placement: NeighbourPlacement,
    units: ReadonlyMap<number, UnitMotionWire>,
    changed: readonly number[] | null,
  ): void;
  /** 옆 2차맵 유닛을 지운다(구독을 풀었다) */
  clearNeighbour(mapKey: number): void;
  /** 옆 2차맵에서 온 유닛인가 */
  isNeighbourUnit(id: number): boolean;
}

export function createUnitMerger(): UnitMerger {
  let sink: FeedSink | null = null;
  const main = new Map<number, Entry>();
  const neighbours = new Map<number, Map<number, Entry>>();

  const push = (): void => {
    if (!sink) return;
    const keep = sink.selected();
    const all: Entry[] = [...main.values()];
    for (const units of neighbours.values()) {
      for (const [id, entry] of units) if (!main.has(id)) all.push(entry);
    }
    sink.setUnits(all.map((entry) => entry.spawn));
    for (const entry of all) if (entry.path) sink.setUnitPath(entry.spawn.id, entry.path);
    if (keep !== null && all.some((entry) => entry.spawn.id === keep)) sink.select(keep);
  };

  return {
    wrap(next) {
      sink = next;
      return {
        ...next,
        setUnits: (list) => {
          main.clear();
          for (const spawn of list) main.set(spawn.id, { spawn, path: null });
          push();
        },
        setUnitPath: (id, path) => {
          const entry = main.get(id);
          if (entry) main.set(id, { spawn: entry.spawn, path });
          next.setUnitPath(id, path);
        },
      };
    },
    setNeighbour(mapKey, placement, units, changed) {
      const entries = new Map<number, Entry>();
      for (const [id, wire] of units) {
        const moved = wireToMainFrame(wire, placement);
        entries.set(id, { spawn: toUnitSpawn(moved), path: toUnitPath(moved) });
      }
      neighbours.set(mapKey, entries);
      if (changed === null) {
        push();
        return;
      }
      for (const id of changed) {
        const entry = entries.get(id);
        if (entry?.path && !main.has(id)) sink?.setUnitPath(id, entry.path);
      }
    },
    clearNeighbour(mapKey) {
      if (!neighbours.delete(mapKey)) return;
      push();
    },
    isNeighbourUnit(id) {
      if (main.has(id)) return false;
      for (const units of neighbours.values()) if (units.has(id)) return true;
      return false;
    },
  };
}
