// 유닛용 재질 — 외곽선(화면 픽셀 두께)과 원거리 점(아이콘). ADR 2026-10-28-unit-display-real-size(25)
// - 외곽선: 같은 모양을 뒷면만 그리며 법선 방향으로 화면에서 N픽셀 밀어낸다(inverted hull). 거리와 상관없이 두께가 같다.
//   유닛 인스턴스 행렬을 그대로 쓴다(USE_INSTANCING). 선택 표시(하나)는 인스턴스 없이 같은 재질을 쓴다.
// - 점: gl_PointSize로 화면 픽셀 크기가 같은 동그라미 + 테두리. 색은 유닛마다(aColor).
// - 몸: MeshLambertMaterial(인스턴스 색). 밤에는 자기 색의 일부를 스스로 낸다(밤 빛, 2차맵 낮밤) — 땅보다 밝게 남아 유닛이 먼저 보인다.
//   외곽선·점·고른 표시는 빛을 받지 않아 밤에도 그대로다.
import { BackSide, Color, type IUniform, MeshLambertMaterial, ShaderMaterial } from "three";

/** 외곽선·점 테두리 색 — 화면 글자색과 같은 짙은 남색(파스텔 위에서 잘 보인다) */
export const OUTLINE_COLOR = 0x22324a;
/** 고른 유닛 표시 색 — 디자인 시스템의 강조색(--color-highlight) */
export const HIGHLIGHT_COLOR = 0xffd66e;

const OUTLINE_VERTEX = /* glsl */ `
uniform float uWidthPx;
uniform vec2 uViewport;
void main() {
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 clip = projectionMatrix * modelViewMatrix * local;
  vec3 viewNormal = normalize(mat3(modelViewMatrix) * n);
  vec2 dir = (projectionMatrix * vec4(viewNormal, 0.0)).xy;
  float len = length(dir);
  if (len > 1e-5) dir /= len;
  clip.xy += dir * uWidthPx * 2.0 / uViewport * clip.w;
  gl_Position = clip;
}
`;

const OUTLINE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
}
`;

/** 외곽선 재질. widthPx는 CSS 픽셀(그릴 때 픽셀 비율을 곱해 넣는다: setOutlineViewport) */
export function createOutlineMaterial(color: number, widthPx: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uWidthPx: { value: widthPx },
      uViewport: { value: [1, 1] },
    },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: BackSide,
    userData: { widthCssPx: widthPx },
  });
}

/** 점 가장자리를 섞을 자리: 원(지름 uSize)보다 양쪽으로 이만큼(그리기 버퍼 점) 크게 그린다 */
const DOT_EDGE_PX = 1;
/** 채움 반지름(지름 = 1 기준). 0.33~0.5가 테두리 — 테두리 두께는 지름의 0.17 */
const DOT_FILL_RADIUS = 0.33;

const DOT_VERTEX = /* glsl */ `
attribute vec3 aColor;
uniform float uSize;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize + ${2 * DOT_EDGE_PX}.0;
}
`;

// 가장자리·테두리 경계를 화면 한 점 폭으로 부드럽게 한다(MSAA는 discard로 자른 가장자리를 다듬지 못해 계단이 보였다).
// 섞는 띠는 원래 경계(바깥 r = 0.5, 채움 r = 0.33)의 가운데에 둔다. 띠의 바깥 반이 들어갈 자리를 두려고 점을 양쪽
// DOT_EDGE_PX씩 크게 그린다. 그래서 보이는 크기와 테두리 두께가 계단 있던 때와 같다
// (띠를 원 안쪽에만 두었더니 진한 테두리가 상한 2에서 약 2.4 → 0.6점, 상한 1.5에서 거의 0이 됐다, 검토 확인).
// 반투명 목록에서 그린다(재질 transparent): 가장자리는 알파로 섞인다
const DOT_FRAGMENT = /* glsl */ `
uniform float uSize;
uniform vec3 uOutline;
varying vec3 vColor;
void main() {
  // r: 원 지름(uSize)을 1로 본 중심 거리 — 0.5가 원 가장자리다(그린 점은 원보다 양쪽 ${DOT_EDGE_PX}점 크다)
  float r = length(gl_PointCoord - vec2(0.5)) * (uSize + ${2 * DOT_EDGE_PX}.0) / max(uSize, 1.0);
  float aa = max(fwidth(r), 1e-4);
  float alpha = 1.0 - smoothstep(0.5 - aa * 0.5, 0.5 + aa * 0.5, r);
  if (alpha <= 0.0) discard;
  vec3 color = mix(vColor, uOutline, smoothstep(${DOT_FILL_RADIUS} - aa * 0.5, ${DOT_FILL_RADIUS} + aa * 0.5, r));
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}
`;

/** 점 재질. sizePx는 CSS 픽셀. 늘 위에 보이게 깊이 검사를 하지 않는다(아이콘). 가장자리를 알파로 섞으려면 transparent를 켠다 */
export function createDotMaterial(sizePx: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSize: { value: sizePx },
      uOutline: { value: new Color(OUTLINE_COLOR) },
    },
    vertexShader: DOT_VERTEX,
    fragmentShader: DOT_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    userData: { sizeCssPx: sizePx },
  });
}

/**
 * 유닛 몸 셰이더에 끼울 자리(three Lambert 조각 셰이더의 #include 줄)와 그 뒤에 넣을 코드. diffuseColor에는 이미 인스턴스 색이
 * 곱해져 있다(color_fragment). three를 올려 자리 이름이 바뀌면 replace가 말없이 아무것도 하지 않으므로 시험이 확인한다
 */
export const UNIT_BODY_SHADER_INSERT = {
  anchor: "#include <emissivemap_fragment>",
  code: "totalEmissiveRadiance += diffuseColor.rgb * uNightLift;",
  pars: ["#include <common>", "uniform float uNightLift;"],
} as const;

/** three 프로그램 캐시 키 — 건물·물 판(같은 Lambert)과 프로그램을 나눠 쓰지 않게 따로 준다 */
const UNIT_BODY_PROGRAM_KEY = "terra-unit-body";

/** 유닛 몸 재질: 인스턴스 색 Lambert + 밤 빛(uNightLift, 0이면 지금과 같다) */
export class UnitBodyMaterial {
  readonly material = new MeshLambertMaterial({ color: 0xffffff });
  private readonly uniforms: { uNightLift: IUniform<number> } = { uNightLift: { value: 0 } };

  constructor() {
    this.material.onBeforeCompile = (shader) => this.patchShader(shader);
    this.material.customProgramCacheKey = () => UNIT_BODY_PROGRAM_KEY;
  }

  /** onBeforeCompile: 유니폼을 잇고 밤 빛 줄을 끼운다(단위 시험도 이것을 부른다) */
  patchShader(shader: { fragmentShader: string; uniforms: Record<string, IUniform> }): void {
    Object.assign(shader.uniforms, this.uniforms);
    const { anchor, code, pars } = UNIT_BODY_SHADER_INSERT;
    shader.fragmentShader = shader.fragmentShader
      .replace(pars[0], `${pars[0]}\n${pars[1]}`)
      .replace(anchor, `${anchor}\n${code}`);
  }

  /** 밤 빛(자기 색 × 값). 0 이상 */
  setNightLift(value: number): void {
    this.uniforms.uNightLift.value = Math.max(0, value);
  }

  get nightLift(): number {
    return this.uniforms.uNightLift.value;
  }
}

/** 그리기 버퍼 크기·픽셀 비율이 바뀌면 화면 픽셀 기준 값을 다시 넣는다 */
export function applyPixelScale(
  material: ShaderMaterial,
  drawingWidth: number,
  drawingHeight: number,
  pixelRatio: number,
): void {
  const uniforms = material.uniforms;
  const outlineWidth = material.userData["widthCssPx"];
  if (typeof outlineWidth === "number" && uniforms["uWidthPx"] && uniforms["uViewport"]) {
    uniforms["uWidthPx"].value = outlineWidth * pixelRatio;
    uniforms["uViewport"].value = [Math.max(1, drawingWidth), Math.max(1, drawingHeight)];
  }
  const dotSize = material.userData["sizeCssPx"];
  if (typeof dotSize === "number" && uniforms["uSize"]) uniforms["uSize"].value = dotSize * pixelRatio;
}
