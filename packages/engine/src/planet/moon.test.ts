import { Group, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { MAX_MOONS, MoonLayer, moonSpots } from "./moon.ts";
import { createSharedTileUniforms } from "./planetMaterials.ts";
import { PLACEHOLDER_PLANET_SKY, type PlanetMoonDescription } from "./sky.ts";
import type { MoonPlacement } from "./skyController.ts";
import type { Vec3 } from "./vec3.ts";

const R = 531_000;
const MOON: PlanetMoonDescription = PLACEHOLDER_PLANET_SKY.moons[0] ?? {
  synodicMs: 1,
  newMoonOffsetMs: 0,
  inclinationDeg: 0,
  ascendingNodeDeg: 0,
  distanceRadii: 12,
  radiusRadii: 0.27,
  lookSeed: 1,
};
const shared = createSharedTileUniforms([], 0);

function layerOf(count: number): MoonLayer {
  const moons = Array.from({ length: count }, (_, i) => ({ ...MOON, lookSeed: MOON.lookSeed + i }));
  return new MoonLayer(shared, moons, 0x1e2a4a);
}

const placement = (center: Vec3, index: number): MoonPlacement => ({
  center,
  radiusM: 0.27 * R,
  orbitPole: [0, 0, 1],
  index,
});

describe("달 그리기", () => {
  it("배경으로 그린다: 깊이 시험·쓰기 끔, renderOrder < 0, 시야 거르기 끔, 처음엔 숨김, z = 0.5·w", () => {
    const layer = layerOf(1);
    const mesh = layer.meshes[0];
    expect(mesh).toBeDefined();
    if (!mesh) return;
    expect(mesh.material.depthTest).toBe(false);
    expect(mesh.material.depthWrite).toBe(false);
    expect(mesh.renderOrder).toBeLessThan(0);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.visible).toBe(false);
    expect(mesh.material.vertexShader).toContain("gl_Position.z = 0.5 * gl_Position.w;");
    // 항성 방향은 타일과 같은 uniform 객체(위상이 저절로 맞는다)
    expect(mesh.material.uniforms.uSunDirView).toBe(shared.uSunDirView);
    // 지오메트리 하나(32×16 구) 약 24KB
    expect(layer.gpuBytes).toBeGreaterThan(15_000);
    expect(layer.gpuBytes).toBeLessThan(30_000);
  });

  it("놓기: 가운데 − 카메라, 반지름 배율, 조석 고정(+x = 행성 쪽), 켜지기 섞기", () => {
    const layer = layerOf(1);
    const camera: Vec3 = [0, 0, 3 * R];
    const center: Vec3 = [12 * R, 0, 0];
    layer.place([placement(center, 0)], camera, 0.25);
    const mesh = layer.meshes[0];
    if (!mesh) throw new Error("no mesh");
    expect(mesh.visible).toBe(true);
    expect(mesh.position.toArray()).toEqual([12 * R, 0, -3 * R]);
    expect(mesh.scale.x).toBeCloseTo(0.27 * R, 6);
    const front = new Vector3(1, 0, 0).applyQuaternion(mesh.quaternion);
    expect(front.x).toBeCloseTo(-1, 9);
    const pole = new Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
    expect(pole.z).toBeCloseTo(1, 9);
    expect(mesh.material.uniforms.uFade?.value).toBe(0.25);
  });

  it("여럿이면 먼 달부터 그린다(깊이가 없다), 받지 않은 달은 숨긴다", () => {
    const layer = layerOf(3);
    const camera: Vec3 = [0, 0, 3 * R];
    layer.place([placement([12 * R, 0, 0], 0), placement([0, 0, -20 * R], 1)], camera, 1);
    const [near, far, unused] = layer.meshes;
    expect(near?.visible).toBe(true);
    expect(far?.visible).toBe(true);
    expect(unused?.visible).toBe(false);
    expect(far?.renderOrder).toBeLessThan(near?.renderOrder ?? 0);
    expect(near?.renderOrder).toBeLessThan(0);
    layer.hide();
    expect(layer.meshes.every((mesh) => !mesh.visible)).toBe(true);
  });

  it(`달은 ${MAX_MOONS}개까지 만든다`, () => {
    expect(layerOf(MAX_MOONS + 2).meshes).toHaveLength(MAX_MOONS);
  });

  it("버리기: 장면에서 떼고 지오메트리·재질을 버린다", () => {
    const layer = layerOf(2);
    const scene = new Group();
    scene.add(...layer.meshes);
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    layer.meshes[0]?.geometry.addEventListener("dispose", geometryDisposed);
    for (const mesh of layer.meshes) mesh.material.addEventListener("dispose", materialDisposed);
    layer.dispose();
    expect(scene.children).toHaveLength(0);
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    expect(materialDisposed).toHaveBeenCalledTimes(2);
  });

  it("모습: 같은 시드면 같은 바다·크레이터, 바다 3개(음수)가 먼저, 큰 것은 앞면(+x)", () => {
    const a = moonSpots(20_261_029);
    const b = moonSpots(20_261_029);
    expect(a.map((v) => v.toArray())).toEqual(b.map((v) => v.toArray()));
    expect(moonSpots(7).map((v) => v.toArray())).not.toEqual(a.map((v) => v.toArray()));
    expect(a).toHaveLength(18);
    a.forEach((spot, k) => {
      expect(spot.w < 0).toBe(k < 3);
      expect(Math.hypot(spot.x, spot.y, spot.z)).toBeCloseTo(1, 6);
      if (k < 8) expect(spot.x).toBeGreaterThan(0);
    });
  });
});
