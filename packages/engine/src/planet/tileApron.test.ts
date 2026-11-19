import { DataTexture } from "three";
import { describe, expect, it } from "vitest";
import {
  CHECKERBOARD_RIVER_BIT,
  TileApronStitcher,
  copyNeighborBorder,
  markCheckerboardRivers,
  padCellTexture,
} from "./tileApron.ts";

function makeTileData(cells: number, value: number): Uint8Array {
  const arr = new Uint8Array(cells * cells * 4);
  for (let i = 0; i < cells * cells; i++) {
    arr[i * 4] = value;
    arr[i * 4 + 1] = i % 255;
  }
  return arr;
}

describe("1차맵 타일 1칸 테두리 앞치마(tileApron)", () => {
  it("padCellTexture: 안쪽은 그대로 복사하고 바깥 1칸 테두리는 가장자리로 채운다", () => {
    const src = new Uint8Array([10, 1, 20, 2, 30, 3, 40, 4]);
    const padded = padCellTexture(src, 2, 2);
    expect(padded.length).toBe(4 * 4 * 2);
    // 안쪽 (1,1) = src(0,0) = 10, (2,2) = src(1,1) = 40
    expect(padded[(1 * 4 + 1) * 2]).toBe(10);
    expect(padded[(2 * 4 + 2) * 2]).toBe(40);
    // 모서리 (0,0) = 10, (3,3) = 40
    expect(padded[0]).toBe(10);
    expect(padded[(3 * 4 + 3) * 2]).toBe(40);
  });

  it("copyNeighborBorder: 좌·우·상·하 변과 대각 모서리를 정확히 복사한다", () => {
    const a = padCellTexture(makeTileData(4, 11), 4, 4);
    const b = padCellTexture(makeTileData(4, 22), 4, 4);
    // b는 a의 오른쪽(+1, 0) 이웃: a의 x=5 열에 b의 x=1 열이 들어간다
    copyNeighborBorder(a, b, 4, 4, 1, 0);
    for (let y = 1; y <= 4; y++) {
      expect(a[(y * 6 + 5) * 4]).toBe(22);
    }
    // 대각 (+1, +1) 모서리: a의 (5,5)에 b의 (1,1)
    copyNeighborBorder(a, b, 4, 4, 1, 1);
    expect(a[(5 * 6 + 5) * 4]).toBe(22);
  });

  it("TileApronStitcher: 이웃 타일이 나중에 올라와도 양쪽 앞치마가 모두 갱신된다", () => {
    const stitcher = new TileApronStitcher();
    const leftData = padCellTexture(makeTileData(4, 10), 4, 4);
    const leftExtra = padCellTexture(new Uint8Array(4 * 4 * 2).fill(1), 4, 2);
    const rightData = padCellTexture(makeTileData(4, 99), 4, 4);
    const rightExtra = padCellTexture(new Uint8Array(4 * 4 * 2).fill(7), 4, 2);
    const leftTex = new DataTexture(leftData, 6, 6);
    const leftExTex = new DataTexture(leftExtra, 6, 6);
    const rightTex = new DataTexture(rightData, 6, 6);
    const rightExTex = new DataTexture(rightExtra, 6, 6);

    stitcher.add({
      node: { face: 0, mapLevel: 6, tx: 0, ty: 0 },
      cells: 4,
      cellData: leftData,
      cellExtra: leftExtra,
      cellTexture: leftTex,
      extraTexture: leftExTex,
    });
    // 처음엔 오른쪽 앞치마가 자기 값(10)
    expect(leftData[(1 * 6 + 5) * 4]).toBe(10);

    stitcher.add({
      node: { face: 0, mapLevel: 6, tx: 1, ty: 0 },
      cells: 4,
      cellData: rightData,
      cellExtra: rightExtra,
      cellTexture: rightTex,
      extraTexture: rightExTex,
    });
    // 오른쪽 타일이 올라오면 양쪽 모두 이웃 값으로 이어진다
    expect(leftData[(1 * 6 + 5) * 4]).toBe(99);
    expect(leftExtra[(1 * 6 + 5) * 2]).toBe(7);
    expect(rightData[(1 * 6 + 0) * 4]).toBe(10);
    expect(rightExtra[(1 * 6 + 0) * 2]).toBe(1);
  });

  it("TileApronStitcher: 정육면체 면 경계(face 0 ↔ face 1) 이웃도 wrapFaceIJ로 양방향 연결한다", () => {
    const stitcher = new TileApronStitcher();
    // mapLevel 2는 면 하나가 4×4 타일 하나(tileCellsPerSide(2) = 4, cellsPerSide(2) = 4)
    const f0Data = padCellTexture(makeTileData(4, 33), 4, 4);
    const f0Extra = padCellTexture(new Uint8Array(4 * 4 * 2).fill(2), 4, 2);
    const f1Data = padCellTexture(makeTileData(4, 77), 4, 4);
    const f1Extra = padCellTexture(new Uint8Array(4 * 4 * 2).fill(5), 4, 2);
    stitcher.add({
      node: { face: 0, mapLevel: 2, tx: 0, ty: 0 },
      cells: 4,
      cellData: f0Data,
      cellExtra: f0Extra,
      cellTexture: new DataTexture(f0Data, 6, 6),
      extraTexture: new DataTexture(f0Extra, 6, 6),
    });
    stitcher.add({
      node: { face: 1, mapLevel: 2, tx: 0, ty: 0 },
      cells: 4,
      cellData: f1Data,
      cellExtra: f1Extra,
      cellTexture: new DataTexture(f1Data, 6, 6),
      extraTexture: new DataTexture(f1Extra, 6, 6),
    });
    // face 0의 iPlus(오른쪽 변, x=5)는 face 1의 iMinus(왼쪽 변, x=1)와 맞닿는다(FACE_EDGE_LINKS[0].iPlus)
    for (let y = 1; y <= 4; y++) {
      expect(f0Data[(y * 6 + 5) * 4]).toBe(77);
      expect(f0Extra[(y * 6 + 5) * 2]).toBe(5);
      expect(f1Data[(y * 6 + 0) * 4]).toBe(33);
      expect(f1Extra[(y * 6 + 0) * 2]).toBe(2);
    }
  });

  it("TileApronStitcher: 같은 레벨 이웃이 없을 때 한 단계 거친 타일(LOD 경계)에서 앞치마를 채운다", () => {
    const stitcher = new TileApronStitcher();
    const coarseData = padCellTexture(makeTileData(4, 55), 4, 4);
    const coarseExtra = padCellTexture(new Uint8Array(4 * 4 * 2).fill(3), 4, 2);
    const fineData = padCellTexture(makeTileData(4, 12), 4, 4);
    const fineExtra = padCellTexture(new Uint8Array(4 * 4 * 2).fill(1), 4, 2);
    // mapLevel 5(1타일)와 mapLevel 6(2×2타일)의 (0,0) 자식 — (1,0) 이웃이 아직 없을 때 coarse(0,0)로 오른쪽 변을 채운다
    stitcher.add({
      node: { face: 0, mapLevel: 5, tx: 0, ty: 0 },
      cells: 4,
      cellData: coarseData,
      cellExtra: coarseExtra,
      cellTexture: new DataTexture(coarseData, 6, 6),
      extraTexture: new DataTexture(coarseExtra, 6, 6),
    });
    stitcher.add({
      node: { face: 0, mapLevel: 6, tx: 0, ty: 0 },
      cells: 4,
      cellData: fineData,
      cellExtra: fineExtra,
      cellTexture: new DataTexture(fineData, 6, 6),
      extraTexture: new DataTexture(fineExtra, 6, 6),
    });
    expect(fineData[(1 * 6 + 5) * 4]).toBe(55);
    expect(fineExtra[(1 * 6 + 5) * 2]).toBe(3);
  });

  it("markCheckerboardRivers: 상하좌우 4면이 하천으로 둘러싸인 칸만 0x80을 표시하고 3면 굽이는 건드리지 않는다", () => {
    const cells = 4;
    const rawData = new Uint8Array(cells * cells * 4);
    const rawExtra = new Uint8Array(cells * cells * 2);
    const setRiver = (x: number, y: number): void => {
      rawExtra[(y * cells + x) * 2 + 1] = 1;
    };
    // (1,1)을 상하좌우 4면 하천으로 둘러싼다: (1,2), (1,0), (0,1), (2,1)
    setRiver(1, 2);
    setRiver(1, 0);
    setRiver(0, 1);
    setRiver(2, 1);
    // (3,1)은 3면만 하천(굽이): (2,1), (3,2), (3,0) — 오른쪽(x=4 클램프=마른 칸)은 마른 땅
    setRiver(3, 2);
    setRiver(3, 0);
    const paddedData = padCellTexture(rawData, cells, 4);
    const paddedExtra = padCellTexture(rawExtra, cells, 2);
    const record = {
      node: { face: 0 as const, mapLevel: 5, tx: 0, ty: 0 },
      cells,
      cellData: paddedData,
      cellExtra: paddedExtra,
      cellTexture: new DataTexture(paddedData, cells + 2, cells + 2),
      extraTexture: new DataTexture(paddedExtra, cells + 2, cells + 2),
    };
    markCheckerboardRivers(record);
    const stride = cells + 2;
    // (1,1) → 패딩 (2,2)는 4면이 하천이므로 CHECKERBOARD_RIVER_BIT가 켜진다
    expect(paddedExtra[(2 * stride + 2) * 2 + 1]).toBe(CHECKERBOARD_RIVER_BIT);
    // (3,1) → 패딩 (4,2)는 3면만 하천이므로 비트가 켜지지 않는다
    expect(paddedExtra[(2 * stride + 4) * 2 + 1]).toBe(0);
  });
});
