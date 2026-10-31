// 2차맵 지형 재질 — 윗면 색을 칸 자료 텍스처로 조각(픽셀)마다 칠한다(PLAN 5.7 "셰이더 디테일 … 데이터 격자와 화면 해상도 분리").
// 이유: 꼭짓점 색(칸 11.7m마다 평균)만 쓰면 지표 경계가 칸 1~2개 폭의 흐린 띠가 된다(처음 화면에서 70~240 CSS px).
// 픽셀 비율을 올려도 그대로다(ADR 2026-10-28-s1-second-map "2차맵 선명도").
// - 지표 고르기: 둘레 칸 4개를 읽어(texelFetch) 같은 지표끼리 이중선형 무게를 더하고, 지표마다 다른 잡음을 더해 경계를
//   칸 격자에서 떼어 낸다. 가장 큰 지표를 고르되(soft-argmax) 경계 폭을 화면 한 점 남짓으로 맞춘다(fwidth로 안티에일리어싱).
//   칸 자료가 원본이다: 경계는 원래 자리(무게 0.5)에서 칸 약 ±0.3 안에서만 흔들린다.
// - 잔결: 밝기 ±약 8%, 세 겹(약 0.6·2·6m). 화면 한 점이 덮는 땅이 겹 크기의 반을 넘으면 그 겹을 줄여 없앤다(점무늬·반짝임 막기).
// - 잡음은 셰이더에서 계산하지 않고 작은 이어 붙는 텍스처(256², 밉맵, 이방성 4)에서 읽는다
//   (셰이더 계산 잡음 시제품은 헤드리스에서 프레임 시간이 30~55% 늘었다). 겹마다 돌려 읽어 반복이 겹치지 않게 한다.
//   읽기는 겹마다 한 번(세 번): 경계 흔들기는 6·2m 겹의 지표별 채널, 잔결은 세 겹의 네 채널 평균을 쓴다.
//   네 채널 평균은 경계를 흔드는 채널 차이와 상관이 없어 잔결 밝기가 경계 모양을 따라가지 않는다.
//   잡음 자료는 지형 워커가 처음 한 번 만든다(빌더를 만들 때 먼저 부탁한다, terrainBuilder.ts).
// - 조각 하나: 칸 자료 texelFetch 4번 + 잡음 읽기(삼선형·이방성) 3번 + 계산 약 100번.
// - 높이 밝기·물 아래 어둡게는 꼭짓점 색과 같은 식(terrainTextures.ts HEIGHT_SHADE·heightShadeScale)을 조각마다 계산한다.
//   배율은 높이 폭 0.01m에서 멈춘다(평평한 2차맵에서 보간 오차가 커져 점무늬가 되지 않게).
// - 가장자리 벽(법선 y = 0)은 꼭짓점 색 그대로다. 빛은 MeshLambertMaterial 그대로 쓰고 색 단계만 바꾼다(onBeforeCompile).
// - 텍스처는 CPU 배열을 그대로 들고 있다: 컨텍스트를 잃었다 돌아오면 three가 다시 올린다.
import {
  DataTexture,
  type IUniform,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshLambertMaterial,
  NearestFilter,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector3,
} from "three";
import { PROP_TEXTURE_BYTES, buildPropTextureData } from "../props/propLook.ts";
import { PLACEMENT_CELLS, TERRAIN_CELLS, type TerrainInput } from "./terrainData.ts";
import { NOISE_TEXTURE_SIZE, NOISE_TILE_FEATURES } from "./terrainNoise.ts";
import {
  HEIGHT_SHADE,
  SURFACE_TEXTURE_BYTES,
  buildSurfaceTextureData,
  heightShadeScale,
} from "./terrainTextures.ts";

/** three 프로그램 캐시 키 — 다른 MeshLambertMaterial(유닛 몸통 등)과 프로그램을 나눠 쓰지 않게 따로 준다 */
const PROGRAM_KEY = "terra-terrain-surface";
/** 경계 흔들기 세기(무게 단위). 잡음(−0.5~0.5)에 곱한다 — 경계가 칸 약 ±0.3 안에서 흔들린다 */
const EDGE_WOBBLE = 0.55;
/**
 * 잡음 세 겹: 무늬 크기(m), 경계 흔들기에 섞는 비율(edge), 잔결에 섞는 비율(grain).
 * 잔결 밝기 = 1 + 합 × GRAIN_STRENGTH(합은 대개 −0.5~0.5 → ±약 8%)
 */
const NOISE_LAYERS = [
  { sizeM: 6, edge: 0.7, grain: 0.2 },
  { sizeM: 2, edge: 0.3, grain: 0.35 },
  { sizeM: 0.6, edge: 0, grain: 0.45 },
] as const;
/** 경계 폭: 화면 한 점 사이 무게 차이 변화(fwidth)에 곱한다. 작을수록 날카롭다(약 0.25 → 10~90% 폭 1.3점) */
const EDGE_SOFTNESS = 0.25;
/**
 * 경계 폭의 아래·위 한계(화면 한 점이 덮는 칸 수 pxCells에 곱한다). 보통 경계는 무게 차이가 칸마다 약 2~3 바뀌어
 * 폭이 약 0.5~0.75 × pxCells다. 위 한계가 크면(전 2.5) 칸 가운데 줄에서 탭 창이 바뀌며 무게 0인 이웃 지표가 들어와
 * 차이가 +1 → −1로 뛸 때(미분이 튄다) 폭이 커져, 그 이웃 색이 1점 직선으로 비쳤다(먼 화면, 검토 확인)
 */
const EDGE_TAU_MIN_CELLS = 0.2;
const EDGE_TAU_MAX_CELLS = 0.75;
const GRAIN_STRENGTH = 0.17;
/** 이방성 거르기 배수(기기 상한으로 자른다) */
const NOISE_ANISOTROPY = 4;

const glslFloat = (value: number): string => (Number.isInteger(value) ? `${value}.0` : `${value}`);

/** 겹마다 다른 방향으로 돌려 읽는다(무늬 방향·반복이 겹치지 않게) — 각도(라디안). 더하는 위치는 noiseUv */
const ROTATIONS = [0.52, 1.37, 2.21] as const;
const glslRotation = (angle: number): string => {
  const c = Math.cos(angle).toFixed(6);
  const s = Math.sin(angle).toFixed(6);
  const negativeS = (-Math.sin(angle)).toFixed(6);
  // GLSL mat2는 열 우선: (c, s)가 첫 열 → (x, z)를 angle만큼 돌린다
  return `mat2(${c}, ${s}, ${negativeS}, ${c})`;
};
const noiseUv = (index: number, sizeM: number): string =>
  `${glslRotation(ROTATIONS[index] ?? 0)} * xz * ${glslFloat(1 / (sizeM * NOISE_TILE_FEATURES))} + vec2(${glslFloat(0.17 * (index + 1))}, ${glslFloat(0.29 * (index + 2))})`;
/** 화면 한 점이 덮는 땅(pxM)이 무늬 크기의 반을 넘으면 줄이기 시작해 무늬 크기에서 0 */
const fadeBySize = (sizeM: number): string => `clamp(2.0 - pxM / ${glslFloat(sizeM / 2)}, 0.0, 1.0)`;

/** 안개: 시야 칸 한 변의 수(서버 시야 칸 32×32, packages/sim VISION_SIDE와 같다)와 탐사하지 않은 곳의 밝기 */
const FOG_SIDE = 32;
const FOG_UNEXPLORED = 0.06;

const VERTEX_PARS = /* glsl */ `
varying vec3 vTerrainPos;
varying vec3 vTerrainLocal;
varying float vTerrainUp;
`;

// 세계 자리(잡음·높이)와 이 2차맵 안 자리(칸 자료·안개·소품). 이웃 2차맵은 돌려 놓으므로(경계 너머 보기) 둘이 다르다
const VERTEX_MAIN = /* glsl */ `
vTerrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTerrainLocal = transformed;
vTerrainUp = normal.y;
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vTerrainPos;
varying vec3 vTerrainLocal;
varying float vTerrainUp;
uniform sampler2D uProps;
uniform float uPropsOn;
uniform sampler2D uSurface;
uniform sampler2D uNoise;
uniform float uCellSize;
uniform vec3 uHeight;
uniform sampler2D uFog;
uniform float uFogOn;

// 지표 코드마다 잡음 채널: 0~3은 한 채널씩(서로 다르다), 그 밖의 코드는 두 채널을 섞는다(새 코드도 경계가 흔들린다)
vec4 terrainNoiseMix(float code) {
  float k = mod(code, 4.0);
  vec4 a = vec4(equal(vec4(k), vec4(0.0, 1.0, 2.0, 3.0)));
  if (code < 4.0) return a;
  float j = mod(k + 1.0 + mod(floor(code / 4.0), 3.0), 4.0);
  return (a + vec4(equal(vec4(j), vec4(0.0, 1.0, 2.0, 3.0)))) * 0.70710678;
}

// 지표 순위: rank = (가장 큰 값, 그 코드, 다음 값, 그 코드). 같은 지표가 앞 탭에 있으면(unique = 0) 넘긴다
void terrainRank(float value, float code, float unique, inout vec4 rank) {
  if (unique < 0.5) return;
  if (value > rank.x) rank = vec4(value, code, rank.x, rank.y);
  else if (value > rank.z) rank.zw = vec2(value, code);
}

// 윗면 색(빛 전): 지표 경계 + 잔결 + 높이 밝기 + 소품 색. 미분(fwidth)·밉맵 읽기가 있어 분기 밖에서 부른다.
// 칸 자료·소품은 이 2차맵 안 자리(local), 잡음은 세계 자리(world: 이웃 2차맵과 무늬가 이어진다)로 읽는다
vec3 terrainSurfaceColor(vec3 world, vec3 local) {
  vec2 xz = world.xz;
  // 화면 한 점이 덮는 땅(m, 칸)
  float pxM = max(length(fwidth(xz)), 1e-4);
  float pxCells = pxM / uCellSize;

  // 둘레 칸 4개(칸 가운데가 정수인 좌표). 2차맵 밖은 가장자리 칸
  vec2 p = local.xz / uCellSize - 0.5;
  vec2 base = floor(p);
  vec2 f = p - base;
  ivec2 lo = clamp(ivec2(base), ivec2(0), ivec2(${TERRAIN_CELLS - 1}));
  ivec2 hi = clamp(ivec2(base) + 1, ivec2(0), ivec2(${TERRAIN_CELLS - 1}));
  vec4 t0 = texelFetch(uSurface, lo, 0);
  vec4 t1 = texelFetch(uSurface, ivec2(hi.x, lo.y), 0);
  vec4 t2 = texelFetch(uSurface, ivec2(lo.x, hi.y), 0);
  vec4 t3 = texelFetch(uSurface, hi, 0);
  float c0 = floor(t0.a * 255.0 + 0.5);
  float c1 = floor(t1.a * 255.0 + 0.5);
  float c2 = floor(t2.a * 255.0 + 0.5);
  float c3 = floor(t3.a * 255.0 + 0.5);

  // 이중선형 무게를 같은 지표끼리 더한다(지표마다 이어지는 값)
  float w0 = (1.0 - f.x) * (1.0 - f.y);
  float w1 = f.x * (1.0 - f.y);
  float w2 = (1.0 - f.x) * f.y;
  float w3 = f.x * f.y;
  float s01 = c0 == c1 ? 1.0 : 0.0;
  float s02 = c0 == c2 ? 1.0 : 0.0;
  float s03 = c0 == c3 ? 1.0 : 0.0;
  float s12 = c1 == c2 ? 1.0 : 0.0;
  float s13 = c1 == c3 ? 1.0 : 0.0;
  float s23 = c2 == c3 ? 1.0 : 0.0;
  // 같은 지표는 앞 탭 하나만 센다
  float u1 = 1.0 - s01;
  float u2 = (1.0 - s02) * (1.0 - s12);
  float u3 = (1.0 - s03) * (1.0 - s13) * (1.0 - s23);

  // 잡음 세 겹(겹마다 한 번 읽는다). 겹마다 화면 한 점이 무늬 크기의 반을 넘으면 줄인다(가장 굵은 겹의 경계 흔들기는 밉맵이 맡는다)
  vec4 n0 = texture(uNoise, ${noiseUv(0, NOISE_LAYERS[0].sizeM)}) - 0.5;
  vec4 n1 = texture(uNoise, ${noiseUv(1, NOISE_LAYERS[1].sizeM)}) - 0.5;
  vec4 n2 = texture(uNoise, ${noiseUv(2, NOISE_LAYERS[2].sizeM)}) - 0.5;
  float fade0 = ${fadeBySize(NOISE_LAYERS[0].sizeM)};
  float fade1 = ${fadeBySize(NOISE_LAYERS[1].sizeM)};
  float fade2 = ${fadeBySize(NOISE_LAYERS[2].sizeM)};
  vec4 wobble = (n0 * ${glslFloat(NOISE_LAYERS[0].edge)} + n1 * (${glslFloat(NOISE_LAYERS[1].edge)} * fade1)) * ${glslFloat(EDGE_WOBBLE)};
  float v0 = w0 + s01 * w1 + s02 * w2 + s03 * w3 + dot(wobble, terrainNoiseMix(c0));
  float v1 = w1 + s01 * w0 + s12 * w2 + s13 * w3 + dot(wobble, terrainNoiseMix(c1));
  float v2 = w2 + s02 * w0 + s12 * w1 + s23 * w3 + dot(wobble, terrainNoiseMix(c2));
  float v3 = w3 + s03 * w0 + s13 * w1 + s23 * w2 + dot(wobble, terrainNoiseMix(c3));

  vec4 rank = vec4(v0, c0, -1.0e4, -1.0);
  terrainRank(v1, c1, u1, rank);
  terrainRank(v2, c2, u2, rank);
  terrainRank(v3, c3, u3, rank);
  // 경계를 가로지르며 부호가 바뀌는 차이(코드가 작은 쪽 − 큰 쪽). 지표 하나뿐이면 1(경계에서 멀다)
  float margin = rank.w < 0.0 ? 1.0 : (rank.y < rank.w ? rank.x - rank.z : rank.z - rank.x);
  // 경계 폭(무게 단위): 화면 한 점 사이 변화에 맞춘다. 칸 기울기로 위아래를 묶는다(세 지표가 만나는 곳 등 미분이 튀는 곳)
  float tau = clamp(fwidth(margin) * ${glslFloat(EDGE_SOFTNESS)}, pxCells * ${glslFloat(EDGE_TAU_MIN_CELLS)}, pxCells * ${glslFloat(EDGE_TAU_MAX_CELLS)}) + 1e-5;
  float e0 = exp((v0 - rank.x) / tau);
  float e1 = u1 * exp((v1 - rank.x) / tau);
  float e2 = u2 * exp((v2 - rank.x) / tau);
  float e3 = u3 * exp((v3 - rank.x) / tau);
  vec3 color = (t0.rgb * e0 + t1.rgb * e1 + t2.rgb * e2 + t3.rgb * e3) / (e0 + e1 + e2 + e3);
  // 소품 색(숲·바위 등, 배치 칸 256²): 멀리서도 숲이 보인다(밉맵으로 거른다). 모델은 가까이만 선다(propView.ts)
  vec4 prop = texture(uProps, local.xz / (uCellSize * ${glslFloat(TERRAIN_CELLS)}));
  color = mix(color, prop.rgb, prop.a * uPropsOn);

  // 잔결(밝기): 겹마다 네 채널 평균(× 2 → 한 채널과 같은 퍼짐). 경계를 흔드는 채널 차이와 상관이 없다
  float grain =
    dot(n0, vec4(0.5)) * ${glslFloat(NOISE_LAYERS[0].grain)} * fade0 +
    dot(n1, vec4(0.5)) * ${glslFloat(NOISE_LAYERS[1].grain)} * fade1 +
    dot(n2, vec4(0.5)) * ${glslFloat(NOISE_LAYERS[2].grain)} * fade2;

  // 높이 밝기(꼭짓점 색과 같은 식). 물 높이 경계는 화면 한 점 폭으로 잇는다
  float h = world.y;
  float shade = ${glslFloat(HEIGHT_SHADE.base)} + ${glslFloat(HEIGHT_SHADE.span)} * clamp((h - uHeight.x) * uHeight.y, 0.0, 1.0);
  float fwH = max(fwidth(h), 1e-3);
  shade *= mix(${glslFloat(HEIGHT_SHADE.underwater)}, 1.0, smoothstep(uHeight.z - fwH, uHeight.z + fwH, h));
  return color * shade * (1.0 + grain * ${glslFloat(GRAIN_STRENGTH)});
}
`;

const FRAGMENT_COLOR = /* glsl */ `
{
  // 윗면만 칠한다(가장자리 벽은 법선 y = 0이라 꼭짓점 색 그대로). 계산은 분기 밖(미분이 정의되게)
  vec3 terrainColor = terrainSurfaceColor(vTerrainPos, vTerrainLocal);
  diffuseColor.rgb = vTerrainUp > 0.01 ? terrainColor : diffuseColor.rgb;
  // 안개(S3 시야 전송): 탐사하지 않은 시야 칸은 검게. 시야 칸 32×32 = 지형 칸 4×4, 경계는 선형 거르기로 부드럽게
  if (uFogOn > 0.5) {
    float explored = texture(uFog, vTerrainLocal.xz / (uCellSize * ${glslFloat(TERRAIN_CELLS)})).r;
    diffuseColor.rgb *= mix(${glslFloat(FOG_UNEXPLORED)}, 1.0, explored);
  }
}
`;

/** onBeforeCompile이 주는 셰이더 중 이 재질이 고치는 부분(three의 WebGLProgramParametersWithUniforms와 맞는 모양) */
export interface TerrainShaderSource {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, IUniform>;
}

/**
 * 끼울 자리(three 셰이더 단계의 #include 줄)와 그 바로 뒤에 넣을 코드. 자리마다 원본에 한 번씩 있어야 한다.
 * three를 올려 자리 이름이 바뀌면 replace는 말없이 아무것도 하지 않는다(컴파일 실패 또는 흐린 꼭짓점 색으로 돌아감) —
 * 단위 시험(terrainMaterial.test.ts)이 설치된 three의 Lambert 셰이더로 확인한다
 */
export const TERRAIN_SHADER_INSERTS = {
  vertex: [
    ["#include <common>", VERTEX_PARS],
    ["#include <begin_vertex>", VERTEX_MAIN],
  ],
  fragment: [
    ["#include <common>", FRAGMENT_PARS],
    ["#include <color_fragment>", FRAGMENT_COLOR],
  ],
} as const;

/** 자리마다 그 줄 바로 뒤에 코드를 넣는다(첫 자리 하나만) */
const insertAfterAnchors = (source: string, inserts: readonly (readonly [string, string])[]): string =>
  inserts.reduce((text, [anchor, code]) => text.replace(anchor, `${anchor}\n${code}`), source);

function createSurfaceTexture(data: Uint8Array): DataTexture {
  const texture = new DataTexture(data, TERRAIN_CELLS, TERRAIN_CELLS, RGBAFormat, UnsignedByteType);
  // texelFetch로만 읽는다(거르기 없음)
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/** 소품 색 텍스처: 배치 칸 256², (r, g, b, 세기). 멀리서 거르게 밉맵을 만든다 */
function createPropTexture(data: Uint8Array): DataTexture {
  const texture = new DataTexture(data, PLACEMENT_CELLS, PLACEMENT_CELLS, RGBAFormat, UnsignedByteType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/** 안개 텍스처: 시야 칸 32×32, 빨강 = 탐사함(255) */
function createFogTexture(data: Uint8Array): DataTexture {
  const texture = new DataTexture(data, FOG_SIDE, FOG_SIDE, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function createNoiseTexture(data: Uint8Array): DataTexture {
  const texture = new DataTexture(data, NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE, RGBAFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = NOISE_ANISOTROPY;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/** 지형 재질(TerrainView가 하나 들고 지형이 바뀔 때마다 setTerrain으로 자료를 바꾼다) */
export class TerrainMaterial {
  readonly material = new MeshLambertMaterial({ vertexColors: true });
  private readonly surfaceData = new Uint8Array(SURFACE_TEXTURE_BYTES);
  private readonly surfaceTexture = createSurfaceTexture(this.surfaceData);
  /** 잡음 텍스처(처음 setTerrain 때 만든다 — 자료는 지형 워커가 만든다) */
  private noiseTexture: DataTexture | null = null;
  private readonly fogData = new Uint8Array(FOG_SIDE * FOG_SIDE * 4);
  private readonly fogTexture = createFogTexture(this.fogData);
  private readonly propData = new Uint8Array(PROP_TEXTURE_BYTES);
  private readonly propTexture = createPropTexture(this.propData);
  /** 셰이더와 같은 객체를 나눠 쓴다(값만 바꾸면 다음 그리기에 들어간다) */
  private readonly uniforms: {
    uSurface: { value: DataTexture };
    uNoise: { value: DataTexture | null };
    uCellSize: { value: number };
    uHeight: { value: Vector3 };
    uFog: { value: DataTexture };
    uFogOn: { value: number };
    uProps: { value: DataTexture };
    uPropsOn: { value: number };
  } = {
    uSurface: { value: this.surfaceTexture },
    uNoise: { value: null },
    uCellSize: { value: 1 },
    /** (가장 낮은 땅 m, 1 / 높이 폭, 물 높이 m) */
    uHeight: { value: new Vector3(0, 1, 0) },
    uFog: { value: this.fogTexture },
    uFogOn: { value: 0 },
    uProps: { value: this.propTexture },
    uPropsOn: { value: 0 },
  };

  constructor() {
    this.material.onBeforeCompile = (shader) => this.patchShader(shader);
    this.material.customProgramCacheKey = () => PROGRAM_KEY;
  }

  /** three가 프로그램을 만들기 전에 부른다(onBeforeCompile): 유니폼을 잇고 색 단계를 끼운다. 단위 시험도 이것을 부른다 */
  patchShader(shader: TerrainShaderSource): void {
    Object.assign(shader.uniforms, this.uniforms);
    shader.vertexShader = insertAfterAnchors(shader.vertexShader, TERRAIN_SHADER_INSERTS.vertex);
    shader.fragmentShader = insertAfterAnchors(shader.fragmentShader, TERRAIN_SHADER_INSERTS.fragment);
  }

  /**
   * 지형 자료를 넣는다: 칸 자료 텍스처를 다시 쓰고, 칸 크기·높이 범위·물 높이를 바꾼다.
   * noise는 잡음 텍스처 자료(RGBA8 256², buildNoiseTextureData) — 바뀌지 않는 그림이라 처음 받은 것을 계속 쓴다
   */
  setTerrain(input: TerrainInput, minHeightM: number, maxHeightM: number, noise: Uint8Array): void {
    if (!this.noiseTexture) {
      this.noiseTexture = createNoiseTexture(noise);
      this.uniforms.uNoise.value = this.noiseTexture;
    }
    buildSurfaceTextureData(input.surface, this.surfaceData);
    this.surfaceTexture.needsUpdate = true;
    this.uniforms.uCellSize.value = input.cellSizeM;
    // 높이 비율 배율은 꼭짓점 색과 같은 함수(폭이 0에 가까워도 0.01m로 본다 — 평평한 2차맵의 점무늬 막기)
    this.uniforms.uHeight.value.set(minHeightM, heightShadeScale(minHeightM, maxHeightM), input.waterLevelM);
    if (input.art && input.cover) {
      buildPropTextureData(input.art, input.cover, this.propData);
      this.propTexture.needsUpdate = true;
      this.uniforms.uPropsOn.value = 1;
    } else {
      this.uniforms.uPropsOn.value = 0;
    }
  }

  /**
   * 탐사 칸(시야 칸 32×32 비트, 128바이트, 칸 번호 = y × 32 + x, 비트 = 번호 & 7). null이면 안개를 끈다(관리자 전체 보기)
   */
  setExplored(bits: Uint8Array | null): void {
    if (!bits) {
      this.uniforms.uFogOn.value = 0;
      return;
    }
    for (let index = 0; index < FOG_SIDE * FOG_SIDE; index++) {
      const on = ((bits[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
      this.fogData[index * 4] = on ? 255 : 0;
    }
    this.fogTexture.needsUpdate = true;
    this.uniforms.uFogOn.value = 1;
  }

  dispose(): void {
    this.material.dispose();
    this.fogTexture.dispose();
    this.propTexture.dispose();
    this.surfaceTexture.dispose();
    this.noiseTexture?.dispose();
  }
}
