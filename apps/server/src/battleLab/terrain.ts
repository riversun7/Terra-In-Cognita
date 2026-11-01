// 전투장 지형 — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 4절
// 빈 평지 + 월드의 시험 2차맵(S1 시험 2차맵, 시험 자리 종류 강·해안·호수·산·숲·초원)에서 전투장(48칸)을 잘라 만든다.
// 2차맵 지형 층(꼭짓점 높이 129²·지표 128²·배치 칸 엄폐 256²) → 배치 칸 지형 비용(@terra/sim placementCostsFromLayers, 0 = 막힘)
// → 통과 몫이 가장 큰 창(8칸 걸음, 같으면 가운데에 가까운 것). 높이는 지형 칸 네 꼭짓점 평균(cm × 16, 창의 최저점 = 0, ADR 35).
// 만든 전투장은 지형 ID마다 기억한다(지형은 판 표지 안에서 바뀌지 않는다). 지형이 없는 서버는 빈 평지와 S1 임시 지형만 있다.
import type { LabTerrainView } from "@terra/shared/battleLab";
import {
  type BattleMapInput,
  PLACEMENT_SIZE,
  TERRAIN_VERTEX_SIZE,
  type TerrainLayers,
  placementCostsFromLayers,
} from "@terra/sim";
import { ARENA_SIZE, flatArena } from "./arena.ts";

/** 창을 찾는 걸음(배치 칸) */
const WINDOW_STEP = 8;
/** 배치 칸 하나 = 지형 칸 반 */
const PLACEMENT_PER_TERRAIN = 2;

/** 2차맵 지형 층 → 전투장(배치 칸 size² 창) */
export function arenaMapFromLayers(layers: TerrainLayers, size = ARENA_SIZE): BattleMapInput {
  const costs = placementCostsFromLayers(layers);
  const full = PLACEMENT_SIZE;
  // 통과 칸 누적 합(창 합을 빨리)
  const sum = new Int32Array((full + 1) * (full + 1));
  for (let y = 0; y < full; y++)
    for (let x = 0; x < full; x++) {
      const open = (costs[y * full + x] ?? 0) > 0 ? 1 : 0;
      sum[(y + 1) * (full + 1) + x + 1] =
        open +
        (sum[y * (full + 1) + x + 1] ?? 0) +
        (sum[(y + 1) * (full + 1) + x] ?? 0) -
        (sum[y * (full + 1) + x] ?? 0);
    }
  const at = (x: number, y: number) => sum[y * (full + 1) + x] ?? 0;
  const windowOpen = (x0: number, y0: number): number =>
    at(x0 + size, y0 + size) - at(x0, y0 + size) - at(x0 + size, y0) + at(x0, y0);
  const middle = (full - size) / 2;
  let best = { x: middle, y: middle, open: -1, far: 0 };
  for (let y0 = 0; y0 + size <= full; y0 += WINDOW_STEP)
    for (let x0 = 0; x0 + size <= full; x0 += WINDOW_STEP) {
      const open = windowOpen(x0, y0);
      const far = Math.abs(x0 - middle) + Math.abs(y0 - middle);
      if (open > best.open || (open === best.open && far < best.far)) best = { x: x0, y: y0, open, far };
    }
  const cells = size * size;
  const passable = new Uint8Array(cells);
  const cover = new Uint8Array(cells);
  const height = new Int32Array(cells);
  let lowest = Number.POSITIVE_INFINITY;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = best.x + x;
      const py = best.y + y;
      const index = y * size + x;
      passable[index] = (costs[py * full + px] ?? 0) > 0 ? 1 : 0;
      cover[index] = layers.cover?.[py * full + px] ?? 0;
      const tx = Math.floor(px / PLACEMENT_PER_TERRAIN);
      const ty = Math.floor(py / PLACEMENT_PER_TERRAIN);
      const top = ty * TERRAIN_VERTEX_SIZE + tx;
      const h = layers.heights;
      const cm = Math.floor(
        ((h[top] ?? 0) +
          (h[top + 1] ?? 0) +
          (h[top + TERRAIN_VERTEX_SIZE] ?? 0) +
          (h[top + TERRAIN_VERTEX_SIZE + 1] ?? 0)) /
          4,
      );
      height[index] = cm * 16;
      lowest = Math.min(lowest, cm * 16);
    }
  for (let i = 0; i < cells; i++) height[i] = (height[i] ?? 0) - lowest;
  return { size, passable, cover, height, buildings: [] };
}

export interface ArenaTerrains {
  list(): LabTerrainView[];
  /** 지형 ID → 전투장. 모르는 ID·자리가 없는 종류는 null */
  map(id: string): Promise<BattleMapInput | null>;
}

export const ARENA_FLAT = "flat";
export const ARENA_TEST = "test";
/** 시험 자리 종류(@terra/planet MAP_PRESETS와 같은 차례) */
export const ARENA_PRESETS = ["river", "coast", "lake", "mountain", "forest", "grassland"] as const;
export type ArenaPreset = (typeof ARENA_PRESETS)[number];

const presetOf = (id: string): ArenaPreset | undefined =>
  ARENA_PRESETS.find((preset) => `preset_${preset}` === id);

export function createArenaTerrains(deps: {
  /** S1 시험 2차맵의 지형 층(지형 서비스가 없으면 S1 임시 지형) */
  readonly test: () => Promise<TerrainLayers>;
  /** 시험 자리 종류의 지형 층(지형 서비스가 있는 월드만, 자리가 없으면 null) */
  readonly preset?: ((preset: ArenaPreset) => Promise<TerrainLayers | null>) | undefined;
}): ArenaTerrains {
  const cache = new Map<string, Promise<BattleMapInput | null>>();
  const build = async (id: string): Promise<BattleMapInput | null> => {
    if (id === ARENA_FLAT) return flatArena();
    if (id === ARENA_TEST) return arenaMapFromLayers(await deps.test());
    const preset = presetOf(id);
    if (!preset || !deps.preset) return null;
    const layers = await deps.preset(preset);
    return layers ? arenaMapFromLayers(layers) : null;
  };
  return {
    list() {
      const list: LabTerrainView[] = [
        { id: ARENA_FLAT, kind: "flat", preset: null },
        { id: ARENA_TEST, kind: "test", preset: null },
      ];
      if (deps.preset)
        for (const preset of ARENA_PRESETS) list.push({ id: `preset_${preset}`, kind: "preset", preset });
      return list;
    },
    map(id) {
      let pending = cache.get(id);
      if (!pending) {
        pending = build(id);
        cache.set(id, pending);
        // 실패(지형 서비스 준비 전 등)는 기억하지 않는다: 다음 요청이 다시 만든다
        void pending.catch(() => cache.delete(id));
      }
      return pending;
    },
  };
}
