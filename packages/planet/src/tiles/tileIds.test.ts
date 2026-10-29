import { describe, expect, it } from "vitest";
import { cellKey, decodeCellKey } from "../cellKey.ts";
import { FACES } from "../faces.ts";
import { cellsPerSide } from "../levels.ts";
import {
  PLANET_TILE_CELLS,
  planetMapLevels,
  planetTileCount,
  planetTileIdFromKey,
  planetTileIds,
  planetTileKey,
} from "./tileIds.ts";

// 타일 나누기는 렌더러(받을 타일 고르기)와 서버(굽기)가 같이 쓰므로 개수·ID·덮는 곳을 전수로 본다.
describe("타일 나누기", () => {
  it("지구 크기(F = 9): 맵 레벨 5~9, 면당 341개, 모두 2,046개 (ADR 36)", () => {
    const ids = planetTileIds(9);
    expect(planetMapLevels(9)).toEqual([5, 6, 7, 8, 9]);
    expect(ids).toHaveLength(2046);
    expect(planetTileCount(9)).toBe(2046);
    for (const face of FACES) expect(ids.filter((id) => id.face === face)).toHaveLength(341);
    const perLevel = [5, 6, 7, 8, 9].map((level) => ids.filter((id) => id.mapLevel === level).length);
    expect(perLevel).toEqual([6, 24, 96, 384, 1536]);
    // 처음 화면용 맵 레벨 5~6은 30개 (ADR 36)
    expect((perLevel[0] ?? 0) + (perLevel[1] ?? 0)).toBe(30);
    expect(ids.every((id) => id.size === PLANET_TILE_CELLS)).toBe(true);
  });

  it("타일 ID = 쿼드트리 칸(레벨 = 맵 레벨 − 5)의 셀 키 (F = 9)", () => {
    expect(planetTileKey(5, 0, 0, 0)).toBe(cellKey(0, 0, 0, 0));
    expect(planetTileKey(9, 2, 64, 96)).toBe(cellKey(2, 4, 2, 3));
    expect(planetTileKey(7, 5, 96, 32)).toBe(cellKey(5, 2, 3, 1));
    for (const id of planetTileIds(9)) {
      const { face, level, i, j } = decodeCellKey(id.key);
      expect({ face, level, i, j }).toEqual({
        face: id.face,
        level: id.mapLevel - 5,
        i: id.i0 / 32,
        j: id.j0 / 32,
      });
    }
  });

  it("작은 행성: 면이 32칸보다 작은 맵 레벨은 면 전체 타일 하나, ID는 그 레벨의 (0, 0) 칸 키", () => {
    // F = 4: 맵 레벨 0~4, 모두 면 전체 → 30개
    expect(planetTileIds(4)).toHaveLength(30);
    expect(planetTileIds(4).map((id) => id.size)).toEqual(
      [0, 1, 2, 3, 4].flatMap((l) => Array(6).fill(2 ** l)),
    );
    // F = 6: 맵 레벨 2~4는 면 전체(4·8·16칸), 5는 면 전체(32칸, 키 레벨 0), 6은 면당 4개(키 레벨 1)
    const small = planetTileIds(6);
    expect(small).toHaveLength(6 * 4 + 6 * 4);
    expect(planetTileKey(3, 1, 0, 0)).toBe(cellKey(1, 3, 0, 0));
    expect(planetTileKey(5, 1, 0, 0)).toBe(cellKey(1, 0, 0, 0));
    expect(planetTileKey(6, 1, 32, 0)).toBe(cellKey(1, 1, 1, 0));
  });

  it("개수: 면 레벨 4~14 (큰 행성은 세기만, 10까지는 목록과 같다)", () => {
    const expected = new Map([
      [4, 30],
      [6, 48],
      [9, 2046],
      [10, 8184],
      [14, 6 * (4 ** 5 + 4 ** 6 + 4 ** 7 + 4 ** 8 + 4 ** 9)],
    ]);
    for (const [faceLevel, count] of expected) expect(planetTileCount(faceLevel)).toBe(count);
    for (let faceLevel = 4; faceLevel <= 10; faceLevel++) {
      expect(planetTileIds(faceLevel)).toHaveLength(planetTileCount(faceLevel));
    }
  });

  it("한 행성 안에서 ID가 겹치지 않고, 순서는 맵 레벨 오름차순 → 키 오름차순 (F = 4~10)", () => {
    for (let faceLevel = 4; faceLevel <= 10; faceLevel++) {
      const ids = planetTileIds(faceLevel);
      expect(new Set(ids.map((id) => id.key)).size).toBe(ids.length);
      for (let index = 1; index < ids.length; index++) {
        const a = ids[index - 1];
        const b = ids[index];
        if (!a || !b) throw new Error("missing tile id");
        expect(a.mapLevel < b.mapLevel || (a.mapLevel === b.mapLevel && a.key < b.key)).toBe(true);
      }
    }
  });

  it("ID → 덮는 곳이 되돌아오고, 이 행성의 타일이 아닌 키는 undefined", () => {
    for (let faceLevel = 4; faceLevel <= 9; faceLevel++) {
      for (const id of planetTileIds(faceLevel)) expect(planetTileIdFromKey(faceLevel, id.key)).toEqual(id);
    }
    // F = 9: 키 레벨 5(맵 레벨 10)는 없다. F = 10: 키 레벨 0(맵 레벨 5)은 없다
    expect(planetTileIdFromKey(9, cellKey(0, 5, 0, 0))).toBeUndefined();
    expect(planetTileIdFromKey(10, cellKey(0, 0, 0, 0))).toBeUndefined();
    expect(planetTileIdFromKey(10, cellKey(0, 1, 1, 1))).toMatchObject({ mapLevel: 6, i0: 32, j0: 32 });
    // F = 6: 면 전체 타일은 (0, 0) 칸 키만, 맵 레벨 1(< F − 4)은 없다
    expect(planetTileIdFromKey(6, cellKey(3, 2, 0, 0))).toMatchObject({ mapLevel: 2, size: 4 });
    expect(planetTileIdFromKey(6, cellKey(3, 2, 1, 0))).toBeUndefined();
    expect(planetTileIdFromKey(6, cellKey(3, 1, 0, 0))).toMatchObject({
      mapLevel: 6,
      i0: 0,
      j0: 0,
      size: 32,
    });
    expect(planetTileIdFromKey(6, cellKey(3, 3, 0, 0))).toMatchObject({ mapLevel: 3, size: 8 });
  });

  it("맵 레벨마다 타일이 면을 빈틈·겹침 없이 덮는다 (F = 6, 9)", () => {
    for (const faceLevel of [6, 9]) {
      for (const mapLevel of planetMapLevels(faceLevel)) {
        const n = cellsPerSide(mapLevel);
        const covered = new Uint8Array(6 * n * n);
        for (const id of planetTileIds(faceLevel).filter((t) => t.mapLevel === mapLevel)) {
          for (let j = id.j0; j < id.j0 + id.size; j++) {
            for (let i = id.i0; i < id.i0 + id.size; i++) {
              const at = id.face * n * n + j * n + i;
              covered[at] = (covered[at] ?? 0) + 1;
            }
          }
        }
        expect(covered.every((count) => count === 1)).toBe(true);
      }
    }
  });

  it("첫 칸이 타일 경계에 맞지 않으면 RangeError", () => {
    expect(() => planetTileKey(9, 0, 16, 0)).toThrow(RangeError);
    expect(() => planetTileKey(9, 0, 512, 0)).toThrow(RangeError);
    expect(() => planetTileKey(3, 0, 0, 4)).toThrow(RangeError);
  });
});
