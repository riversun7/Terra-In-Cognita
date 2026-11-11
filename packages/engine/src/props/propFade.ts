// 유닛 앞 소품 옅게 — 기획 질문 996 다(D-523 포인터): 2차맵에 들어오면 가장 가까이(6/6) 그대로 두고, 카메라와 내가 고른(따라가는) 유닛 사이의
// 나무·큰 소품을 반쯤 비쳐 유닛이 늘 보이게 한다.
// - 방법: 스크린 도어(화면 4×4 점 무늬로 조각을 버림). 카메라 → 유닛 몸 가운데 선분에서 반지름 안의 조각만, 가운데일수록 많이(최대 FADE_MAX)
//   버린다. 불투명 그리기 그대로라 정렬·투명 그리기·그리기 호출이 늘지 않고, 프레임마다 uniform 넷만 바꾼다.
// - 유닛 너머(선분 끝 뒤)는 버리지 않는다(뒤 숲은 그대로). 판정과 상관없는 그림이다.
import type { Material, Vector3Like } from "three";
import { Vector3 } from "three";

/** 가장 가운데에서 버리는 조각 몫(0~1). 1이면 구멍처럼 보여 반쯤만 */
export const FADE_MAX = 0.7;

export interface PropFade {
  readonly uniforms: {
    readonly uPropFadeFrom: { value: Vector3 };
    readonly uPropFadeTo: { value: Vector3 };
    readonly uPropFadeRadius: { value: number };
    readonly uPropFadeOn: { value: number };
  };
}

export function createPropFade(): PropFade {
  return {
    uniforms: {
      uPropFadeFrom: { value: new Vector3() },
      uPropFadeTo: { value: new Vector3() },
      uPropFadeRadius: { value: 0 },
      uPropFadeOn: { value: 0 },
    },
  };
}

/** 점 (x, y, z)에서 선분 from → to까지 거리(m)와 가장 가까운 자리 t(0 = from, 1 = to) — 셰이더와 같은 식(시험·HUD) */
export function segmentDistance(
  from: Vector3Like,
  to: Vector3Like,
  x: number,
  y: number,
  z: number,
): { distance: number; t: number } {
  const abx = to.x - from.x;
  const aby = to.y - from.y;
  const abz = to.z - from.z;
  const length2 = Math.max(1e-4, abx * abx + aby * aby + abz * abz);
  const t = Math.min(
    1,
    Math.max(0, ((x - from.x) * abx + (y - from.y) * aby + (z - from.z) * abz) / length2),
  );
  const dx = x - (from.x + abx * t);
  const dy = y - (from.y + aby * t);
  const dz = z - (from.z + abz * t);
  return { distance: Math.sqrt(dx * dx + dy * dy + dz * dz), t };
}

const VERTEX_HEAD = /* glsl */ `#include <common>
varying vec3 vPropFadeWorld;`;

const VERTEX_BODY = /* glsl */ `#include <project_vertex>
vec4 propFadeWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
propFadeWorld = instanceMatrix * propFadeWorld;
#endif
vPropFadeWorld = ( modelMatrix * propFadeWorld ).xyz;`;

const FRAGMENT_HEAD = /* glsl */ `#include <common>
varying vec3 vPropFadeWorld;
uniform vec3 uPropFadeFrom;
uniform vec3 uPropFadeTo;
uniform float uPropFadeRadius;
uniform float uPropFadeOn;`;

// 4×4 베이어 차례로 문턱을 정해 화면 점 무늬로 버린다
const FRAGMENT_BODY = /* glsl */ `#include <clipping_planes_fragment>
if ( uPropFadeOn > 0.5 ) {
  vec3 propAb = uPropFadeTo - uPropFadeFrom;
  float propT = clamp( dot( vPropFadeWorld - uPropFadeFrom, propAb ) / max( dot( propAb, propAb ), 1e-4 ), 0.0, 1.0 );
  float propD = length( vPropFadeWorld - ( uPropFadeFrom + propAb * propT ) );
  float propFade = ( 1.0 - smoothstep( uPropFadeRadius * 0.55, uPropFadeRadius, propD ) ) * step( propT, 0.999 ) * ${FADE_MAX.toFixed(2)};
  ivec2 propP = ivec2( mod( gl_FragCoord.xy, 4.0 ) );
  int propX = propP.x ^ propP.y;
  int propB = ( propX & 1 ) * 8 + ( propP.y & 1 ) * 4 + ( ( propX >> 1 ) & 1 ) * 2 + ( ( propP.y >> 1 ) & 1 );
  if ( propFade > ( float( propB ) + 0.5 ) / 16.0 ) discard;
}`;

/** 셰이더 원문 모양(three onBeforeCompile 인자의 필요한 칸) */
export interface FadeShader {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
}

/** 셰이더에 옅게 조각과 값을 넣는다(시험이 바로 부른다) */
export function patchFadeShader(shader: FadeShader, fade: PropFade): void {
  Object.assign(shader.uniforms, fade.uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", VERTEX_HEAD)
    .replace("#include <project_vertex>", VERTEX_BODY);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", FRAGMENT_HEAD)
    .replace("#include <clipping_planes_fragment>", FRAGMENT_BODY);
}

/** 재질에 옅게 조각을 넣는다(같은 fade 값을 모든 부품 재질이 함께 쓴다). 넣은 재질을 돌려준다 */
export function fadeMaterial<M extends Material>(material: M, fade: PropFade): M {
  material.onBeforeCompile = (shader) => patchFadeShader(shader, fade);
  material.customProgramCacheKey = () => "terra-prop-fade";
  return material;
}
