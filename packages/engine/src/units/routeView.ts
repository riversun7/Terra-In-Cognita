// 이동 경로·목적지 표시 — 사용자 요청 2026-11-09 "2차맵에서 이동 클릭시 목적지와 경로를 표시하는 ui 추가".
// - 경로: 고른 유닛(화면이 정한 경로 표시 유닛, setRouteUnit)의 서버 경로를 땅 위 이어진 띠로 그린다(바뀜 2026-11-15 사용자 지적
//   "이동하는 선이 다 끊겨있고" — 점선을 실선으로). 이미 간 부분은 셰이더가 지운다(uTravelled).
//   띠 너비는 화면 픽셀 기준(가까이·멀리 같은 굵기)이라 다시 만들지 않고 유니폼만 바꾼다.
// - 목적지: 누른 자리(명령 직후, 경로가 오기 전에도) 또는 경로 끝에 고리를 둔다.
// - 땅에 가려지지 않게 깊이 검사를 끈다(언덕 뒤 경로도 보인다 — 길 안내용). 선택 고리와 같은 색(HIGHLIGHT_COLOR).
// 계산(자르기·목적지 수명)은 routePath.ts(시험 대상).
import { BufferAttribute, BufferGeometry, Color, Group, Mesh, RingGeometry, ShaderMaterial } from "three";
import { drapeRoute } from "./routePath.ts";
import { HIGHLIGHT_COLOR, OUTLINE_COLOR } from "./unitMaterials.ts";

/** 경로를 자르는 간격(배치 칸) — 땅 높이를 따라가는 정도 */
const ROUTE_STEP_CELLS = 0.4;
/** 꺾이는 모서리 둥글리기 반경(배치 칸) — 각진 꺾임을 부드러운 곡선으로 */
const ROUTE_CORNER_RADIUS_CELLS = 0.42;
/** 땅에서 띄우는 높이(m) */
const ROUTE_LIFT_M = 0.15;
/** 띠 너비(CSS 픽셀)와 최소 너비(m) */
const ROUTE_WIDTH_PX = 7;
const ROUTE_MIN_WIDTH_M = 0.16;
/** 목적지 고리 바깥 반지름(CSS 픽셀 최소)과 m 최소 */
const TARGET_MIN_PX = 18;
const TARGET_MIN_M = 0.68;

const ROUTE_VERTEX = /* glsl */ `
attribute vec2 aNormal;
attribute float aSide;
attribute float aDist;
uniform float uHalfWidth;
varying float vDist;
varying float vSide;
void main() {
  vec3 p = position + vec3(aNormal.x, 0.0, aNormal.y) * aSide * uHalfWidth;
  vDist = aDist;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const ROUTE_FRAGMENT = /* glsl */ `
uniform float uTravelled;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uEdge;
varying float vDist;
varying float vSide;
void main() {
  float head = smoothstep(uTravelled - 0.04, uTravelled + 0.12, vDist);
  if (head <= 0.002) discard;
  float side = abs(vSide);
  float edgeMask = smoothstep(0.56, 0.84, side);
  float coreMask = 1.0 - smoothstep(0.0, 0.58, side);
  // 진행 방향을 은은히 알리는 화살 흐름(선은 실선 유지, 끊김 없음)
  float wave = fract((vDist - side * 0.24) * 0.85 - uTime * 1.45);
  float chevron = smoothstep(0.68, 0.86, wave) * smoothstep(0.99, 0.88, wave) * coreMask;
  vec3 fill = mix(uColor, vec3(1.0, 0.99, 0.92), coreMask * 0.24 + chevron * 0.48);
  vec3 colour = mix(fill, uEdge, edgeMask * 0.88);
  float alpha = smoothstep(1.0, 0.8, side) * 0.94 * head;
  gl_FragColor = vec4(colour, alpha);
}
`;

const TARGET_VERTEX = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TARGET_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uEdge;
varying vec2 vPos;
void main() {
  float r = length(vPos);
  if (r > 1.0) discard;
  // 바깥 고리 + 중심 점 + 외곽선(밝은 풀·눈 위에서도 또렷하게)
  float outerBand = smoothstep(0.58, 0.64, r) * (1.0 - smoothstep(0.82, 0.88, r));
  float outerHalo = smoothstep(0.52, 0.60, r) * (1.0 - smoothstep(0.86, 0.95, r));
  float centerDot = 1.0 - smoothstep(0.22, 0.28, r);
  float centerHalo = 1.0 - smoothstep(0.27, 0.34, r);
  // 안쪽에서 바깥으로 퍼지는 잔물결
  float phase = fract(uTime * 0.85);
  float waveR = 0.28 + phase * 0.54;
  float ripple = smoothstep(0.08, 0.0, abs(r - waveR)) * (1.0 - phase) * 0.55;
  float softFill = (1.0 - smoothstep(0.25, 0.85, r)) * 0.14;
  float bright = clamp(max(outerBand, centerDot) + ripple * 0.7, 0.0, 1.0);
  float outline = clamp(max(outerHalo, centerHalo) - bright, 0.0, 1.0);
  float alpha = clamp(bright * 0.96 + outline * 0.72 + ripple * 0.45 + softFill, 0.0, 0.96);
  if (alpha <= 0.01) discard;
  vec3 brightCol = mix(uColor, vec3(1.0, 0.99, 0.92), centerDot * 0.35 + ripple * 0.35);
  vec3 colour = mix(uEdge, brightCol, clamp(bright + softFill + ripple, 0.0, 1.0));
  gl_FragColor = vec4(colour, alpha);
}
`;

export class RouteView {
  readonly group = new Group();
  private readonly geometry = new BufferGeometry();
  private readonly uniforms = {
    uHalfWidth: { value: 0.2 },
    uTravelled: { value: 0 },
    uTime: { value: 0 },
    uColor: { value: new Color(HIGHLIGHT_COLOR) },
    uEdge: { value: new Color(OUTLINE_COLOR) },
  };
  private readonly material = new ShaderMaterial({
    uniforms: this.uniforms,
    vertexShader: ROUTE_VERTEX,
    fragmentShader: ROUTE_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private readonly line = new Mesh(this.geometry, this.material);
  private readonly targetUniforms = {
    uTime: { value: 0 },
    uColor: { value: new Color(HIGHLIGHT_COLOR) },
    uEdge: { value: new Color(OUTLINE_COLOR) },
  };
  private readonly ringGeometry = new RingGeometry(0, 1, 40).rotateX(-Math.PI / 2);
  private readonly ringMaterial = new ShaderMaterial({
    uniforms: this.targetUniforms,
    vertexShader: TARGET_VERTEX,
    fragmentShader: TARGET_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private readonly ring = new Mesh(this.ringGeometry, this.ringMaterial);
  private builtKey = "";
  private pointCount = 0;
  private lengthCells = 0;

  constructor() {
    this.line.frustumCulled = false;
    this.line.renderOrder = 18;
    this.ring.renderOrder = 19;
    this.line.visible = false;
    this.ring.visible = false;
    this.group.add(this.line, this.ring);
  }

  /** 그린 경로의 잘린 점 수(0이면 경로 없음)와 목적지 표시 여부 — 시험·HUD용 */
  get stats(): { points: number; target: boolean } {
    return { points: this.line.visible ? this.pointCount : 0, target: this.ring.visible };
  }

  /**
   * 경로를 정한다. key가 같으면 다시 만들지 않는다(같은 유닛·같은 경로 판). points = 배치 칸 x, y, …(null이면 숨김).
   * 땅 높이(groundAt)는 만들 때 한 번 읽는다
   */
  setPath(
    key: string,
    points: ArrayLike<number> | null,
    cellM: number,
    groundAt: (wx: number, wz: number) => number,
  ): void {
    if (key === this.builtKey) return;
    this.builtKey = key;
    const route = points ? drapeRoute(points, ROUTE_STEP_CELLS, ROUTE_CORNER_RADIUS_CELLS) : null;
    if (!route) {
      this.pointCount = 0;
      this.lengthCells = 0;
      this.line.visible = false;
      return;
    }
    const n = route.distances.length;
    const positions = new Float32Array(n * 2 * 3);
    const normals = new Float32Array(n * 2 * 2);
    const sides = new Float32Array(n * 2);
    const dists = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const wx = (route.centres[i * 2] ?? 0) * cellM;
      const wz = (route.centres[i * 2 + 1] ?? 0) * cellM;
      const wy = groundAt(wx, wz) + ROUTE_LIFT_M;
      for (let side = 0; side < 2; side++) {
        const v = i * 2 + side;
        positions[v * 3] = wx;
        positions[v * 3 + 1] = wy;
        positions[v * 3 + 2] = wz;
        normals[v * 2] = route.normals[i * 2] ?? 0;
        normals[v * 2 + 1] = route.normals[i * 2 + 1] ?? 0;
        sides[v] = side === 0 ? -1 : 1;
        dists[v] = route.distances[i] ?? 0;
      }
    }
    const index = new Uint32Array((n - 1) * 6);
    for (let i = 0; i + 1 < n; i++) {
      const a = i * 2;
      index.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
    }
    this.geometry.setAttribute("position", new BufferAttribute(positions, 3));
    this.geometry.setAttribute("aNormal", new BufferAttribute(normals, 2));
    this.geometry.setAttribute("aSide", new BufferAttribute(sides, 1));
    this.geometry.setAttribute("aDist", new BufferAttribute(dists, 1));
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.pointCount = n;
    this.lengthCells = route.distances[n - 1] ?? 0;
    this.line.visible = true;
  }

  /**
   * 프레임마다: travelledCells = 이미 간 길이(배치 칸, 그 앞은 지운다), target = 목적지(배치 칸, null이면 숨김),
   * pixelsPerMetre = 목표점에서 1m의 CSS 픽셀(너비·고리 크기용), nowMs = 흐름 애니메이션 시각(ms)
   */
  update(
    travelledCells: number,
    target: { x: number; y: number } | null,
    cellM: number,
    groundAt: (wx: number, wz: number) => number,
    pixelsPerMetre: number,
    nowMs = 0,
  ): void {
    const metresPerPx = pixelsPerMetre > 0 ? 1 / pixelsPerMetre : 0;
    const timeSec = (nowMs % 60_000) / 1000;
    this.uniforms.uHalfWidth.value = Math.max(ROUTE_MIN_WIDTH_M, ROUTE_WIDTH_PX * metresPerPx) / 2;
    this.uniforms.uTravelled.value = travelledCells;
    this.uniforms.uTime.value = timeSec;
    this.targetUniforms.uTime.value = timeSec;
    // 다 갔으면 경로를 숨긴다(셰이더가 모두 지우지만 그리기 호출을 아낀다)
    if (this.pointCount > 0) this.line.visible = travelledCells < this.lengthCells;
    const show = target !== null;
    this.ring.visible = show;
    if (!target) return;
    const wx = target.x * cellM;
    const wz = target.y * cellM;
    const wy = groundAt(wx, wz) + ROUTE_LIFT_M;
    const outer = Math.max(TARGET_MIN_M, TARGET_MIN_PX * metresPerPx);
    this.ring.position.set(wx, wy, wz);
    this.ring.scale.set(outer, 1, outer);
  }

  /** 모두 숨긴다(다음 setPath는 같은 key라도 다시 만든다) */
  clear(): void {
    this.builtKey = "";
    this.pointCount = 0;
    this.lengthCells = 0;
    this.line.visible = false;
    this.ring.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
  }
}
