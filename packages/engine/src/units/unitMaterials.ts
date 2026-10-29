// 유닛용 재질 — 외곽선(화면 픽셀 두께)과 원거리 점(아이콘). ADR 2026-10-28-unit-display-real-size(25)
// - 외곽선: 같은 모양을 뒷면만 그리며 법선 방향으로 화면에서 N픽셀 밀어낸다(inverted hull). 거리와 상관없이 두께가 같다.
//   유닛 인스턴스 행렬을 그대로 쓴다(USE_INSTANCING). 선택 표시(하나)는 인스턴스 없이 같은 재질을 쓴다.
// - 점: gl_PointSize로 화면 픽셀 크기가 같은 동그라미 + 테두리. 색은 유닛마다(aColor).
import { BackSide, Color, ShaderMaterial } from "three";

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

const DOT_VERTEX = /* glsl */ `
attribute vec3 aColor;
uniform float uSize;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
}
`;

// 가장자리·테두리 경계를 화면 한 점 폭으로 부드럽게 한다(MSAA는 discard로 자른 가장자리를 다듬지 못해 계단이 보였다).
// 반투명 목록에서 그린다(재질 transparent): 가장자리는 알파로 섞인다
const DOT_FRAGMENT = /* glsl */ `
uniform vec3 uOutline;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r = length(c);
  float aa = max(fwidth(r), 1e-4);
  float alpha = 1.0 - smoothstep(0.5 - aa, 0.5, r);
  if (alpha <= 0.0) discard;
  vec3 color = mix(vColor, uOutline, smoothstep(0.33 - aa * 0.5, 0.33 + aa * 0.5, r));
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
