// 움직이는 어군 그리기 시험(기획 D-536) — 가까이에서만 그리고, 시각에 따라 길을 따라 움직이며, 모르는 그림은 그리지 않는다
import { MAP_PROP_ARTS } from "@terra/shared";
import { Frustum, Matrix4, OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { propLook } from "./propLook.ts";
import { SCHOOL_MIN_PX_PER_M, SchoolView } from "./schoolView.ts";

/** 2차맵 전체(약 1.5km)를 보는 절두체 */
function wideFrustum(): Frustum {
  const camera = new OrthographicCamera(-2000, 2000, 2000, -2000, 0.1, 5000);
  camera.position.set(750, 1000, 750);
  camera.lookAt(new Vector3(750, 0, 750));
  camera.updateMatrixWorld();
  return new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
}

const fish = MAP_PROP_ARTS.indexOf("fish_school");
const route = { id: 65_536, art: fish, points: [10, 10, 60, 10], periodMs: 60_000, phaseMs: 0 };

describe("어군 그리기", () => {
  it("가까이에서만 그리고, 그릴 때는 계속 그린다(true)", () => {
    const view = new SchoolView();
    view.set([route]);
    const frustum = wideFrustum();
    expect(view.update(0, 5.86, () => 0, frustum, SCHOOL_MIN_PX_PER_M / 2)).toBe(false);
    expect(view.drawn).toBe(0);
    expect(view.update(0, 5.86, () => 0, frustum, 3)).toBe(true);
    expect(view.drawn).toBe(1);
    expect(view.mesh.count).toBeGreaterThan(0);
    view.dispose();
  });

  it("시각이 지나면 길을 따라 옮겨 그린다", () => {
    const view = new SchoolView();
    view.set([route]);
    const frustum = wideFrustum();
    const centre = (): number => {
      const m = new Matrix4();
      let sum = 0;
      for (let i = 0; i < view.mesh.count; i++) {
        view.mesh.getMatrixAt(i, m);
        sum += new Vector3().setFromMatrixPosition(m).x;
      }
      return sum / view.mesh.count;
    };
    view.update(0, 5.86, () => 0, frustum, 3);
    const start = centre();
    view.update(15_000, 5.86, () => 0, frustum, 3);
    expect(centre()).toBeGreaterThan(start + 100);
    view.dispose();
  });

  it("어군 그림이 아니면 그리지 않는다. 물 위 소품·어군 그림은 수면에 선다(float)", () => {
    const view = new SchoolView();
    view.set([{ ...route, art: MAP_PROP_ARTS.indexOf("boulder") }]);
    expect(view.update(0, 5.86, () => 0, wideFrustum(), 3)).toBe(false);
    view.dispose();
    for (const name of ["kelp", "coral", "iceberg", "fish_school", "whale_pod", "lily_pads"])
      expect(propLook(MAP_PROP_ARTS.indexOf(name))?.float, name).toBe(true);
    expect(propLook(MAP_PROP_ARTS.indexOf("sand_dune"))?.float).toBeUndefined();
  });
});
