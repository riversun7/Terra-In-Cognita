// 1차맵 타일 1칸 테두리 앞치마(apron) — 32×32 칸 텍스처를 34×34(cells + 2)로 감싸 이웃 타일 가장자리 칸을 복사한다.
// 셰이더가 이웃 칸(바이옴 도메인 워프·해안선·연속 하천·기후 보간)을 읽을 때 타일 경계에서 클램프되어 생기는 직선 끊김을 없앤다.
// - 같은 면 8방향 이웃과 정육면체 면 경계(wrapFaceIJ) 이웃을 양방향으로 즉시 잇고, 아직 같은 레벨 이웃이 없으면(LOD 경계)
//   한 단계 거친 타일(mapLevel − 1)의 맞닿은 칸을 업샘플해 빈 변을 채운다.
// - 상하좌우 4면이 모두 물(그중 2면 이상이 하천)로 완전히 둘러싸인 망상 하천 내부의 마른 칸에는 cellExtra 하천 채널의
//   최상위 비트(CHECKERBOARD_RIVER_BIT = 0x80)를 표시해 셰이더가 구멍 없는 자연스러운 넓은 강줄기로 그릴 수 있게 한다.
import { WATER_LAKE, WATER_OCEAN, WATER_RIVER, cellsPerSide, wrapFaceIJ } from "@terra/planet";
import type { Texture } from "three";
import { type TileNode, tileCellsPerSide, tileKey, tilesPerSide } from "./tileTree.ts";

/** 망상(체커보드) 하천 내부 구멍 메움 표시 비트(cellExtra 바이트 1의 최상위 비트, 원래 하천 등급 0..3과 겹치지 않음) */
export const CHECKERBOARD_RIVER_BIT = 0x80;
const RAW_RIVER_MASK = 0x7f;

/** cells × cells 칸 배열을 (cells + 2) × (cells + 2) 앞치마 배열로 감싼다(처음 테두리는 가장자리 클램프) */
export function padCellTexture(src: Uint8Array, cells: number, channels: 2 | 4): Uint8Array {
  const stride = cells + 2;
  const out = new Uint8Array(stride * stride * channels);
  const copyPixel = (sx: number, sy: number, dx: number, dy: number): void => {
    const si = (sy * cells + sx) * channels;
    const di = (dy * stride + dx) * channels;
    for (let c = 0; c < channels; c++) out[di + c] = src[si + c] ?? 0;
  };
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) copyPixel(x, y, x + 1, y + 1);
    // 좌·우 변 클램프
    copyPixel(0, y, 0, y + 1);
    copyPixel(cells - 1, y, cells + 1, y + 1);
  }
  // 아래·위 변과 네 모서리 클램프
  for (let x = 0; x < cells; x++) {
    copyPixel(x, 0, x + 1, 0);
    copyPixel(x, cells - 1, x + 1, cells + 1);
  }
  copyPixel(0, 0, 0, 0);
  copyPixel(cells - 1, 0, cells + 1, 0);
  copyPixel(0, cells - 1, 0, cells + 1);
  copyPixel(cells - 1, cells - 1, cells + 1, cells + 1);
  return out;
}

/** 패딩 배열끼리 단일 픽셀(4·2채널)을 복사한다 */
function copyPaddedPixel(
  target: StitchedTileRecord,
  tx: number,
  ty: number,
  source: StitchedTileRecord,
  sx: number,
  sy: number,
): void {
  const tStride = target.cells + 2;
  const sStride = source.cells + 2;
  const ti4 = (ty * tStride + tx) * 4;
  const si4 = (sy * sStride + sx) * 4;
  target.cellData[ti4] = source.cellData[si4] ?? 0;
  target.cellData[ti4 + 1] = source.cellData[si4 + 1] ?? 0;
  target.cellData[ti4 + 2] = source.cellData[si4 + 2] ?? 0;
  target.cellData[ti4 + 3] = source.cellData[si4 + 3] ?? 0;
  const ti2 = (ty * tStride + tx) * 2;
  const si2 = (sy * sStride + sx) * 2;
  target.cellExtra[ti2] = source.cellExtra[si2] ?? 0;
  target.cellExtra[ti2 + 1] = source.cellExtra[si2 + 1] ?? 0;
}

/**
 * 같은 레벨 이웃 타일(오프셋 dx, dy ∈ {-1, 0, 1})의 맞닿은 안쪽 칸을 대상 타일의 앞치마 테두리에 복사한다.
 * target·source는 모두 (cells + 2) × (cells + 2) 패딩 배열이다.
 */
export function copyNeighborBorder(
  target: Uint8Array,
  source: Uint8Array,
  cells: number,
  channels: 2 | 4,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
): void {
  if (dx === 0 && dy === 0) return;
  const stride = cells + 2;
  const copy = (sx: number, sy: number, tx: number, ty: number): void => {
    const si = (sy * stride + sx) * channels;
    const ti = (ty * stride + tx) * channels;
    for (let c = 0; c < channels; c++) target[ti + c] = source[si + c] ?? 0;
  };
  if (dx !== 0 && dy !== 0) {
    // 대각 모서리 1칸
    const sx = dx < 0 ? cells : 1;
    const sy = dy < 0 ? cells : 1;
    const tx = dx < 0 ? 0 : cells + 1;
    const ty = dy < 0 ? 0 : cells + 1;
    copy(sx, sy, tx, ty);
    return;
  }
  if (dx !== 0) {
    // 좌(-1)·우(+1) 세로 변
    const sx = dx < 0 ? cells : 1;
    const tx = dx < 0 ? 0 : cells + 1;
    for (let y = 1; y <= cells; y++) copy(sx, y, tx, y);
    return;
  }
  // 아래(-1)·위(+1) 가로 변
  const sy = dy < 0 ? cells : 1;
  const ty = dy < 0 ? 0 : cells + 1;
  for (let x = 1; x <= cells; x++) copy(x, sy, x, ty);
}

/** 원본(0x80 제외) 기준으로 패딩 좌표 (x, y)가 바다·호수·하천인지 판별한다 */
function rawWetFlags(record: StitchedTileRecord, x: number, y: number): { wet: boolean; river: boolean } {
  const stride = record.cells + 2;
  const idx = y * stride + x;
  const water = record.cellData[idx * 4 + 1] ?? 0;
  const rawRiver = (record.cellExtra[idx * 2 + 1] ?? 0) & RAW_RIVER_MASK;
  const body = (water & (WATER_OCEAN | WATER_LAKE)) !== 0;
  const river = !body && (rawRiver > 0 || (water & WATER_RIVER) !== 0);
  return { wet: body || river, river };
}

/**
 * 타일 안쪽 칸(1..cells)을 훑어 상하좌우 4방향이 모두 물(그중 2방향 이상이 하천)로 둘러싸인 마른 칸에
 * CHECKERBOARD_RIVER_BIT(0x80)를 표시한다. 원본 값만 보므로 타일 로딩 순서와 무관하게 항상 같은 결과를 낸다.
 */
export function markCheckerboardRivers(record: StitchedTileRecord): void {
  const cells = record.cells;
  const stride = cells + 2;
  for (let y = 1; y <= cells; y++) {
    for (let x = 1; x <= cells; x++) {
      const idx2 = (y * stride + x) * 2 + 1;
      const rawRiver = (record.cellExtra[idx2] ?? 0) & RAW_RIVER_MASK;
      const self = rawWetFlags(record, x, y);
      if (self.wet) {
        record.cellExtra[idx2] = rawRiver;
        continue;
      }
      const n = rawWetFlags(record, x, y + 1);
      const s = rawWetFlags(record, x, y - 1);
      const e = rawWetFlags(record, x + 1, y);
      const w = rawWetFlags(record, x - 1, y);
      const wetCount = (n.wet ? 1 : 0) + (s.wet ? 1 : 0) + (e.wet ? 1 : 0) + (w.wet ? 1 : 0);
      const rivCount = (n.river ? 1 : 0) + (s.river ? 1 : 0) + (e.river ? 1 : 0) + (w.river ? 1 : 0);
      record.cellExtra[idx2] = wetCount === 4 && rivCount >= 2 ? rawRiver | CHECKERBOARD_RIVER_BIT : rawRiver;
    }
  }
}

export interface StitchedTileRecord {
  readonly node: TileNode;
  readonly cells: number;
  readonly cellData: Uint8Array;
  readonly cellExtra: Uint8Array;
  readonly cellTexture: Texture;
  readonly extraTexture: Texture;
}

type Step = -1 | 0 | 1;

const negStep = (d: Step): Step => (d === -1 ? 1 : d === 1 ? -1 : 0);

const OFFSETS: readonly (readonly [Step, Step])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/**
 * 올라온 타일들의 1칸 앞치마를 이웃 타일과 양방향으로 맞춘다.
 * 새 타일이 올라오면 이미 올라온 같은 면·다른 면(면 경계) 이웃과 서로 변·모서리를 복사하고,
 * 망상 하천 내부 메움 비트(0x80)까지 갱신해 이웃 앞치마에 다시 동기화한다.
 */
export class TileApronStitcher {
  private readonly tiles = new Map<number, StitchedTileRecord>();

  add(record: StitchedTileRecord): void {
    const key = tileKey(record.node);
    this.tiles.set(key, record);
    const affected = new Set<StitchedTileRecord>([record]);

    // 1단계: 원본 칸 경계 복사(양방향)
    this.syncBorders(record, affected);

    // 2단계: 앞치마가 채워진 타일들의 망상 하천 내부 메움 비트(0x80) 계산
    for (const tile of affected) markCheckerboardRivers(tile);

    // 3단계: 갱신된 0x80 비트가 이웃 타일 앞치마에도 똑같이 보이도록 가장자리 재동기화
    const finalUpdated = new Set<StitchedTileRecord>(affected);
    for (const tile of affected) this.syncBorders(tile, finalUpdated);

    for (const tile of finalUpdated) {
      tile.cellTexture.needsUpdate = true;
      tile.extraTexture.needsUpdate = true;
    }
  }

  remove(node: TileNode): void {
    this.tiles.delete(tileKey(node));
  }

  clear(): void {
    this.tiles.clear();
  }

  /** record와 맞닿은 같은 면·면 경계 이웃의 1칸 앞치마를 양방향 복사하고, 바뀐 이웃을 touched에 모은다 */
  private syncBorders(record: StitchedTileRecord, touched: Set<StitchedTileRecord>): void {
    const { face, mapLevel, tx, ty } = record.node;
    const side = tilesPerSide(mapLevel);
    const standardCells = record.cells === tileCellsPerSide(mapLevel);
    const crossFaceTouched = new Set<StitchedTileRecord>();

    for (const [dx, dy] of OFFSETS) {
      const ntx = tx + dx;
      const nty = ty + dy;
      if (ntx >= 0 && nty >= 0 && ntx < side && nty < side) {
        const neighbor = this.tiles.get(tileKey({ face, mapLevel, tx: ntx, ty: nty }));
        if (neighbor && neighbor.cells === record.cells) {
          copyNeighborBorder(record.cellData, neighbor.cellData, record.cells, 4, dx, dy);
          copyNeighborBorder(record.cellExtra, neighbor.cellExtra, record.cells, 2, dx, dy);
          const oppX = negStep(dx);
          const oppY = negStep(dy);
          copyNeighborBorder(neighbor.cellData, record.cellData, neighbor.cells, 4, oppX, oppY);
          copyNeighborBorder(neighbor.cellExtra, record.cellExtra, neighbor.cells, 2, oppX, oppY);
          touched.add(neighbor);
        } else if (side > 1) {
          this.fillFromCoarserSameFace(record, dx, dy);
        }
      } else if (standardCells) {
        this.fillCrossFaceBorder(record, dx, dy, crossFaceTouched);
      }
    }

    for (const neighbor of crossFaceTouched) {
      const nSide = tilesPerSide(neighbor.node.mapLevel);
      for (const [dx, dy] of OFFSETS) {
        const ntx = neighbor.node.tx + dx;
        const nty = neighbor.node.ty + dy;
        if (ntx < 0 || nty < 0 || ntx >= nSide || nty >= nSide) {
          this.fillCrossFaceBorder(neighbor, dx, dy, null);
        }
      }
      touched.add(neighbor);
    }
  }

  /** 같은 면에서 같은 레벨 이웃이 없을 때(LOD 경계) 한 단계 거친 타일(mapLevel − 1)의 맞닿은 칸으로 앞치마를 채운다 */
  private fillFromCoarserSameFace(record: StitchedTileRecord, dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
    const { face, mapLevel, tx, ty } = record.node;
    if (mapLevel <= 0) return;
    const cells = record.cells;
    const coarseLevel = mapLevel - 1;
    const baseGx = tx * cells;
    const baseGy = ty * cells;

    const sampleCoarse = (gx: number, gy: number, ax: number, ay: number): void => {
      const cx = gx >> 1;
      const cy = gy >> 1;
      const ctx = Math.floor(cx / cells);
      const cty = Math.floor(cy / cells);
      const coarse = this.tiles.get(tileKey({ face, mapLevel: coarseLevel, tx: ctx, ty: cty }));
      if (!coarse || coarse.cells !== cells) return;
      const sx = cx - ctx * cells + 1;
      const sy = cy - cty * cells + 1;
      copyPaddedPixel(record, ax, ay, coarse, sx, sy);
    };

    if (dx !== 0 && dy !== 0) {
      const gx = dx < 0 ? baseGx - 1 : baseGx + cells;
      const gy = dy < 0 ? baseGy - 1 : baseGy + cells;
      sampleCoarse(gx, gy, dx < 0 ? 0 : cells + 1, dy < 0 ? 0 : cells + 1);
      return;
    }
    if (dx !== 0) {
      const gx = dx < 0 ? baseGx - 1 : baseGx + cells;
      const ax = dx < 0 ? 0 : cells + 1;
      for (let y = 0; y < cells; y++) sampleCoarse(gx, baseGy + y, ax, y + 1);
      return;
    }
    const gy = dy < 0 ? baseGy - 1 : baseGy + cells;
    const ay = dy < 0 ? 0 : cells + 1;
    for (let x = 0; x < cells; x++) sampleCoarse(baseGx + x, gy, x + 1, ay);
  }

  /** 정육면체 면 경계 너머 한 변·모서리 앞치마를 wrapFaceIJ로 찾아 채운다 */
  private fillCrossFaceBorder(
    record: StitchedTileRecord,
    dx: -1 | 0 | 1,
    dy: -1 | 0 | 1,
    touched: Set<StitchedTileRecord> | null,
  ): void {
    const { face, mapLevel, tx, ty } = record.node;
    const cells = record.cells;
    const faceN = cellsPerSide(mapLevel);
    const baseI = tx * cells;
    const baseJ = ty * cells;

    const sampleWrapped = (gx: number, gy: number, ax: number, ay: number): void => {
      if (gx >= 0 && gx < faceN && gy >= 0 && gy < faceN) return;
      const wrapped = wrapFaceIJ(face, mapLevel, gx, gy);
      if (!wrapped) return;
      const ntx = Math.floor(wrapped.i / cells);
      const nty = Math.floor(wrapped.j / cells);
      const neighbor = this.tiles.get(tileKey({ face: wrapped.face, mapLevel, tx: ntx, ty: nty }));
      if (neighbor && neighbor.cells === cells) {
        copyPaddedPixel(record, ax, ay, neighbor, wrapped.i - ntx * cells + 1, wrapped.j - nty * cells + 1);
        touched?.add(neighbor);
        return;
      }
      if (mapLevel <= 0) return;
      const cLevel = mapLevel - 1;
      const cCells = tileCellsPerSide(cLevel);
      const ci = wrapped.i >> 1;
      const cj = wrapped.j >> 1;
      const ctx = Math.floor(ci / cCells);
      const cty = Math.floor(cj / cCells);
      const coarse = this.tiles.get(tileKey({ face: wrapped.face, mapLevel: cLevel, tx: ctx, ty: cty }));
      if (coarse && coarse.cells === cCells) {
        copyPaddedPixel(record, ax, ay, coarse, ci - ctx * cCells + 1, cj - cty * cCells + 1);
      }
    };

    if (dx !== 0 && dy !== 0) {
      const gx = dx < 0 ? baseI - 1 : baseI + cells;
      const gy = dy < 0 ? baseJ - 1 : baseJ + cells;
      sampleWrapped(gx, gy, dx < 0 ? 0 : cells + 1, dy < 0 ? 0 : cells + 1);
      return;
    }
    if (dx !== 0) {
      const gx = dx < 0 ? baseI - 1 : baseI + cells;
      const ax = dx < 0 ? 0 : cells + 1;
      for (let y = 0; y < cells; y++) sampleWrapped(gx, baseJ + y, ax, y + 1);
      return;
    }
    const gy = dy < 0 ? baseJ - 1 : baseJ + cells;
    const ay = dy < 0 ? 0 : cells + 1;
    for (let x = 0; x < cells; x++) sampleWrapped(baseI + x, gy, x + 1, ay);
  }
}
