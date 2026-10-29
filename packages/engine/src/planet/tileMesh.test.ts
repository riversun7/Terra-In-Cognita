import { type Face, FACES, FACE_EDGES, wrapFaceIJ } from "@terra/planet";
import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M, makeTile, sampleHeight } from "./testSupport.ts";
import {
  type TileMeshArrays,
  buildTileMesh,
  decodedTileProblem,
  skirtTopIndex,
  skirtVertexIndex,
  tileIndices,
  tileVertexCount,
} from "./tileMesh.ts";
import { faceSTDirection } from "./tileShape.ts";
import { type Vec3, cross, dot, length, normalize, sub } from "./vec3.ts";

const R = EARTH_RADIUS_M;
const TILE = 32;

/** 꼭짓점 v의 세계 위치(원점 + 32비트 위치, 실수 64비트로 더한다) */
function world(mesh: TileMeshArrays, v: number): Vec3 {
  return [
    mesh.origin[0] + (mesh.positions[v * 3] ?? 0),
    mesh.origin[1] + (mesh.positions[v * 3 + 1] ?? 0),
    mesh.origin[2] + (mesh.positions[v * 3 + 2] ?? 0),
  ];
}

/** 가장자리(격자 바깥 줄) 꼭짓점 번호 */
function edgeVertices(segments: number): number[] {
  const n = segments + 1;
  const out = new Set<number>();
  for (let k = 0; k < n; k++) {
    out.add(k);
    out.add(segments * n + k);
    out.add(k * n);
    out.add(k * n + segments);
  }
  return [...out];
}

/** 레벨 9 타일 하나와 면 경계 너머(또는 같은 면) 이웃 타일 */
function neighborAcross(face: Face, tx: number, ty: number, di: number, dj: number) {
  const level = 9;
  // 이 타일 가장자리 칸 바로 바깥 칸 → 그 칸이 든 타일
  const i = tx * TILE + (di > 0 ? TILE : di < 0 ? -1 : 0);
  const j = ty * TILE + (dj > 0 ? TILE : dj < 0 ? -1 : 0);
  const wrapped = wrapFaceIJ(face, level, i, j);
  if (!wrapped) throw new Error("corner");
  return { face: wrapped.face, tx: Math.floor(wrapped.i / TILE), ty: Math.floor(wrapped.j / TILE) };
}

describe("타일 메시 — 꼭짓점·인덱스", () => {
  it("32칸 타일: 꼭짓점 33×33 + 치마 4×33, 삼각형 32×32×2 + 치마 4×32×2", () => {
    const mesh = buildTileMesh(makeTile(0, 9, 64, 96, TILE), R);
    expect(mesh.segments).toBe(32);
    expect(mesh.positions.length / 3).toBe(33 * 33 + 4 * 33);
    expect(tileVertexCount(32)).toBe(33 * 33 + 4 * 33);
    expect(tileIndices(32).length).toBe((32 * 32 * 2 + 4 * 32 * 2) * 3);
    expect(tileIndices(32)).toBe(tileIndices(32));
    expect(mesh.cellData.length).toBe(32 * 32 * 4);
    expect(mesh.cellExtra.length).toBe(32 * 32 * 2);
  });

  it("격자 꼭짓점 높이 = 칸 꼭짓점 높이, 위치는 해수면 구 위(원점 기준)", () => {
    const tile = makeTile(4, 8, 32, 0, TILE);
    const mesh = buildTileMesh(tile, R);
    for (let v = 0; v < 33 * 33; v++) {
      expect(mesh.heights[v * 2]).toBe(tile.heightsM[v]);
      expect(mesh.heights[v * 2 + 1]).toBe(0);
      expect(length(world(mesh, v))).toBeCloseTo(R, 1);
    }
  });

  it("칸 자료: 기온은 +128, 나머지는 그대로", () => {
    const tile = makeTile(2, 9, 0, 0, TILE);
    const mesh = buildTileMesh(tile, R);
    for (const c of [0, 5, 77, 1023]) {
      expect(mesh.cellData[c * 4]).toBe(tile.biome[c]);
      expect(mesh.cellData[c * 4 + 1]).toBe(tile.water[c]);
      expect(mesh.cellData[c * 4 + 2]).toBe((tile.temperatureC[c] ?? 0) + 128);
      expect(mesh.cellData[c * 4 + 3]).toBe(tile.humidity[c]);
      expect(mesh.cellExtra[c * 2]).toBe(tile.forest[c]);
      expect(mesh.cellExtra[c * 2 + 1]).toBe(tile.river[c]);
    }
  });

  it("모양이 틀린 타일은 거절", () => {
    const tile = makeTile(0, 9, 0, 0, TILE);
    expect(decodedTileProblem(tile)).toBeNull();
    expect(decodedTileProblem({ ...tile, heightsM: new Int16Array(10) })).toMatch(/heightsM/);
    expect(decodedTileProblem({ ...tile, river: new Uint8Array(3) })).toMatch(/river/);
    expect(decodedTileProblem({ ...tile, face: 6 })).toMatch(/face/);
    expect(() => buildTileMesh({ ...tile, biome: new Uint8Array(1) }, R)).toThrow(/biome/);
  });
});

describe("같은 레벨 이웃은 맞닿은 변의 꼭짓점을 함께 쓴다(면 경계 포함)", () => {
  const cases: { label: string; face: Face; tx: number; ty: number; di: number; dj: number }[] = [];
  for (const face of FACES) {
    for (const edge of FACE_EDGES) {
      const di = edge === "iMinus" ? -1 : edge === "iPlus" ? 1 : 0;
      const dj = edge === "jMinus" ? -1 : edge === "jPlus" ? 1 : 0;
      // 면 가장자리의 가운데쯤 타일(꼭짓점 칸은 피한다)
      const tx = di < 0 ? 0 : di > 0 ? 15 : 6;
      const ty = dj < 0 ? 0 : dj > 0 ? 15 : 9;
      cases.push({ label: `면 ${face} ${edge}`, face, tx, ty, di, dj });
    }
  }
  cases.push({ label: "같은 면 안(i 쪽)", face: 3, tx: 4, ty: 4, di: 1, dj: 0 });
  cases.push({ label: "같은 면 안(j 쪽)", face: 5, tx: 7, ty: 2, di: 0, dj: -1 });

  it.each(cases)(
    "$label: 변 위 꼭짓점 33개가 이웃 꼭짓점과 같은 자리·같은 높이",
    ({ face, tx, ty, di, dj }) => {
      const other = neighborAcross(face, tx, ty, di, dj);
      const a = buildTileMesh(makeTile(face, 9, tx * TILE, ty * TILE, TILE), R);
      const b = buildTileMesh(makeTile(other.face, 9, other.tx * TILE, other.ty * TILE, TILE), R);
      // 이 타일 변의 꼭짓점들(di, dj 쪽)
      const n = 33;
      const shared: number[] = [];
      for (let k = 0; k < n; k++) {
        if (di > 0) shared.push(k * n + 32);
        if (di < 0) shared.push(k * n);
        if (dj > 0) shared.push(32 * n + k);
        if (dj < 0) shared.push(k);
      }
      const bEdge = edgeVertices(32);
      let matched = 0;
      for (const v of shared) {
        const p = world(a, v);
        let best = Number.POSITIVE_INFINITY;
        let bestV = -1;
        for (const w of bEdge) {
          const d = length(sub(world(b, w), p));
          if (d < best) {
            best = d;
            bestV = w;
          }
        }
        // 32비트 위치(원점 기준 최대 약 34km)의 반올림 오차만큼(mm)
        expect(best).toBeLessThan(0.01);
        expect(b.heights[bestV * 2]).toBe(a.heights[v * 2]);
        matched += 1;
      }
      expect(matched).toBe(33);
    },
  );
});

describe("감는 방향과 치마", () => {
  it("모든 면에서 윗면 삼각형은 바깥(위쪽)을 본다", () => {
    const indices = tileIndices(32);
    for (const face of FACES) {
      for (const [level, i0, j0] of [
        [5, 0, 0],
        [9, 480, 0],
      ] as const) {
        const mesh = buildTileMesh(makeTile(face, level, i0, j0, TILE), R);
        for (let k = 0; k < 32 * 32 * 6; k += 3) {
          const a = world(mesh, indices[k] ?? 0);
          const b = world(mesh, indices[k + 1] ?? 0);
          const c = world(mesh, indices[k + 2] ?? 0);
          const normal = cross(sub(b, a), sub(c, a));
          expect(dot(normal, normalize(a))).toBeGreaterThan(0);
        }
      }
    }
  });

  it("치마 꼭짓점은 변 꼭짓점과 같은 자리·높이에 치마 표시 1, 삼각형은 타일 밖을 본다", () => {
    const indices = tileIndices(32);
    for (const face of FACES) {
      const mesh = buildTileMesh(makeTile(face, 7, 32, 64, TILE), R);
      for (let edge = 0; edge < 4; edge++) {
        for (let k = 0; k < 33; k++) {
          const top = skirtTopIndex(32, edge, k);
          const skirt = skirtVertexIndex(32, edge, k);
          expect(mesh.positions.slice(skirt * 3, skirt * 3 + 3)).toEqual(
            mesh.positions.slice(top * 3, top * 3 + 3),
          );
          expect(mesh.heights[skirt * 2]).toBe(mesh.heights[top * 2]);
          expect(mesh.heights[skirt * 2 + 1]).toBe(1);
          expect(mesh.uvs.slice(skirt * 2, skirt * 2 + 2)).toEqual(mesh.uvs.slice(top * 2, top * 2 + 2));
        }
      }
      // 치마 삼각형: 치마 꼭짓점을 아래로(행성 중심 쪽) 내린 모양으로 법선을 구해 타일 가운데에서 바깥을 보는지 본다
      const centre = normalize(mesh.origin);
      const lowered = (v: number): Vec3 => {
        const p = world(mesh, v);
        const drop = (mesh.heights[v * 2 + 1] ?? 0) * 1000;
        const up = normalize(p);
        return [p[0] - up[0] * drop, p[1] - up[1] * drop, p[2] - up[2] * drop];
      };
      for (let k = 32 * 32 * 6; k < indices.length; k += 3) {
        const a = lowered(indices[k] ?? 0);
        const b = lowered(indices[k + 1] ?? 0);
        const c = lowered(indices[k + 2] ?? 0);
        const normal = cross(sub(b, a), sub(c, a));
        const middle: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        const outward = sub(normalize(middle), centre);
        expect(dot(normal, outward)).toBeGreaterThan(0);
      }
    }
  });
});

describe("높이 기울기(법선용)", () => {
  it("선형 높이 h = a·(방향·k)이면 기울기 ≈ a·(k의 접평면 성분)/R", () => {
    // 높이는 정수(Int16)로 반올림되므로 차이가 크게 나도록 a를 크게 잡는다(반올림 오차 1% 아래)
    const a = 20_000;
    // 면 1(+y) 쪽을 보는 k: 이 타일에서 높이가 모두 양수(해수면 위)
    const k: Vec3 = normalize([0.3, 0.8, 0.5]);
    const tile = makeTile(1, 9, 160, 224, TILE, (d) => Math.round(a * dot(d, k)));
    const mesh = buildTileMesh(tile, R);
    let checked = 0;
    for (const v of [33 * 5 + 7, 33 * 16 + 16, 33 * 27 + 20]) {
      if ((mesh.heights[v * 2] ?? 0) <= 0) continue;
      const up = normalize(world(mesh, v));
      const along = dot(k, up);
      const expected: Vec3 = [
        ((k[0] - up[0] * along) * a) / R,
        ((k[1] - up[1] * along) * a) / R,
        ((k[2] - up[2] * along) * a) / R,
      ];
      const got: Vec3 = [mesh.grads[v * 3] ?? 0, mesh.grads[v * 3 + 1] ?? 0, mesh.grads[v * 3 + 2] ?? 0];
      expect(length(sub(got, expected))).toBeLessThan(0.03 * length(expected));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("해수면 아래(높이 < 0)는 평평하다(기울기 0)", () => {
    const mesh = buildTileMesh(
      makeTile(3, 9, 0, 0, TILE, () => -300),
      R,
    );
    expect(Math.max(...mesh.grads.map(Math.abs))).toBe(0);
  });
});

describe("면 전체 타일(32칸보다 작은 레벨)", () => {
  it("4칸 타일도 32마디로 나누고 높이는 이중선형, 칸 텍스처는 4×4", () => {
    const tile = makeTile(0, 2, 0, 0, 4, sampleHeight, 6);
    const mesh = buildTileMesh(tile, R);
    expect(mesh.segments).toBe(32);
    expect(mesh.cells).toBe(4);
    expect(mesh.cellData.length).toBe(4 * 4 * 4);
    // 꼭짓점 (8, 8)마디 = 칸 꼭짓점 (1, 1)
    expect(mesh.heights[(8 * 33 + 8) * 2]).toBe(tile.heightsM[1 * 5 + 1]);
    // 칸 꼭짓점 사이는 이웃 두 값 사이
    const between = mesh.heights[4 * 2] ?? 0;
    const h0 = tile.heightsM[0] ?? 0;
    const h1 = tile.heightsM[1] ?? 0;
    expect(between).toBeCloseTo((h0 + h1) / 2, 6);
    const dir = faceSTDirection(0, 0.125, 0);
    expect(length(sub(world(mesh, 4), [dir[0] * R, dir[1] * R, dir[2] * R]))).toBeLessThan(0.05);
  });
});
