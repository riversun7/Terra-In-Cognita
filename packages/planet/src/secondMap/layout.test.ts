import { describe, expect, it } from "vitest";
import { cellKey } from "../cellKey.ts";
import { FACES, type Face } from "../faces.ts";
import { faceUVToXYZ, stToUV } from "../projection.ts";
import { cubePoint, floorDiv, mapCoords, neighbourhood, vertexI, vertexJ } from "./layout.ts";

/** 면 칸 좌표 → 구 위 방향(투영) */
function direction(face: Face, level: number, I: number, J: number): number[] {
  const N = 2 ** level;
  const p = faceUVToXYZ(face, stToUV(I / N), stToUV(J / N));
  const l = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  return [p[0] / l, p[1] / l, p[2] / l];
}

describe("2차맵 격자", () => {
  it("정육면체 점: 면 가장자리 꼭짓점은 맞닿은 면이 같은 점을 내고, 같은 점이면 구 위 방향도 같다", () => {
    const level = 3;
    const N = 2 ** level;
    const groups = new Map<string, number[][]>();
    for (const face of FACES) {
      for (let J = 0; J <= N; J++) {
        for (let I = 0; I <= N; I++) {
          if (I !== 0 && I !== N && J !== 0 && J !== N) continue;
          const key = cubePoint(face, level, I, J).join(",");
          const list = groups.get(key) ?? [];
          list.push(direction(face, level, I, J));
          groups.set(key, list);
        }
      }
    }
    // 정육면체 겉의 서로 다른 가장자리 점: 모서리 12개 × (N − 1) + 꼭짓점 8개
    expect(groups.size).toBe(12 * (N - 1) + 8);
    for (const list of groups.values()) {
      expect([2, 3]).toContain(list.length);
      for (const d of list) for (let k = 0; k < 3; k++) expect(d[k]).toBeCloseTo(list[0]?.[k] ?? 0, 14);
    }
  });

  it("꼭짓점 좌표: 열은 면 i 쪽, 행이 커지면 면 j가 작아진다", () => {
    const map = mapCoords(cellKey(0, 9, 256, 256));
    expect(vertexI(map, 0)).toBe(256 * 128);
    expect(vertexI(map, 128)).toBe(257 * 128);
    expect(vertexJ(map, 0)).toBe(257 * 128);
    expect(vertexJ(map, 128)).toBe(256 * 128);
  });

  it("둘레 3×3: 면 안은 9칸, 정육면체 꼭짓점 칸은 대각선 하나가 없다", () => {
    expect([...neighbourhood(mapCoords(cellKey(0, 5, 10, 10)))].every((cell) => cell >= 0)).toBe(true);
    const corner = [...neighbourhood(mapCoords(cellKey(0, 5, 0, 0)))];
    expect(corner.filter((cell) => cell < 0)).toHaveLength(1);
    expect(corner[0]).toBe(-1);
  });

  it("내림 나눗셈", () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(floorDiv(-8, 2)).toBe(-4);
    expect(floorDiv(0, 5)).toBe(0);
  });
});
