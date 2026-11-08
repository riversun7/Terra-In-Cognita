// 2차맵 채집·들어가기 화면 상태(React 밖) — docs/adr/2026-11-07-gather-objects.md 6절.
// 엔진 덧그림(gatherOverlay.ts)과 React 판(GatherPanel.tsx)이 같은 상태를 본다: 덧그림은 프레임마다 읽고, React는 판 번호(version)를 구독한다.
// - 자료: 오브젝트(서버 gather.objects를 풀어 둔 것), 내 채집 줄(gather.loops), 건물 칸(지도 자료의 건물 — 누른 칸이 어느 건물인지).
// - 판: 누른 오브젝트·건물(아래 작은 판). 오브젝트·건물 표시는 화면 거리로 고르고(gatherOverlay.ts tap), 땅을 누르면(엔진 onGroundTap) 그 칸이 든
//   건물의 판만 연다 — 둘레 칸 반경으로 오브젝트를 잡으면 이동하려고 누른 땅이 오브젝트 판을 열었다(사용자 지적 2026-11-08 "계속 오브젝트가 잘못눌린다").
import type { BuildingFootprint } from "@terra/engine";
import type { FeedSink } from "../feedTypes.ts";
import {
  GATHER_OBJECT_STRIDE,
  type GatherKindView,
  type GatherLoopView,
  type GatherObjectsResponse,
} from "@terra/shared/gather";

/** 오브젝트 하나(풀어 둔 것) */
export interface GatherObjectEntry {
  readonly id: number;
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly usesLeft: number;
  /** 다시 자라는 시각(서버 ms, 0 = 자라는 중 아님) */
  readonly regrowAtMs: number;
}

export type GatherSheet =
  | { readonly kind: "object"; readonly id: number }
  | { readonly kind: "building"; readonly id: number };

/** 지도에 그리는 채집소 반경(배치 칸 가운데·반경) — 채집소 판이 열려 있는 동안(사용자 지적 2026-11-08) */
export interface StationRing {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** 칸 둘레 오브젝트를 찾는 반경(배치 칸) — 땅 누르기에는 쓰지 않는다(표시는 화면 거리로 고른다) */
export const TAP_RADIUS_CELLS = 2;

export interface GatherState {
  readonly kinds: readonly GatherKindView[];
  readonly objects: readonly GatherObjectEntry[];
  readonly loops: readonly GatherLoopView[];
  /** 지도 자료의 건물 칸(덧그림이 건물 표시를 놓는다) */
  readonly buildings: readonly BuildingFootprint[];
  readonly sheet: GatherSheet | null;
  /** 채집소 반경(없으면 null) */
  readonly ring: StationRing | null;
  /** 바뀔 때마다 오른다(React 구독) */
  readonly version: number;
  subscribe(listener: () => void): () => void;
  setObjects(response: GatherObjectsResponse): void;
  setLoops(loops: readonly GatherLoopView[]): void;
  setBuildings(buildings: readonly BuildingFootprint[]): void;
  open(sheet: GatherSheet | null): void;
  setRing(ring: StationRing | null): void;
  /** 누른 칸: 그 칸이 든 건물이 있으면 판을 열고 true(오브젝트는 표시를 눌러 고른다) */
  tapCell(cell: { readonly x: number; readonly y: number }): boolean;
  objectById(id: number): GatherObjectEntry | undefined;
}

/** 서버 응답 → 오브젝트 목록(걸음이 틀리면 빈 목록) */
export function decodeObjects(response: Pick<GatherObjectsResponse, "objects">): GatherObjectEntry[] {
  const flat = response.objects;
  if (flat.length % GATHER_OBJECT_STRIDE !== 0) return [];
  const out: GatherObjectEntry[] = [];
  for (let i = 0; i < flat.length; i += GATHER_OBJECT_STRIDE) {
    const id = flat[i] ?? 0;
    out.push({
      id,
      kind: flat[i + 1] ?? 0,
      x: id % 256,
      y: Math.floor(id / 256),
      usesLeft: flat[i + 2] ?? 0,
      regrowAtMs: flat[i + 3] ?? 0,
    });
  }
  return out;
}

/** 칸에서 반경 안 가장 가까운 오브젝트(같으면 작은 번호) */
export function nearestObject(
  objects: readonly GatherObjectEntry[],
  cell: { readonly x: number; readonly y: number },
  radius = TAP_RADIUS_CELLS,
): GatherObjectEntry | undefined {
  const cx = Math.floor(cell.x);
  const cy = Math.floor(cell.y);
  let best: GatherObjectEntry | undefined;
  let bestDistance = 0;
  for (const object of objects) {
    const dx = object.x - cx;
    const dy = object.y - cy;
    if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;
    const distance = dx * dx + dy * dy;
    if (!best || distance < bestDistance || (distance === bestDistance && object.id < best.id)) {
      best = object;
      bestDistance = distance;
    }
  }
  return best;
}

/** 칸이 든 건물(돌림을 본 차지 칸) */
export function buildingAt(
  buildings: readonly BuildingFootprint[],
  cell: { readonly x: number; readonly y: number },
): BuildingFootprint | undefined {
  const x = Math.floor(cell.x);
  const y = Math.floor(cell.y);
  return buildings.find((building) => {
    const quarter = building.rotation === 1 || building.rotation === 3;
    const width = quarter ? building.depth : building.width;
    const height = quarter ? building.width : building.depth;
    return (
      x >= building.cellX && x < building.cellX + width && y >= building.cellY && y < building.cellY + height
    );
  });
}

export function createGatherState(): GatherState {
  const listeners = new Set<() => void>();
  let buildings: readonly BuildingFootprint[] = [];
  let byId = new Map<number, GatherObjectEntry>();
  const state = {
    kinds: [] as readonly GatherKindView[],
    objects: [] as readonly GatherObjectEntry[],
    loops: [] as readonly GatherLoopView[],
    sheet: null as GatherSheet | null,
    ring: null as StationRing | null,
    version: 0,
  };
  const changed = (): void => {
    state.version += 1;
    for (const listener of listeners) listener();
  };
  return {
    get kinds() {
      return state.kinds;
    },
    get objects() {
      return state.objects;
    },
    get loops() {
      return state.loops;
    },
    get buildings() {
      return buildings;
    },
    get sheet() {
      return state.sheet;
    },
    get ring() {
      return state.ring;
    },
    get version() {
      return state.version;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setObjects(response) {
      state.kinds = response.kinds;
      state.objects = decodeObjects(response);
      byId = new Map(state.objects.map((object) => [object.id, object]));
      changed();
    },
    setLoops(loops) {
      state.loops = loops;
      changed();
    },
    setBuildings(list) {
      buildings = list;
      changed();
    },
    open(sheet) {
      state.sheet = sheet;
      // 채집소 판이 닫히면 반경도 지운다
      if (sheet?.kind !== "building") state.ring = null;
      changed();
    },
    setRing(ring) {
      const old = state.ring;
      if (old === ring || (old && ring && old.x === ring.x && old.y === ring.y && old.radius === ring.radius))
        return;
      state.ring = ring;
      changed();
    },
    tapCell(cell) {
      const building = buildingAt(buildings, cell);
      if (building) {
        state.sheet = { kind: "building", id: building.id };
        changed();
        return true;
      }
      return false;
    },
    objectById: (id) => byId.get(id),
  };
}

/** 지도 자료가 엔진에 넣는 것을 그대로 넘기면서 건물 칸만 채집 상태에도 둔다(누른 칸이 어느 건물인지) */
export function gatherSink(engine: FeedSink, state: Pick<GatherState, "setBuildings">): FeedSink {
  return {
    setTerrain: (terrain) => engine.setTerrain(terrain),
    setUnits: (units) => engine.setUnits(units),
    setUnitPath: (id, path) => engine.setUnitPath(id, path),
    setBuildings: (buildings) => {
      state.setBuildings(buildings);
      engine.setBuildings(buildings);
    },
    setExplored: (bits) => engine.setExplored(bits),
    select: (id) => engine.select(id),
    selected: () => engine.selected(),
  };
}
