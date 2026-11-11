// 2차맵 원자재 오브젝트 자리 — docs/adr/2026-11-07-gather-objects.md 2절. 2차맵 지형(소품 그림 층·지표)에서 결정적으로 정한다(서버 권위):
// - 2차맵을 8×8 배치 칸 묶음(32×32 = 1,024개)으로 나누고 묶음마다 오브젝트를 많아야 하나 둔다(숲 칸 하나하나가 오브젝트면 2만 개가 넘는다).
// - 소품(prop) 종류: 묶음 안에서 그 종류의 그림 칸이 가장 많은 종류(같으면 팩 차례 앞), 자리 = 그 그림 칸 가운데 묶음 가운데에 가장 가까운 칸
//   (같으면 작은 칸 차례). 나무 칸은 이제 지나갈 수 있어(SIM_VERSION 19) 유닛이 바로 옆에 선다. 바위 칸은 막혀 있어 둘레에 선다.
// - 바위(rock) 종류: 소품 오브젝트가 없는 묶음 가운데 지형 칸의 1/4 이상이 바위 지표인 묶음에서, (2차맵 키, 묶음, 종류) 해시가 천분율
//   chancePm 안이면 바위 지형 칸 가운데 묶음 가운데에 가장 가까운 칸에 둔다.
// - 밭·목초지·물터(plot) 종류(docs/adr/2026-11-11-city-catchment.md): 소품·바위 오브젝트와 따로 16×16 배치 칸 묶음(256개)마다 많아야
//   하나. 묶음 안 지형 칸(8×8 = 64) 가운데 그 종류 지표가 minCells칸 이상이고, material이 있으면 그 2차맵 행성 값에 그 원자재 비트가 있어야
//   한다(materials가 없으면 — 행성 값 없는 임시 지형 — 원자재를 보지 않는다). 맞는 종류가 여럿이면 (2차맵 키, 묶음) 굴림으로 하나.
//   자리 = 그 지표 지형 칸 가운데 묶음 가운데에 가장 가까운 칸의 배치 칸(오른쪽 아래 — 홀수 좌표). 그 칸에 이미 오브젝트가 있으면 다음 가까운
//   칸. 소품·바위 오브젝트는 그대로다(번호·자리 — 앞 판 상태 줄이 그대로 맞는다).
// - 오브젝트 번호 = 그 자리 배치 칸 차례(y × 256 + x) — 같은 2차맵 지형이면 늘 같다(고정본 2차맵도 같은 지형이라 같다).
// [임시] 숨김 자원(ADR 46 5절 "서버 비밀 소금")은 쓰지 않는다: 광맥 자리는 지형 파일을 아는 기기가 계산할 수 있다(확인 대기, 질문 666).
// 정수 연산만 쓴다(판정 코드 규칙).
import { TERRAIN_SURFACE } from "@terra/protocol";
import { MATERIAL_BIT } from "@terra/shared/catchment";
import { PLACEMENT_SIZE, TERRAIN_SIZE, mix32 } from "@terra/sim";
import type { GatherKind } from "./kinds.ts";

/** 묶음 한 변(배치 칸) */
export const OBJECT_BLOCK_CELLS = 8;
const BLOCKS = PLACEMENT_SIZE / OBJECT_BLOCK_CELLS;
/** 배치 칸 하나 = 지형 칸 반 */
const PLACEMENT_PER_TERRAIN = PLACEMENT_SIZE / TERRAIN_SIZE;
/** 바위 묶음 문턱: 묶음 안 지형 칸(4×4 = 16) 가운데 바위가 이만큼 이상 */
const ROCK_MIN_TERRAIN_CELLS = 4;

/** 오브젝트 하나 */
export interface GatherObject {
  /** 번호 = y × 256 + x */
  readonly id: number;
  /** 종류 차례(kinds 배열) */
  readonly kind: number;
  readonly x: number;
  readonly y: number;
}

/** 자리를 정하는 지형 층 */
export interface ObjectLayers {
  readonly mapKey: number;
  /** 배치 칸 소품 그림 번호 256²(행성 값 2차맵만. 임시 지형은 없다) */
  readonly art?: Uint8Array | undefined;
  /** 지형 칸 지표 128² */
  readonly surface: Uint8Array;
  /** 그 2차맵(1차맵 칸) 행성 값의 원자재 비트(@terra/shared/catchment cellMaterials). 없으면 plot 종류의 원자재 조건을 보지 않는다 */
  readonly materials?: number | undefined;
}

/** 밭·목초지·물터 묶음 한 변(배치 칸) */
export const PLOT_BLOCK_CELLS = 16;

/** 묶음 가운데까지 거리 제곱(배치 칸 가운데 기준, 2배 좌표) */
function centerDistance(x: number, y: number, bx: number, by: number): number {
  const cx = bx * OBJECT_BLOCK_CELLS * 2 + OBJECT_BLOCK_CELLS;
  const cy = by * OBJECT_BLOCK_CELLS * 2 + OBJECT_BLOCK_CELLS;
  const dx = x * 2 + 1 - cx;
  const dy = y * 2 + 1 - cy;
  return dx * dx + dy * dy;
}

/** (2차맵 키, 묶음, 종류)의 천분율 굴림(0 ~ 999) */
export function blockRoll(mapKey: number, block: number, kind: number): number {
  const low = mapKey % 0x1_0000_0000;
  const high = Math.floor(mapKey / 0x1_0000_0000);
  const seed = mix32(mix32(low >>> 0) ^ Math.imul(high >>> 0, 0x85eb_ca6b) ^ 0x4f1b_bcdd);
  const value = mix32(seed ^ Math.imul(block + 1, 0x9e37_79b1) ^ Math.imul(kind + 1, 0xc2b2_ae35));
  return (value >>> 0) % 1000;
}

/** 소품 그림 번호 → 종류 차례(팩 차례로 앞의 종류가 맡는다) */
function artTable(kinds: readonly GatherKind[]): Int16Array {
  const table = new Int16Array(256).fill(-1);
  kinds.forEach((kind, index) => {
    if (kind.source !== "prop") return;
    for (const art of kind.arts) if (art > 0 && art < 256 && table[art] === -1) table[art] = index;
  });
  return table;
}

/** 한 묶음의 소품 오브젝트(없으면 undefined) */
function propObject(
  art: Uint8Array,
  table: Int16Array,
  kindCount: number,
  bx: number,
  by: number,
): GatherObject | undefined {
  const counts = new Int32Array(kindCount);
  const best = new Int32Array(kindCount).fill(-1);
  const bestDistance = new Int32Array(kindCount);
  for (let dy = 0; dy < OBJECT_BLOCK_CELLS; dy++) {
    const y = by * OBJECT_BLOCK_CELLS + dy;
    for (let dx = 0; dx < OBJECT_BLOCK_CELLS; dx++) {
      const x = bx * OBJECT_BLOCK_CELLS + dx;
      const cell = y * PLACEMENT_SIZE + x;
      const kind = table[art[cell] ?? 0] ?? -1;
      if (kind < 0) continue;
      counts[kind] = (counts[kind] ?? 0) + 1;
      const distance = centerDistance(x, y, bx, by);
      if ((best[kind] ?? -1) < 0 || distance < (bestDistance[kind] ?? 0)) {
        best[kind] = cell;
        bestDistance[kind] = distance;
      }
    }
  }
  let pick = -1;
  for (let kind = 0; kind < kindCount; kind++)
    if ((counts[kind] ?? 0) > 0 && (pick < 0 || (counts[kind] ?? 0) > (counts[pick] ?? 0))) pick = kind;
  if (pick < 0) return undefined;
  const cell = best[pick] ?? 0;
  return { id: cell, kind: pick, x: cell % PLACEMENT_SIZE, y: Math.floor(cell / PLACEMENT_SIZE) };
}

/** 한 묶음의 바위 오브젝트(없으면 undefined) */
function rockObject(
  layers: ObjectLayers,
  kinds: readonly GatherKind[],
  bx: number,
  by: number,
): GatherObject | undefined {
  const span = OBJECT_BLOCK_CELLS / PLACEMENT_PER_TERRAIN;
  let rocks = 0;
  let bestCell = -1;
  let bestDistance = 0;
  for (let ty = by * span; ty < (by + 1) * span; ty++)
    for (let tx = bx * span; tx < (bx + 1) * span; tx++) {
      if (layers.surface[ty * TERRAIN_SIZE + tx] !== TERRAIN_SURFACE.rock) continue;
      rocks += 1;
      const x = tx * PLACEMENT_PER_TERRAIN;
      const y = ty * PLACEMENT_PER_TERRAIN;
      const distance = centerDistance(x, y, bx, by);
      if (bestCell < 0 || distance < bestDistance) {
        bestCell = y * PLACEMENT_SIZE + x;
        bestDistance = distance;
      }
    }
  if (rocks < ROCK_MIN_TERRAIN_CELLS || bestCell < 0) return undefined;
  const block = by * BLOCKS + bx;
  for (let kind = 0; kind < kinds.length; kind++) {
    const entry = kinds[kind];
    if (entry?.source !== "rock") continue;
    if (blockRoll(layers.mapKey, block, kind) < entry.chancePm)
      return {
        id: bestCell,
        kind,
        x: bestCell % PLACEMENT_SIZE,
        y: Math.floor(bestCell / PLACEMENT_SIZE),
      };
  }
  return undefined;
}

/** 밭·목초지·물터: 묶음마다 맞는 종류 하나와 자리(머리 주석). taken = 이미 놓인 오브젝트 번호 */
function plotObjects(
  layers: ObjectLayers,
  kinds: readonly GatherKind[],
  materialBits: number | undefined,
  taken: ReadonlySet<number>,
): GatherObject[] {
  const plotKinds: number[] = [];
  kinds.forEach((kind, index) => {
    if (kind.source !== "plot" || kind.surfaces.length === 0) return;
    if (
      kind.material !== null &&
      materialBits !== undefined &&
      (materialBits & MATERIAL_BIT[kind.material]) === 0
    )
      return;
    plotKinds.push(index);
  });
  if (plotKinds.length === 0) return [];
  const span = PLOT_BLOCK_CELLS / PLACEMENT_PER_TERRAIN;
  const blocks = PLACEMENT_SIZE / PLOT_BLOCK_CELLS;
  const half = PLOT_BLOCK_CELLS;
  const out: GatherObject[] = [];
  for (let by = 0; by < blocks; by++)
    for (let bx = 0; bx < blocks; bx++) {
      const eligible = plotKinds.filter((index) => {
        const kind = kinds[index];
        if (!kind) return false;
        let count = 0;
        for (let ty = by * span; ty < (by + 1) * span; ty++)
          for (let tx = bx * span; tx < (bx + 1) * span; tx++)
            if (kind.surfaces.includes(layers.surface[ty * TERRAIN_SIZE + tx] ?? -1)) count += 1;
        return count >= kind.minCells;
      });
      if (eligible.length === 0) continue;
      const block = by * blocks + bx;
      const pick = eligible[blockRoll(layers.mapKey, block + PLOT_SALT, 0) % eligible.length] ?? -1;
      const kind = kinds[pick];
      if (!kind) continue;
      // 그 지표 지형 칸들(묶음 가운데에 가까운 차례, 같으면 작은 칸)
      const cx = bx * PLOT_BLOCK_CELLS * 2 + half;
      const cy = by * PLOT_BLOCK_CELLS * 2 + half;
      const cells: { cell: number; distance: number }[] = [];
      for (let ty = by * span; ty < (by + 1) * span; ty++)
        for (let tx = bx * span; tx < (bx + 1) * span; tx++) {
          if (!kind.surfaces.includes(layers.surface[ty * TERRAIN_SIZE + tx] ?? -1)) continue;
          const x = tx * PLACEMENT_PER_TERRAIN + 1;
          const y = ty * PLACEMENT_PER_TERRAIN + 1;
          const dx = x * 2 + 1 - cx;
          const dy = y * 2 + 1 - cy;
          cells.push({ cell: y * PLACEMENT_SIZE + x, distance: dx * dx + dy * dy });
        }
      cells.sort((a, b) => a.distance - b.distance || a.cell - b.cell);
      const spot = cells.find((entry) => !taken.has(entry.cell));
      if (!spot) continue;
      out.push({
        id: spot.cell,
        kind: pick,
        x: spot.cell % PLACEMENT_SIZE,
        y: Math.floor(spot.cell / PLACEMENT_SIZE),
      });
    }
  return out;
}

/** plot 굴림 소금(소품·바위 묶음 번호와 겹치지 않게) */
const PLOT_SALT = 0x1_0000;

/** 그 2차맵의 오브젝트(번호 차례 = 위에서 아래·왼쪽에서 오른쪽 묶음 차례, 밭·목초지·물터는 그 뒤에 묶음 차례) */
export function placeGatherObjects(layers: ObjectLayers, kinds: readonly GatherKind[]): GatherObject[] {
  if (layers.surface.length !== TERRAIN_SIZE * TERRAIN_SIZE)
    throw new RangeError("surface does not match the terrain size");
  const art = layers.art && layers.art.length === PLACEMENT_SIZE * PLACEMENT_SIZE ? layers.art : undefined;
  const table = artTable(kinds);
  const out: GatherObject[] = [];
  for (let by = 0; by < BLOCKS; by++)
    for (let bx = 0; bx < BLOCKS; bx++) {
      const object =
        (art ? propObject(art, table, kinds.length, bx, by) : undefined) ?? rockObject(layers, kinds, bx, by);
      if (object) out.push(object);
    }
  const taken = new Set(out.map((object) => object.id));
  out.push(...plotObjects(layers, kinds, layers.materials, taken));
  return out;
}
