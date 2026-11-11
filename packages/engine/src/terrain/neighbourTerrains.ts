// 이웃 2차맵 지형(경계 너머 보기) — ADR 2026-10-31-second-map-from-planet WP-4, 사용자 요구 "다음 맵 이동 때 연결이 자연스러운지".
// - 이웃 2차맵의 지형 파일을 받아 지금 2차맵 둘레에 놓아 그린다(유닛·건물·소품 모델 없음, 땅 색의 소품 색은 있다).
//   이웃과 이음매가 비트까지 같아(생성기 이음매 시험) 경계가 끊기지 않고 보인다.
// - 놓는 자리: 이웃 칸 (열 c, 행 r) → 지금 2차맵 칸 좌표 (x, z) = (a·c + b·r + tx, cc·c + d·r + tz). 면 경계 너머 이웃은
//   면 틀이 90°의 배수로 돌아가 있다(뒤집힘은 없다: 두 면 모두 오른손 틀). 계산은 게임 앱이 한다(@terra/planet).
// - 칸 크기는 지금 2차맵 값으로 맞춘다(이웃끼리 1% 아래로 다르다: 그대로 두면 변 끝에서 칸 수 × 차이만큼 어긋난다).
// - 안개: 지금 2차맵에 안개가 있으면(setFog(true)) 이웃도 그 2차맵의 탐사 칸(setExplored)으로 칠하고, 아직 모르는 이웃은 온통 어둡게 그린다.
//   지금 2차맵이 전체 보기(안개 없음)면 이웃도 끈다. 사용자 지적 2026-11-08 "인접한 맵은 포그가 적용되지 않는 문제"
//   (docs/adr/2026-11-08-seamless-second-map.md WP-3). 그 전에는 지형이 숨김 정보가 아니라 안개를 뺐다(ADR 26).
import { Group } from "three";
import type { TerrainBuilder } from "./terrainBuilder.ts";
import { TERRAIN_CELLS, type TerrainInput, sampleHeightM } from "./terrainData.ts";
import { TerrainView } from "./terrainView.ts";
import { composePlacement } from "./rebase.ts";

/** 아직 탐사 칸을 모르는 이웃(온통 어두움) — 시야 칸 32×32 비트 */
export const UNEXPLORED = new Uint8Array(128);

/** 놓는 자리 → 그룹 행렬(지형 칸 단위 옮김 × 칸 크기) */
function placeView(view: TerrainView, placement: NeighbourPlacement, cellSizeM: number): void {
  const { a, b, cc, d, tx, tz } = placement;
  view.group.matrixAutoUpdate = false;
  view.group.matrix.set(a, 0, b, tx * cellSizeM, 0, 1, 0, 0, cc, 0, d, tz * cellSizeM, 0, 0, 0, 1);
  view.group.matrixWorldNeedsUpdate = true;
}

/** 이웃 칸 좌표 → 지금 2차맵 칸 좌표(지형 칸 단위). a·b·cc·d는 −1·0·1(90°의 배수 돌림) */
export interface NeighbourPlacement {
  readonly a: number;
  readonly b: number;
  readonly cc: number;
  readonly d: number;
  readonly tx: number;
  readonly tz: number;
}

export interface NeighbourTerrain {
  /** 이웃을 가리키는 이름(2차맵 키 등). 같은 이름이면 다시 만들지 않는다 */
  readonly id: string;
  readonly terrain: TerrainInput;
  readonly placement: NeighbourPlacement;
}

interface Entry {
  readonly view: TerrainView;
  readonly terrain: TerrainInput;
  readonly placement: NeighbourPlacement;
}

export interface MapBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 소품 층이 있는 이웃 하나(소품 그림·엄폐 256², 지표 128² = 땅 잔소품) */
export interface NeighbourPropLayer {
  readonly id: string;
  readonly art: Uint8Array;
  readonly cover: Uint8Array;
  readonly surface: Uint8Array;
  readonly placement: NeighbourPlacement;
}

export class NeighbourTerrains {
  readonly group = new Group();
  private readonly entries = new Map<string, Entry>();
  private version = 0;
  private grid = false;
  /** 안개를 그리나(지금 2차맵에 안개가 있을 때) */
  private fog = false;
  /** 이웃 id → 탐사 칸(받은 것만) */
  private readonly explored = new Map<string, Uint8Array>();

  constructor(private readonly builder: TerrainBuilder) {}

  get count(): number {
    return this.entries.size;
  }

  /**
   * 이웃 목록을 바꾼다(없어진 것은 버리고 새것은 워커에서 메시를 만든다). cellSizeM = 지금 2차맵 칸 크기,
   * shade = 지금 2차맵 높이 범위(높이 밝기를 경계 양쪽에서 같게).
   * 더 새 목록이 오면 이전 것은 버린다. 바뀌었으면 true
   */
  async set(
    list: readonly NeighbourTerrain[],
    cellSizeM: number,
    shade?: { minHeightM: number; maxHeightM: number },
  ): Promise<boolean> {
    const version = ++this.version;
    const wanted = new Set(list.map((item) => item.id));
    let changed = false;
    for (const [id, entry] of this.entries) {
      if (wanted.has(id)) continue;
      entry.view.dispose();
      this.entries.delete(id);
      changed = true;
    }
    for (const item of list) {
      if (this.entries.has(item.id)) continue;
      const terrain: TerrainInput = { ...item.terrain, cellSizeM };
      const built = await this.builder.build(terrain);
      if (version !== this.version) return changed;
      const view = new TerrainView();
      view.setWalls(false);
      view.setGrid(this.grid);
      view.setExplored(this.fogOf(item.id));
      view.set(built.mesh, terrain, built.noise, shade);
      placeView(view, item.placement, cellSizeM);
      this.group.add(view.group);
      this.entries.set(item.id, { view, terrain, placement: item.placement });
      changed = true;
    }
    return changed;
  }

  /** 안개를 켜고 끈다(지금 2차맵의 안개와 같게). 지금 이웃과 뒤에 올 이웃 모두 */
  setFog(on: boolean): void {
    if (this.fog === on) return;
    this.fog = on;
    for (const [id, entry] of this.entries) entry.view.setExplored(this.fogOf(id));
  }

  /** 이웃 하나의 탐사 칸(그 2차맵을 구독해 받은 것). null이면 잊는다(온통 어두움) */
  setExplored(id: string, bits: Uint8Array | null): void {
    if (bits) this.explored.set(id, bits);
    else this.explored.delete(id);
    this.entries.get(id)?.view.setExplored(this.fogOf(id));
  }

  private fogOf(id: string): Uint8Array | null {
    return this.fog ? (this.explored.get(id) ?? UNEXPLORED) : null;
  }

  /**
   * 옆 2차맵으로 넘기(docs/adr/2026-11-08-seamless-second-map.md WP-3): 이웃 하나를 꺼낸다(버리지 않는다 — 엔진이 지금 2차맵으로 쓴다).
   * 없으면 null. 받은 탐사 칸도 같이 돌려준다
   */
  take(id: string): {
    view: TerrainView;
    terrain: TerrainInput;
    placement: NeighbourPlacement;
    explored: Uint8Array | null;
  } | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    this.entries.delete(id);
    this.version += 1;
    entry.view.group.removeFromParent();
    const explored = this.explored.get(id) ?? null;
    this.explored.delete(id);
    return { ...entry, explored };
  }

  /** 남은 이웃을 모두 다른 틀로 옮긴다(p = 옛 지금 2차맵 칸 좌표 → 새 지금 2차맵 칸 좌표) */
  reframe(p: NeighbourPlacement): void {
    for (const [id, entry] of this.entries) {
      const placement = composePlacement(p, entry.placement);
      placeView(entry.view, placement, entry.terrain.cellSizeM);
      this.entries.set(id, { ...entry, placement });
    }
  }

  /** 다 만든 지형 보기를 이웃으로 들인다(넘기 전 지금 2차맵). explored = 그 2차맵 탐사 칸(없으면 null) */
  adopt(
    id: string,
    view: TerrainView,
    terrain: TerrainInput,
    placement: NeighbourPlacement,
    explored: Uint8Array | null,
  ): void {
    this.entries.get(id)?.view.dispose();
    if (explored) this.explored.set(id, explored);
    view.setWalls(false);
    view.setGrid(this.grid);
    view.setExplored(this.fogOf(id));
    placeView(view, placement, terrain.cellSizeM);
    this.group.add(view.group);
    this.entries.set(id, { view, terrain, placement });
  }

  /** 격자 선(개발자 2차맵 시험): 지금 이웃과 뒤에 올 이웃 모두 */
  setGrid(on: boolean): void {
    this.grid = on;
    for (const entry of this.entries.values()) entry.view.setGrid(on);
  }

  /** 소품 층이 있는 이웃(소품 모델 세우기, propView.ts) */
  propLayers(): NeighbourPropLayer[] {
    const out: NeighbourPropLayer[] = [];
    for (const [id, { terrain, placement }] of this.entries) {
      if (terrain.art && terrain.cover)
        out.push({ id, art: terrain.art, cover: terrain.cover, surface: terrain.surface, placement });
    }
    return out;
  }

  /** 세계 (x, z)가 이웃 위면 그 땅 높이(m), 아니면 null */
  heightAt(x: number, z: number): number | null {
    for (const { terrain, placement } of this.entries.values()) {
      const size = terrain.cellSizeM;
      const local = toLocal(placement, x / size, z / size);
      if (local.c < 0 || local.r < 0 || local.c > TERRAIN_CELLS || local.r > TERRAIN_CELLS) continue;
      return sampleHeightM(terrain, local.c * size, local.r * size);
    }
    return null;
  }

  /** 지금 2차맵(0 ~ mapSize)과 이웃이 덮는 범위(m) */
  bounds(mapSize: number): MapBounds {
    const out = { minX: 0, maxX: mapSize, minZ: 0, maxZ: mapSize };
    for (const { terrain, placement } of this.entries.values()) {
      const size = terrain.cellSizeM;
      for (const [c, r] of [
        [0, 0],
        [TERRAIN_CELLS, TERRAIN_CELLS],
      ] as const) {
        const x = (placement.a * c + placement.b * r + placement.tx) * size;
        const z = (placement.cc * c + placement.d * r + placement.tz) * size;
        out.minX = Math.min(out.minX, x);
        out.maxX = Math.max(out.maxX, x);
        out.minZ = Math.min(out.minZ, z);
        out.maxZ = Math.max(out.maxZ, z);
      }
    }
    return out;
  }

  dispose(): void {
    this.version += 1;
    for (const entry of this.entries.values()) entry.view.dispose();
    this.entries.clear();
    this.group.removeFromParent();
  }
}

/** 지금 2차맵 칸 좌표 → 이웃 칸 좌표(돌림의 역 = 전치) */
export function toLocal(placement: NeighbourPlacement, x: number, z: number): { c: number; r: number } {
  const dx = x - placement.tx;
  const dz = z - placement.tz;
  return { c: placement.a * dx + placement.cc * dz, r: placement.b * dx + placement.d * dz };
}
