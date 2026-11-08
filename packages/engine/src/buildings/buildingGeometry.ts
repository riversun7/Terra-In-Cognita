// 건물 조각 단위 도형(three) — 모두 [-0.5, 0.5]³ 상자 안, 가운데가 원점. buildingView.ts가 도형마다 InstancedMesh 하나로 쓴다.
// 로우폴리(면 수가 적다): 원기둥·원뿔 8각, 반구 8 × 3. 면이 각져 보이게 재질은 flatShading이다.
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
} from "three";
import type { PartShape } from "./buildingParts.ts";

/** 박공 지붕(삼각 기둥): 바닥 1 × 1, 용마루는 x를 따라 위(y = 0.5), 두 비탈은 ±z를 본다 */
export function createGableGeometry(): BufferGeometry {
  const h = 0.5;
  const a = [-h, -h, h];
  const b = [h, -h, h];
  const c = [h, h, 0];
  const d = [-h, h, 0];
  const e = [h, -h, -h];
  const f = [-h, -h, -h];
  const g = [-h, h, 0];
  const k = [h, h, 0];
  // 바깥에서 보아 반시계 차례(앞 비탈 둘·뒤 비탈 둘·오른쪽 끝·왼쪽 끝·바닥 둘)
  const triangles = [
    [a, b, c],
    [a, c, d],
    [e, f, g],
    [e, g, k],
    [b, e, c],
    [f, a, d],
    [f, e, b],
    [f, b, a],
  ];
  const positions = triangles.flat(2);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  // 꼭짓점을 나눠 쓰지 않으므로 면 법선이 된다
  geometry.computeVertexNormals();
  return geometry;
}

/** 도형 이름 → 단위 지오메트리(새로 만든다. 버리는 쪽이 dispose) */
export function createPartGeometry(shape: PartShape): BufferGeometry {
  switch (shape) {
    case "box":
    case "glow":
      return new BoxGeometry(1, 1, 1);
    case "gable":
      return createGableGeometry();
    case "pyramid":
      // 4각뿔: 꼭짓점이 축 위에 오므로 45° 돌려 바닥 모서리를 (±0.5, ±0.5)에 둔다
      return new ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
    case "cylinder":
      return new CylinderGeometry(0.5, 0.5, 1, 8, 1);
    case "cone":
      return new ConeGeometry(0.5, 1, 8, 1);
    case "dome":
      // 반구(위쪽 반): y 0 ~ 0.5 → 높이 1로 늘리고 가운데로 내린다
      return new SphereGeometry(0.5, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(1, 2, 1)
        .translate(0, -0.5, 0);
    default: {
      const unknown: never = shape;
      return unknown;
    }
  }
}
