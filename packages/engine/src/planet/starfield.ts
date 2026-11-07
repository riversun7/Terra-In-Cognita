// 우주 배경 별(1차맵) — 사용자 요청 2026-11-07 "1차맵 확대시 우주 배경이 검은색으로 표현되어야"(ADR 2026-11-07-planet-view 3절).
// 바탕은 검정(planetView.ts SPACE_COLOR)이고 그 위에 흐린 별 점을 뿌린다. 세계 색이라 화면 테마와 상관없다(D-070).
// - 카메라 기준 좌표라 카메라는 원점에 있다: 별은 방향만 쓰고, 셰이더가 먼 자르기 면 바로 앞(z = w × 0.99999)에 놓는다
//   (가까운·먼 자르기 면이 프레임마다 바뀌어도 잘리지 않는다). 카메라 뒤 별은 w < 0이라 잘린다.
// - 맨 먼저 그리고(renderOrder 가장 작음) 깊이는 보지도 쓰지도 않는다 → 행성·바탕 구·대기 띠·달이 늘 덮는다.
// - 점 STAR_COUNT개, 그리기 1번. 자리·밝기는 고정 시드라 늘 같은 하늘이다(판정과 무관, 화면 연출).
import { BufferAttribute, BufferGeometry, Points, ShaderMaterial } from "three";

/** 별 수 */
export const STAR_COUNT = 1400;
/** 고정 시드(늘 같은 하늘) */
const STAR_SEED = 0x5eed_2026;

/** 32비트 시드 난수(mulberry32) — 0 이상 1 미만 */
export function starRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StarArrays {
  /** 단위 방향(x, y, z) × 개수 */
  readonly directions: Float32Array;
  /** 점 크기(CSS px) */
  readonly sizes: Float32Array;
  /** 색(선형 RGB, 밝기를 곱했다) */
  readonly colors: Float32Array;
}

/** 별 자료: 구 위 고른 방향, 대부분 흐리고 작으며 드물게 밝다. 색은 푸른 흰색 ~ 따뜻한 흰색 */
export function starArrays(count = STAR_COUNT, seed = STAR_SEED): StarArrays {
  const random = starRandom(seed);
  const directions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // 구 위 고른 점: z는 [−1, 1] 고르게, 경도는 [0, 2π) 고르게
    const z = random() * 2 - 1;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(Math.max(0, 1 - z * z));
    directions[i * 3] = ring * Math.cos(angle);
    directions[i * 3 + 1] = ring * Math.sin(angle);
    directions[i * 3 + 2] = z;
    // 밝기: 세제곱으로 흐린 별이 많게(0.18 ~ 1)
    const pick = random();
    const brightness = 0.18 + 0.82 * pick * pick * pick;
    sizes[i] = 1 + 1.6 * brightness;
    // 색: 따뜻함 0(푸른 흰색) ~ 1(따뜻한 흰색)
    const warm = random();
    colors[i * 3] = brightness * (0.82 + 0.18 * warm);
    colors[i * 3 + 1] = brightness * (0.86 + 0.08 * warm);
    colors[i * 3 + 2] = brightness * (1 - 0.22 * warm);
  }
  return { directions, sizes, colors };
}

const VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
  // 방향만 쓴다(w = 0): 카메라 회전만 걸린다. 먼 자르기 면 바로 앞에 놓는다
  vec4 clip = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 0.0);
  gl_Position = vec4(clip.xy, clip.w * 0.99999, clip.w);
  gl_PointSize = aSize * uPixelRatio;
  vColor = aColor;
}
`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  // 둥근 점, 가장자리는 바탕(검정)으로 옅게
  float edge = 1.0 - smoothstep(0.2, 0.5, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vColor * edge, 1.0);
}
`;

export class Starfield {
  readonly points: Points<BufferGeometry, ShaderMaterial>;

  constructor(arrays: StarArrays = starArrays()) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(arrays.directions, 3));
    geometry.setAttribute("aSize", new BufferAttribute(arrays.sizes, 1));
    geometry.setAttribute("aColor", new BufferAttribute(arrays.colors, 3));
    const material = new ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1_000_000;
  }

  /** 점 크기를 기기 픽셀 비율에 맞춘다 */
  setPixelRatio(ratio: number): void {
    const uniform = this.points.material.uniforms.uPixelRatio;
    if (uniform) uniform.value = ratio;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
