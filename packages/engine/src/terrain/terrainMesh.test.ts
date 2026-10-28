import { describe, expect, it } from "vitest";
import { createMockTerrain } from "../mock/mockTerrain.ts";
import {
  SURFACE,
  TERRAIN_CELLS,
  TERRAIN_VERTICES,
  type TerrainInput,
  sampleHeightM,
  surfaceAt,
  terrainProblem,
  vertexHeightM,
} from "./terrainData.ts";
import { buildTerrainMesh } from "./terrainMesh.ts";

function flatTerrain(heightDm = 0, code: number = SURFACE.grass): TerrainInput {
  return {
    heights: new Int16Array(TERRAIN_VERTICES * TERRAIN_VERTICES).fill(heightDm),
    surface: new Uint8Array(TERRAIN_CELLS * TERRAIN_CELLS).fill(code),
    baseHeightM: 0,
    cellSizeM: 10,
    waterLevelM: 0,
  };
}

const vec = (array: Float32Array, i: number): [number, number, number] => [
  array[i * 3] ?? 0,
  array[i * 3 + 1] ?? 0,
  array[i * 3 + 2] ?? 0,
];

function triangleNormal(positions: Float32Array, a: number, b: number, c: number): [number, number, number] {
  const [ax, ay, az] = vec(positions, a);
  const [bx, by, bz] = vec(positions, b);
  const [cx, cy, cz] = vec(positions, c);
  const u = [bx - ax, by - ay, bz - az] as const;
  const v = [cx - ax, cy - ay, cz - az] as const;
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

describe("buildTerrainMesh", () => {
  it("평평한 땅: 꼭짓점·삼각형 수, 위를 보는 법선", () => {
    const mesh = buildTerrainMesh(flatTerrain());
    const surfaceVertices = TERRAIN_VERTICES * TERRAIN_VERTICES;
    const skirtVertices = 4 * TERRAIN_VERTICES * 2;
    expect(mesh.positions.length).toBe((surfaceVertices + skirtVertices) * 3);
    expect(mesh.indices.length).toBe(TERRAIN_CELLS * TERRAIN_CELLS * 6 + 4 * TERRAIN_CELLS * 6);
    for (let v = 0; v < surfaceVertices; v++) expect(vec(mesh.normals, v)).toEqual([-0, 1, -0]);
    expect(mesh.minHeightM).toBe(0);
    expect(mesh.maxHeightM).toBe(0);
    expect(mesh.hasWater).toBe(false);
  });

  it("윗면 삼각형은 모두 위를, 가장자리 벽은 바깥을 본다", () => {
    const terrain = createMockTerrain(11);
    const mesh = buildTerrainMesh(terrain);
    const top = TERRAIN_CELLS * TERRAIN_CELLS * 6;
    for (let k = 0; k < top; k += 3) {
      const n = triangleNormal(
        mesh.positions,
        mesh.indices[k] ?? 0,
        mesh.indices[k + 1] ?? 0,
        mesh.indices[k + 2] ?? 0,
      );
      expect(n[1]).toBeGreaterThan(0);
    }
    const size = TERRAIN_CELLS * terrain.cellSizeM;
    for (let k = top; k < mesh.indices.length; k += 3) {
      const ids = [mesh.indices[k] ?? 0, mesh.indices[k + 1] ?? 0, mesh.indices[k + 2] ?? 0] as const;
      const n = triangleNormal(mesh.positions, ...ids);
      const cx = ids.reduce((sum, i) => sum + (mesh.positions[i * 3] ?? 0), 0) / 3;
      const cz = ids.reduce((sum, i) => sum + (mesh.positions[i * 3 + 2] ?? 0), 0) / 3;
      // 무게중심이 2차맵 가운데에서 바깥으로 가는 방향과 법선이 같은 쪽
      expect(n[0] * (cx - size / 2) + n[2] * (cz - size / 2)).toBeGreaterThan(0);
    }
  });

  it("인덱스는 꼭짓점 범위 안", () => {
    const mesh = buildTerrainMesh(createMockTerrain(3));
    const vertexCount = mesh.positions.length / 3;
    expect(Math.max(...mesh.indices)).toBeLessThan(vertexCount);
  });

  it("높이 읽기는 메시 삼각형과 같은 면이다", () => {
    const terrain = flatTerrain();
    // 칸 (0,0)의 네 꼭짓점: a=0, b=10m, c=20m, d=40m (0.1m 단위)
    terrain.heights[0] = 0;
    terrain.heights[1] = 100;
    terrain.heights[TERRAIN_VERTICES] = 200;
    terrain.heights[TERRAIN_VERTICES + 1] = 400;
    const s = terrain.cellSizeM;
    expect(sampleHeightM(terrain, 0, 0)).toBeCloseTo(0, 9);
    expect(sampleHeightM(terrain, s, 0)).toBeCloseTo(10, 9);
    expect(sampleHeightM(terrain, 0, s)).toBeCloseTo(20, 9);
    expect(sampleHeightM(terrain, s, s)).toBeCloseTo(40, 9);
    // 대각선 a–d 가운데는 두 삼각형 모두 (a + d) / 2
    expect(sampleHeightM(terrain, s / 2, s / 2)).toBeCloseTo(20, 9);
    // 오른쪽 위 삼각형(a·d·b)의 점: a + fu(b − a) + fv(d − b)
    expect(sampleHeightM(terrain, 0.75 * s, 0.25 * s)).toBeCloseTo(0.75 * 10 + 0.25 * 30, 9);
    // 왼쪽 아래 삼각형(a·c·d)의 점: a + fv(c − a) + fu(d − c)
    expect(sampleHeightM(terrain, 0.25 * s, 0.75 * s)).toBeCloseTo(0.75 * 20 + 0.25 * 20, 9);
    // 2차맵 밖은 가장자리 높이
    expect(sampleHeightM(terrain, -50, -50)).toBe(vertexHeightM(terrain, 0, 0));
  });

  it("물보다 낮은 땅이 있으면 물 판을 그린다", () => {
    const terrain = flatTerrain(-20);
    expect(buildTerrainMesh(terrain).hasWater).toBe(true);
    expect(surfaceAt(terrain, 5, 5)).toBe(SURFACE.grass);
    expect(surfaceAt(terrain, -1, 5)).toBe(-1);
  });

  it("지표 색: 한 지표로 된 땅은 꼭짓점 색이 모두 같다, 모르는 코드도 그린다", () => {
    const rock = buildTerrainMesh(flatTerrain(0, SURFACE.rock));
    const first = [rock.colors[0], rock.colors[1], rock.colors[2]];
    expect(first.every((value) => (value ?? 0) > 0)).toBe(true);
    expect([rock.colors[300], rock.colors[301], rock.colors[302]]).toEqual(first);
    expect(() => buildTerrainMesh(flatTerrain(0, 200))).not.toThrow();
  });

  it("모양이 틀린 입력은 거부한다", () => {
    const bad = { ...flatTerrain(), heights: new Int16Array(10) };
    expect(terrainProblem(bad)).toMatch(/heights/);
    expect(() => buildTerrainMesh(bad)).toThrow(/invalid terrain/);
    expect(terrainProblem({ ...flatTerrain(), cellSizeM: 0 })).toMatch(/cellSizeM/);
  });
});
