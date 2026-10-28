// [임시] 2차맵 시험 화면용 가짜 건물·유닛 — 진짜는 서버가 보낸다(건물 배치 검사, 유닛 목록 + 경로). 서버가 생기면 지운다.
// 같은 시드면 같은 배치가 나온다. 좌표는 배치 칸(256×256).
import { type Rng, createRng } from "@terra/shared";
import {
  type BuildingFootprint,
  type QuarterTurns,
  footprintCells,
  footprintInside,
} from "../buildings/footprint.ts";
import type { UnitSpawn } from "../engineTypes.ts";
import {
  PLACEMENT_CELLS,
  PLACEMENT_PER_TERRAIN,
  SURFACE,
  TERRAIN_CELLS,
  type TerrainInput,
  sampleHeightM,
  placementCellM,
} from "../terrain/terrainData.ts";

export interface MockWorld {
  buildings: BuildingFootprint[];
  units: UnitSpawn[];
  /** 배치 칸마다 걸어갈 수 있으면 1(물·건물 아님) */
  walkable: Uint8Array;
  /** 유닛 id → 걷기 속도(배치 칸/초) */
  speeds: Map<number, number>;
}

export interface MockWorldOptions {
  units?: number;
  buildings?: number;
}

/** 파스텔 진영 색 5가지 */
const UNIT_COLORS = [0xff9aa2, 0x8fc8ff, 0xffcf75, 0xb7a6ff, 0x8fe0bd] as const;
const BUILDING_COLORS = [0xf6e7c8, 0xf9d2c4, 0xdbe8f4, 0xe4f2d6, 0xf3dfee] as const;
const QUARTER_TURNS: readonly QuarterTurns[] = [0, 1, 2, 3];

const unit01 = (rng: Rng): number => rng.nextU32() / 0x1_0000_0000;
const between = (rng: Rng, min: number, max: number): number => min + (max - min) * unit01(rng);
function pick<T>(rng: Rng, list: readonly T[]): T {
  const value = list[rng.nextInt(list.length)];
  if (value === undefined) throw new Error("empty list");
  return value;
}

export function createMockWorld(
  terrain: TerrainInput,
  seed: number,
  options: MockWorldOptions = {},
): MockWorld {
  const rng = createRng(seed);
  const cellM = placementCellM(terrain);
  const walkable = new Uint8Array(PLACEMENT_CELLS * PLACEMENT_CELLS);
  for (let py = 0; py < PLACEMENT_CELLS; py++) {
    for (let px = 0; px < PLACEMENT_CELLS; px++) {
      const tx = Math.floor(px / PLACEMENT_PER_TERRAIN);
      const ty = Math.floor(py / PLACEMENT_PER_TERRAIN);
      const code = terrain.surface[ty * TERRAIN_CELLS + tx];
      const ground = sampleHeightM(terrain, (px + 0.5) * cellM, (py + 0.5) * cellM);
      walkable[py * PLACEMENT_CELLS + px] =
        code !== SURFACE.water && ground > terrain.waterLevelM + 0.3 ? 1 : 0;
    }
  }

  // 건물: 걸어갈 수 있는 땅에, 서로 한 칸 띄워 놓는다
  const buildings: BuildingFootprint[] = [];
  const wantBuildings = options.buildings ?? 48;
  for (let attempt = 0; attempt < wantBuildings * 30 && buildings.length < wantBuildings; attempt++) {
    const footprint: BuildingFootprint = {
      id: buildings.length + 1,
      cellX: rng.nextInt(PLACEMENT_CELLS - 8) + 2,
      cellY: rng.nextInt(PLACEMENT_CELLS - 8) + 2,
      width: 2 + rng.nextInt(4),
      depth: 2 + rng.nextInt(3),
      rotation: pick(rng, QUARTER_TURNS),
      heightM: Math.round(between(rng, 4, 14)),
      color: pick(rng, BUILDING_COLORS),
    };
    if (!footprintInside(footprint, PLACEMENT_CELLS)) continue;
    const padded: BuildingFootprint = {
      ...footprint,
      cellX: footprint.cellX - 1,
      cellY: footprint.cellY - 1,
      width: footprint.width + 2,
      depth: footprint.depth + 2,
    };
    const cells = footprintCells(padded, PLACEMENT_CELLS);
    if (!cells.every((cell) => walkable[cell] === 1)) continue;
    for (const cell of footprintCells(footprint, PLACEMENT_CELLS)) walkable[cell] = 0;
    buildings.push(footprint);
  }

  // 유닛: 걸어갈 수 있는 칸 안 아무 곳. 대부분 사람 크기, 일부 작은 미니언·큰 유닛
  const open: number[] = [];
  walkable.forEach((value, cell) => {
    if (value === 1) open.push(cell);
  });
  const units: UnitSpawn[] = [];
  const speeds = new Map<number, number>();
  const wantUnits = options.units ?? 1000;
  for (let i = 0; i < wantUnits && open.length > 0; i++) {
    const cell = pick(rng, open);
    const kind = unit01(rng);
    const heightM =
      kind < 0.7 ? between(rng, 1.6, 2.0) : kind < 0.95 ? between(rng, 0.7, 1.2) : between(rng, 2.6, 3.0);
    const id = i + 1;
    units.push({
      id,
      look: { heightM, radiusM: Math.max(0.2, heightM * 0.17), color: pick(rng, UNIT_COLORS) },
      x: (cell % PLACEMENT_CELLS) + unit01(rng),
      y: Math.floor(cell / PLACEMENT_CELLS) + unit01(rng),
    });
    // 걷기 약 0.42칸/초 이상(D-120). 5%는 탈것 빠르기(약 4.7칸/초까지)
    speeds.set(id, unit01(rng) < 0.05 ? between(rng, 2.5, 4.7) : between(rng, 0.42, 0.9));
  }
  return { buildings, units, walkable, speeds };
}

/** 두 점 사이 직선이 걸어갈 수 있는 칸만 지나는지(반 칸 간격으로 본다) */
export function segmentWalkable(
  walkable: Uint8Array,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.floor(ax + (bx - ax) * t);
    const y = Math.floor(ay + (by - ay) * t);
    if (x < 0 || y < 0 || x >= PLACEMENT_CELLS || y >= PLACEMENT_CELLS) return false;
    if (walkable[y * PLACEMENT_CELLS + x] !== 1) return false;
  }
  return true;
}
