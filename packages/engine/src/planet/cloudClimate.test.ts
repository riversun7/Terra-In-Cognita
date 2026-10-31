import { WATER_OCEAN } from "@terra/planet";
import { describe, expect, it } from "vitest";
import {
  climateAt,
  climateCubeSize,
  climateFaces,
  firstLevelNodes,
  glCubeDirection,
  glCubeFaceST,
} from "./cloudClimate.ts";
import type { DecodedTile } from "./planetTypes.ts";
import { makeTile } from "./testSupport.ts";
import { tileKey, tileLayout } from "./tileTree.ts";
import { angleBetween } from "./vec3.ts";

describe("GL 큐브 면 방향(OpenGL ES 3.0 표 3.21)", () => {
  it("면 가운데: +X −X +Y −Y +Z −Z 차례", () => {
    const centers = [0, 1, 2, 3, 4, 5].map((face) => glCubeDirection(face, 0.5, 0.5));
    expect(centers).toEqual([
      [1, -0, -0],
      [-1, -0, 0],
      [0, 1, 0],
      [0, -1, -0],
      [0, -0, 1],
      [-0, -0, -1],
    ]);
  });

  it("방향 → (면, s, t) → 방향 왕복이 맞다(굽기 셰이더 faceDir와 GPU 읽기 식이 서로 거꾸로)", () => {
    for (let face = 0; face < 6; face++) {
      for (const s of [0.03, 0.25, 0.5, 0.71, 0.97]) {
        for (const t of [0.02, 0.4, 0.5, 0.88]) {
          const back = glCubeFaceST(glCubeDirection(face, s, t));
          expect(back.face).toBe(face);
          expect(back.s).toBeCloseTo(s, 12);
          expect(back.t).toBeCloseTo(t, 12);
        }
      }
    }
  });

  it("이웃 면의 가장자리 텍셀은 같은 방향 근처다(이음매 없음)", () => {
    // +X 면의 s = 1 쪽 가장자리 = +Z… 아니라 −Z 쪽(sc = −z): +X(s→1)과 −Z(s→0)이 만난다
    expect(angleBetween(glCubeDirection(0, 1, 0.5), glCubeDirection(5, 0, 0.5))).toBeLessThan(1e-12);
    expect(angleBetween(glCubeDirection(4, 1, 0.5), glCubeDirection(0, 0, 0.5))).toBeLessThan(1e-12);
  });
});

describe("기후 큐브", () => {
  it("한 면 칸 수 = 2^(F−4), 64 상한. 첫 단계 마디는 F9 6개, F10 24개", () => {
    expect(climateCubeSize(tileLayout(9))).toBe(32);
    expect(climateCubeSize(tileLayout(4))).toBe(1);
    expect(climateCubeSize(tileLayout(11))).toBe(64);
    expect(firstLevelNodes(tileLayout(9))).toHaveLength(6);
    expect(firstLevelNodes(tileLayout(10))).toHaveLength(24);
  });

  it("방향의 칸: 첫 단계 타일의 습도와 땅(바다·호수 비트면 0). 받지 않은 타일은 바다", () => {
    const layout = tileLayout(9);
    const tiles = new Map<number, DecodedTile>();
    for (const node of firstLevelNodes(layout)) {
      const tile = makeTile(node.face, node.mapLevel, 0, 0, 32);
      tiles.set(tileKey(node), tile);
    }
    const decoded = (key: number): DecodedTile | null => tiles.get(key) ?? null;
    let land = 0;
    let sea = 0;
    for (let k = 0; k < 400; k++) {
      const direction = glCubeDirection(k % 6, ((k * 37) % 97) / 97, ((k * 53) % 89) / 89);
      const [humidity, isLand] = climateAt(direction, layout, decoded);
      expect(humidity).toBeGreaterThanOrEqual(0);
      expect(humidity).toBeLessThanOrEqual(1);
      if (isLand === 1) land += 1;
      else sea += 1;
    }
    // 시험 타일은 7칸마다 바다 비트(makeTile)
    expect(land).toBeGreaterThan(0);
    expect(sea).toBeGreaterThan(0);
    expect(climateAt([1, 0, 0], layout, () => null)).toEqual([0, 0]);
    // 바다 비트가 있으면 땅 0
    const oceanTile = makeTile(0, 5, 0, 0, 32);
    const flooded: DecodedTile = { ...oceanTile, water: new Uint8Array(32 * 32).fill(WATER_OCEAN) };
    expect(climateAt([1, 0.1, 0.1], layout, () => flooded)[1]).toBe(0);
  });

  it("RG8 면 6장: 텍셀 가운데 방향마다 [습도, 땅] × 255", () => {
    const faces = climateFaces(4, (direction) => [direction[0] > 0 ? 1 : 0, direction[2] > 0 ? 1 : 0]);
    expect(faces).toHaveLength(6);
    expect(faces[0]).toHaveLength(4 * 4 * 2);
    // +X 면: 습도 255(모두 x > 0), −X 면: 0
    expect([...(faces[0] ?? [])].filter((_, i) => i % 2 === 0).every((v) => v === 255)).toBe(true);
    expect([...(faces[1] ?? [])].filter((_, i) => i % 2 === 0).every((v) => v === 0)).toBe(true);
    // +Z 면의 땅 칸은 모두 255
    expect([...(faces[4] ?? [])].filter((_, i) => i % 2 === 1).every((v) => v === 255)).toBe(true);
  });
});
