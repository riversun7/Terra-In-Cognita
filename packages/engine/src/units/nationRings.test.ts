// 나라 색 고리 시험(질문 963 나) — 나라가 있는 유닛만, 화면 안만, 점 표현이면 없음, 화면 반지름 하한, 칸 ↔ 유닛 다시 잇기
import { Frustum, InstancedMesh, Matrix4, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import { NATION_RING_MIN_PX, NATION_RING_SCALE, NationRings, type NationRingView } from "./nationRings.ts";

const CELL_M = 5;

/** 원점 둘레만 보는 좁은 시야(위에서 내려다봄) */
function frustumOver(halfM: number): Frustum {
  const camera = new PerspectiveCamera(60, 1, 1, 5000);
  camera.position.set(0, halfM * Math.sqrt(3), 0.001);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
}

/** 유닛 count개를 원점에서 동쪽으로 spacingM 간격으로 놓은 보기 */
function viewOf(count: number, spacingM: number, over: Partial<NationRingView> = {}): NationRingView {
  const x = new Float32Array(count);
  for (let i = 0; i < count; i++) x[i] = (i * spacingM) / CELL_M;
  return {
    count,
    x,
    y: new Float32Array(count),
    cellM: CELL_M,
    groundAt: () => 0,
    frustum: frustumOver(400),
    radiusOf: () => 0.3,
    pixelsPerMetre: 20,
    icons: false,
    ...over,
  };
}

describe("나라 색 고리", () => {
  it("나라가 있는 유닛만 그린다. 틀린 번호는 버린다. 그리기는 메시 하나", () => {
    const rings = new NationRings(64);
    rings.setRings([
      { id: 1, accent: 0 },
      { id: 3, accent: 7 },
      { id: 4, accent: -1 },
      { id: 5, accent: 1.5 },
    ]);
    rings.bind(5, (slot) => slot + 1);
    expect([0, 1, 2, 3, 4].map((slot) => rings.accentAt(slot))).toEqual([0, null, 7, null, null]);
    rings.update(viewOf(5, 2));
    expect(rings.drawn).toBe(2);
    expect(rings.group.children).toHaveLength(1);
    rings.dispose();
  });

  it("화면 밖 유닛·점 표현이면 그리지 않는다", () => {
    const rings = new NationRings(64);
    rings.setRings(Array.from({ length: 10 }, (_, index) => ({ id: index + 1, accent: index % 6 })));
    rings.bind(10, (slot) => slot + 1);
    // 100m 간격: 시야(반 폭 약 400m) 안에는 앞의 몇 개만
    rings.update(viewOf(10, 100));
    expect(rings.drawn).toBeGreaterThan(0);
    expect(rings.drawn).toBeLessThan(10);
    rings.update(viewOf(10, 1, { icons: true }));
    expect(rings.drawn).toBe(0);
    rings.dispose();
  });

  it("고리 반지름 = 몸 × 배율, 멀리서는 화면 반지름 하한", () => {
    const rings = new NationRings(4);
    rings.setRings([{ id: 1, accent: 2 }]);
    rings.bind(1, () => 1);
    const matrixScale = (ppm: number): number => {
      rings.update(viewOf(1, 0, { pixelsPerMetre: ppm }));
      const mesh = rings.group.children[0];
      return mesh instanceof InstancedMesh ? (mesh.instanceMatrix.array[0] ?? 0) : 0;
    };
    expect(matrixScale(100)).toBeCloseTo(0.3 * NATION_RING_SCALE, 5);
    expect(matrixScale(1)).toBeCloseTo(NATION_RING_MIN_PX, 5);
    rings.dispose();
  });

  it("유닛 명단이 바뀌면 칸 ↔ 나라를 다시 잇고, 줄어든 칸은 비운다", () => {
    const rings = new NationRings(8);
    rings.setRings([
      { id: 10, accent: 3 },
      { id: 20, accent: 4 },
    ]);
    rings.bind(2, (slot) => (slot === 0 ? 10 : 20));
    expect(rings.accentAt(1)).toBe(4);
    rings.bind(2, (slot) => (slot === 0 ? 20 : 30));
    expect([rings.accentAt(0), rings.accentAt(1)]).toEqual([4, null]);
    rings.bind(1, () => 10);
    expect([rings.accentAt(0), rings.accentAt(1)]).toEqual([3, null]);
    rings.dispose();
  });
});
