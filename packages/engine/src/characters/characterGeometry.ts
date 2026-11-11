// 캐릭터 조각 단위 도형(three) — 모두 [-0.5, 0.5]³ 상자 안, 가운데가 원점. characterMeshes.ts가 도형마다 InstancedMesh 하나로 쓴다.
// 로우폴리: 기둥·뿔 6각, 공 6 × 4, 반구 6 × 2. 삼각형 수는 characterParts.ts SHAPE_TRIANGLES와 같아야 한다(시험이 본다).
// 면이 각져 보이게 재질은 flatShading이다(법선은 쓰지 않지만 직접 만든 도형에도 면 법선을 넣어 둔다).
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  SphereGeometry,
} from "three";
import type { CharacterShape } from "./characterParts.ts";

type Point = readonly [number, number, number];

/** 꼭짓점을 나눠 쓰지 않는 삼각형 목록 → 지오메트리(면 법선) */
function fromTriangles(triangles: readonly (readonly [Point, Point, Point])[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(triangles.flat(2), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** 네모(바깥에서 보아 반시계 a → b → c → d) → 삼각형 둘 */
const quad = (a: Point, b: Point, c: Point, d: Point): (readonly [Point, Point, Point])[] => [
  [a, b, c],
  [a, c, d],
];

/** 사다리꼴 기둥: 아래 1 × 1(y = −0.5), 위 top × top(y = 0.5) */
function createTaperGeometry(top: number): BufferGeometry {
  const h = 0.5;
  const t = top / 2;
  const a: Point = [-h, -h, h];
  const b: Point = [h, -h, h];
  const c: Point = [h, -h, -h];
  const d: Point = [-h, -h, -h];
  const e: Point = [-t, h, t];
  const f: Point = [t, h, t];
  const g: Point = [t, h, -t];
  const k: Point = [-t, h, -t];
  return fromTriangles([
    ...quad(a, b, f, e),
    ...quad(b, c, g, f),
    ...quad(c, d, k, g),
    ...quad(d, a, e, k),
    ...quad(e, f, g, k),
    ...quad(d, c, b, a),
  ]);
}

/** 쐐기(삼각 기둥): 아래 1 × 1, 용마루는 x를 따라 위(y = 0.5, z = 0) */
function createWedgeGeometry(): BufferGeometry {
  const h = 0.5;
  const a: Point = [-h, -h, h];
  const b: Point = [h, -h, h];
  const c: Point = [h, -h, -h];
  const d: Point = [-h, -h, -h];
  const e: Point = [-h, h, 0];
  const f: Point = [h, h, 0];
  return fromTriangles([...quad(a, b, f, e), ...quad(c, d, e, f), [b, c, f], [d, a, e], ...quad(d, c, b, a)]);
}

/** 사각뿔: 아래 1 × 1, 꼭짓점 (0, 0.5, 0) */
function createPyramidGeometry(): BufferGeometry {
  const h = 0.5;
  const a: Point = [-h, -h, h];
  const b: Point = [h, -h, h];
  const c: Point = [h, -h, -h];
  const d: Point = [-h, -h, -h];
  const top: Point = [0, h, 0];
  return fromTriangles([[a, b, top], [b, c, top], [c, d, top], [d, a, top], ...quad(d, c, b, a)]);
}

/** 사다리꼴 기둥 윗면 한 변(아래 1 기준) */
export const TAPER_TOP = 0.72;

/** 도형 이름 → 단위 지오메트리(새로 만든다. 버리는 쪽이 dispose) */
export function createCharacterGeometry(shape: CharacterShape): BufferGeometry {
  switch (shape) {
    case "box":
      return new BoxGeometry(1, 1, 1);
    case "taper":
      return createTaperGeometry(TAPER_TOP);
    case "cyl":
      return new CylinderGeometry(0.5, 0.5, 1, 6, 1);
    case "cone":
      return new ConeGeometry(0.5, 1, 6, 1);
    case "ball":
      return new SphereGeometry(0.5, 6, 4);
    case "dome":
      // 반구(위쪽 반): y 0 ~ 0.5 → 높이 1로 늘리고 가운데로 내린다
      return new SphereGeometry(0.5, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(1, 2, 1)
        .translate(0, -0.5, 0);
    case "wedge":
      return createWedgeGeometry();
    case "pyramid":
      return createPyramidGeometry();
    default: {
      const unknown: never = shape;
      return unknown;
    }
  }
}

/** 지오메트리의 삼각형 수 */
export function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  return (index ? index.count : geometry.getAttribute("position").count) / 3;
}
