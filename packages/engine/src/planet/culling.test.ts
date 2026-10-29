import { createRng } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  aboveHorizon,
  frustumPlanes,
  multiplyMatrices,
  perspectiveMatrix,
  sphereInFrustum,
  viewRotationMatrix,
} from "./culling.ts";
import { type Vec3, addScaled, cross, dot, length, normalize, rotateAround, sub } from "./vec3.ts";

const DEG = Math.PI / 180;

describe("절두체", () => {
  // 카메라 기준: 원점에서 −z를 본다(오른쪽 +x, 위 +y)
  const planes = frustumPlanes(
    multiplyMatrices(
      perspectiveMatrix(40 * DEG, 0.5, 1, 1000),
      viewRotationMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1]),
    ),
  );

  it("앞은 보이고 뒤·옆·너무 먼 곳은 거른다", () => {
    expect(sphereInFrustum(planes, 0, 0, -10, 1)).toBe(true);
    expect(sphereInFrustum(planes, 0, 0, 10, 1)).toBe(false);
    expect(sphereInFrustum(planes, 100, 0, -10, 1)).toBe(false);
    expect(sphereInFrustum(planes, 0, 0, -2000, 10)).toBe(false);
    expect(sphereInFrustum(planes, 0, 0, -0.2, 0.1)).toBe(false);
  });

  it("경계에 걸친 구는 보인다(반지름만큼 여유)", () => {
    // 세로 반각 20°: z = −10에서 위 경계는 y = 10·tan 20° ≈ 3.64
    expect(sphereInFrustum(planes, 0, 4.5, -10, 1.0)).toBe(true);
    expect(sphereInFrustum(planes, 0, 6, -10, 1.0)).toBe(false);
  });

  it("카메라를 돌린 보기 회전도 맞다", () => {
    // 카메라가 +x를 본다: 뒤(back) = −x, 위 = +y, 오른쪽 = 위 × 뒤… 오른손 축 (right, up, back) = (+z, +y, −x)
    const rotated = frustumPlanes(
      multiplyMatrices(
        perspectiveMatrix(40 * DEG, 1, 1, 1000),
        viewRotationMatrix([0, 0, 1], [0, 1, 0], [-1, 0, 0]),
      ),
    );
    expect(sphereInFrustum(rotated, 50, 0, 0, 1)).toBe(true);
    expect(sphereInFrustum(rotated, -50, 0, 0, 1)).toBe(false);
  });
});

describe("지평선 거르기", () => {
  const R = 1000;
  const camera: Vec3 = [0, 0, 2000];

  it("카메라 쪽은 보이고 반대쪽은 가려진다", () => {
    expect(aboveHorizon(camera, [0, 0, 1], 0, R, R)).toBe(true);
    expect(aboveHorizon(camera, [0, 0, -1], 0, R, R)).toBe(false);
  });

  it("지평선(acos(R/d) = 60°) 너머는 가려지고, 높은 땅(R × 1.1)은 그만큼(24.6°) 더 보인다", () => {
    const at = (deg: number): Vec3 => [Math.sin(deg * DEG), 0, Math.cos(deg * DEG)];
    expect(aboveHorizon(camera, at(59), 0, R, R)).toBe(true);
    expect(aboveHorizon(camera, at(61), 0, R, R)).toBe(false);
    expect(aboveHorizon(camera, at(84), 0, R, R * 1.1)).toBe(true);
    expect(aboveHorizon(camera, at(86), 0, R, R * 1.1)).toBe(false);
    // 각 반지름 10°인 조각은 가운데가 70°여도 가장자리(60°)가 보인다
    expect(aboveHorizon(camera, at(69), 10 * DEG, R, R)).toBe(true);
  });

  it("카메라가 구 안이면 거르지 않는다", () => {
    expect(aboveHorizon([0, 0, 500], [0, 0, -1], 0, R, R)).toBe(true);
  });

  it("보수적: 조각 위 점 하나라도 실제로 보이면(시선이 구를 안 지나면) 거르지 않는다", () => {
    const rng = createRng(36);
    const random = (): number => rng.nextU32() / 0x1_0000_0000;
    const unit = (): Vec3 => normalize([random() * 2 - 1, random() * 2 - 1, random() * 2 - 1]);
    let visibleCaps = 0;
    for (let trial = 0; trial < 400; trial++) {
      const cam: Vec3 = addScaled([0, 0, 0], unit(), R * (1.001 + random() * 2));
      const centre = unit();
      const radius = random() * 12 * DEG;
      const height = R * (1 + random() * 0.02);
      // 조각 가장자리·가운데 점들이 정말 보이는지(구 R과 시선의 교차)
      const side = normalize(cross(centre, Math.abs(centre[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
      let anyVisible = false;
      for (let k = 0; k <= 16; k++) {
        const edge = rotateAround(centre, rotateAround(side, centre, (k / 16) * 2 * Math.PI), radius);
        for (const p of [edge, centre]) {
          const point: Vec3 = [p[0] * height, p[1] * height, p[2] * height];
          if (lineOfSight(cam, point, R)) anyVisible = true;
        }
      }
      if (anyVisible) {
        visibleCaps += 1;
        expect(aboveHorizon(cam, centre, radius, R, height)).toBe(true);
      }
    }
    expect(visibleCaps).toBeGreaterThan(50);
  });
});

/** 카메라 → 점 선분이 반지름 R 구 안을 지나지 않는지 */
function lineOfSight(from: Vec3, to: Vec3, radius: number): boolean {
  const d = sub(to, from);
  const len = length(d);
  const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  const t = Math.max(0, Math.min(len, -dot(from, dir)));
  const closest = addScaled(from, dir, t);
  return length(closest) >= radius - 1e-9;
}
