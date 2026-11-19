// 1차맵 재질 — WebGL2 + 짧은 GLSL(three ShaderMaterial, ADR 36 "셰이더 언어: 지금은 WebGL2 + GLSL").
// - 타일: 꼭짓점 셰이더가 높이를 올리고(max(높이, 0) × 과장), 치마는 모든 타일이 같은 바닥(해수면 − uSkirtDepth)까지 내린다.
//   법선 = 정규화(위쪽 − 과장 × 기울기). 올리는 식은 tileMesh.ts vertexLiftM과 같다(시험은 그 함수로 본다).
//   조각 셰이더가 칸 자료 텍스처를 칸마다 그대로 읽어(texelFetch) 레이어 색을 고르고, 보기 공간 빛으로 음영을 넣는다.
// - 빛은 카메라에 붙인다(화면 왼쪽 위에서): 어느 쪽을 돌려 봐도 밝다(하늘을 끄면 밤이 없다).
// - 하늘을 켜면(ADR 2026-10-29-primary-map-sky 4절) 항성 기준 낮밤: 매끈한 구 위쪽 · 항성 방향(sunCos)으로 낮밤을 정하고,
//   기복은 카메라 빛의 경사만 쓴다(평지 0). uSkyBlend 0이면 지금 식 그대로다(하늘 끔·시계 전), 1이면 항성 낮밤, 사이는 켜지는 중.
//   고른 칸 표시는 하늘을 켜면 빛 뒤에 얹는다(밤에도 밝게). 값은 skyShade.ts DAY_NIGHT_SHADE(셰이더와 같은 식의 JS판도 거기).
// - 세계 색은 화면 테마와 상관없다(D-070). 색 관리를 끈 렌더러(sharedRenderer.ts)라 적은 값이 그대로 보인다.
// - 모든 타일 재질은 같은 셰이더(프로그램 하나)이고, 함께 쓰는 값(레이어·과장·치마 바닥·빛·바이옴 색·고른 칸·하늘)은 같은 uniform 객체를 나눠 쓴다.
//   하늘 모드를 바꿔도 uniform 값만 바뀌어 다시 컴파일하지 않는다(setSky).
import {
  BackSide,
  Color,
  DataArrayTexture,
  DataTexture,
  FrontSide,
  LinearMipmapLinearFilter,
  NearestFilter,
  RGBAFormat,
  RGFormat,
  RedFormat,
  ShaderMaterial,
  type Texture,
  UnsignedByteType,
  Vector3,
  Vector4,
} from "three";
// 물 비트는 planetTileShader.ts가 @terra/planet 정의를 셰이더 문자열에 넣는다
import type { PlanetLayer } from "./planetTypes.ts";
import { TILE_COLORS, buildTileFragmentShader } from "./planetTileShader.ts";
import { DAY_NIGHT_BAND } from "./sky.ts";
import { DAY_NIGHT_SHADE } from "./skyShade.ts";

/** 바탕 구(아직 타일이 없는 곳) 색 = 심해 */
export const BASE_GLOBE_COLOR = TILE_COLORS.deep;
/** 틈 찾기(시험) 색 */
export const DEBUG_CRACK_COLOR = 0xff00ff;

/** 빛 방향(보기 공간): 화면 왼쪽 위 앞에서 */
const LIGHT_DIRECTION = new Vector3(-0.45, 0.62, 0.64).normalize();

/** 하늘 빛 uniform — 타일·바탕 구·달·구름이 같은 객체를 나눠 쓰고 엔진이 프레임마다 한 번 고친다 */
export interface SkyLightUniforms {
  /** 0 = 지금 빛(카메라, 하늘 끔·시계 전), 1 = 항성 낮밤, 사이 = 켜지는 중 */
  uSkyBlend: { value: number };
  /** 항성 방향(행성 좌표, 단위 벡터) */
  uSunDir: { value: Vector3 };
  /** 항성 방향(보기 공간) — 물 반짝임·달 위상 */
  uSunDirView: { value: Vector3 };
  /** x 밤 빛 곱, y 띠 아래(sunCos), z 띠 위, w 낮밤 세기(0 = 늘 낮) */
  uNight: { value: Vector4 };
  /** 밤 색 곱(라벤더) */
  uNightTint: { value: Vector3 };
  /** rgb 박명 색 곱, a 띠 가운데 양 */
  uTwilight: { value: Vector4 };
  /** x 낮 램버트 비중, y 깊은 밤 채도 빼기, z 기복 이득, w 낮 밝기 */
  uShade: { value: Vector4 };
  /** 밤에 어두운 색을 들어 올리는 더하기 색 */
  uNightLift: { value: Vector3 };
}

/** 모든 타일이 함께 쓰는 uniform(같은 객체를 나눠 쓴다) */
export interface SharedTileUniforms extends SkyLightUniforms {
  uExaggeration: { value: number };
  /** 치마 바닥 깊이(해수면 아래 m, tileShape.ts skirtDepthM) — 행성마다 하나, 과장과 상관없다 */
  uSkirtDepth: { value: number };
  /** 0 지형, 1 기후, 2 고도, 3 자원 분포, 4 영토(LAYER_INDEX) */
  uLayer: { value: number };
  /** 고도 레이어 색 띠의 꼭대기(게임 m) = 엔진의 가장 높은 땅 */
  uElevationMax: { value: number };
  /** 자원 분포 지도(면 6장 배열 텍스처, R = 몫)와 높은 티어 광석 몫(R). 지도가 없으면 1×1 빈 텍스처 */
  uResource: { value: Texture };
  uResourceHigh: { value: Texture };
  /** 고른 원자재 색 */
  uResourceColor: { value: Vector3 };
  /** 1 = 자원 분포 지도가 있다(없으면 흐린 바탕만) */
  uResourceReady: { value: number };
  uLightDir: { value: Vector3 };
  uPalette: { value: Texture };
  /** 고른 칸: (s0, t0, 한 변 길이, 면) — 면이 −1이면 없음 */
  uPick: { value: Vector4 };
}

/** 하늘 빛 출발값(끔: 섞기 0·세기 0). 값은 DAY_NIGHT_SHADE·DAY_NIGHT_BAND 한곳에서 온다 */
function createSkyLightUniforms(): SkyLightUniforms {
  const s = DAY_NIGHT_SHADE;
  return {
    uSkyBlend: { value: 0 },
    uSunDir: { value: new Vector3(1, 0, 0) },
    uSunDirView: { value: new Vector3(0, 0, 1) },
    uNight: { value: new Vector4(s.nightLight, DAY_NIGHT_BAND.low, DAY_NIGHT_BAND.high, 0) },
    uNightTint: { value: new Vector3(...s.nightTint) },
    uTwilight: { value: new Vector4(...s.twilightTint, s.twilightAmount) },
    uShade: { value: new Vector4(s.dayLambert, s.nightDesaturate, s.reliefGain, s.dayLight) },
    uNightLift: { value: new Vector3(...s.nightLift) },
  };
}

/** 레이어 → 셰이더 번호(uLayer) */
export const LAYER_INDEX: Readonly<Record<PlanetLayer, number>> = {
  terrain: 0,
  climate: 1,
  elevation: 2,
  resource: 3,
  territory: 4,
};

/** 빈 배열 텍스처(1×1×1, 값 0) — 자원 분포 지도가 없을 때 sampler2DArray 자리를 채운다 */
export function createEmptyLayerTexture(): DataArrayTexture {
  return createLayerTexture(new Uint8Array(1), 1, 1);
}

/**
 * 면 6장(또는 depth장) 배열 텍스처(R8, 한 변 size): 자원 분포 지도. 가까이선 칸이 또렷하게(가장 가까운 칸), 멀리선 밉맵으로 고르게(몫 평균).
 * 자료 배열 번호 = 면 × size² + j × size + i(줄 = j) — 셰이더는 (s, t, 면)으로 읽는다
 */
export function createLayerTexture(data: Uint8Array, size: number, depth: number): DataArrayTexture {
  const texture = new DataArrayTexture(data, size, size, depth);
  texture.format = RedFormat;
  texture.type = UnsignedByteType;
  texture.magFilter = NearestFilter;
  texture.minFilter = size > 1 ? LinearMipmapLinearFilter : NearestFilter;
  texture.generateMipmaps = size > 1;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function createSharedTileUniforms(
  biomeColors: readonly number[],
  skirtDepthM: number,
): SharedTileUniforms {
  return {
    uExaggeration: { value: 1 },
    uSkirtDepth: { value: skirtDepthM },
    uLayer: { value: 0 },
    uElevationMax: { value: 1000 },
    uResource: { value: createEmptyLayerTexture() },
    uResourceHigh: { value: createEmptyLayerTexture() },
    uResourceColor: { value: new Vector3(1, 1, 1) },
    uResourceReady: { value: 0 },
    uLightDir: { value: LIGHT_DIRECTION.clone() },
    uPalette: { value: createPaletteTexture(biomeColors) },
    uPick: { value: new Vector4(0, 0, 0, -1) },
    ...createSkyLightUniforms(),
  };
}

/** 하늘 빛 uniform만 골라 낸다(달·구름·바탕 구 재질이 같은 객체를 쓴다) */
export function skyLightUniformsOf(shared: SkyLightUniforms): SkyLightUniforms {
  return {
    uSkyBlend: shared.uSkyBlend,
    uSunDir: shared.uSunDir,
    uSunDirView: shared.uSunDirView,
    uNight: shared.uNight,
    uNightTint: shared.uNightTint,
    uTwilight: shared.uTwilight,
    uShade: shared.uShade,
    uNightLift: shared.uNightLift,
  };
}

/**
 * 낮밤 GLSL 조각(타일·바탕 구·구름이 같이 쓴다, 셰이더와 같은 식의 JS판은 skyShade.ts shadeColor).
 * dayNightLight(sunCos, out day): 빛 곱. day = smoothstep(띠 아래, 띠 위, sunCos), 낮 쪽 = 낮 밝기 × (1 − 램버트 비중 × (1 − √sunCos)),
 * 밤 쪽 = 라벤더 × 밤 빛 곱, 박명 = 띠 가운데에서 따뜻한 색 곱. 세기(uNight.w) 0이면 늘 낮 밝기 하나다.
 * nightFinish(color, day): 깊은 밤 채도 빼기(밤 정도의 제곱)와 어두운 색 들어 올리기.
 */
export const DAY_NIGHT_GLSL = /* glsl */ `
uniform float uSkyBlend;
uniform vec4 uNight;
uniform vec3 uNightTint;
uniform vec4 uTwilight;
uniform vec4 uShade;
uniform vec3 uNightLift;
vec3 dayNightLight(float sunCos, out float day) {
  day = smoothstep(uNight.y, uNight.z, sunCos);
  float dayLight = uShade.w * (1.0 - uShade.x * (1.0 - sqrt(clamp(sunCos, 0.0, 1.0))));
  vec3 light = mix(uNightTint * uNight.x, vec3(dayLight), day);
  light *= mix(vec3(1.0), uTwilight.rgb, uTwilight.a * 4.0 * day * (1.0 - day));
  return mix(vec3(uShade.w), light, uNight.w);
}
vec3 nightFinish(vec3 color, float day) {
  float night = (1.0 - day) * uNight.w;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  return mix(color, vec3(lum), uShade.y * (1.0 - day) * night) + uNightLift * night;
}
`;

/** 바이옴 색 표(256×1). 없는 번호는 회색 */
function createPaletteTexture(biomeColors: readonly number[]): DataTexture {
  const data = new Uint8Array(256 * 4);
  const color = new Color();
  for (let i = 0; i < 256; i++) {
    color.setHex(biomeColors[i] ?? TILE_COLORS.unknownBiome);
    data[i * 4] = Math.round(color.r * 255);
    data[i * 4 + 1] = Math.round(color.g * 255);
    data[i * 4 + 2] = Math.round(color.b * 255);
    data[i * 4 + 3] = 255;
  }
  const texture = new DataTexture(data, 256, 1, RGBAFormat, UnsignedByteType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** 칸 자료 텍스처(cells × cells). RGBA(바이옴·물·기온·습도) 또는 RG(숲·하천) */
export function createCellTexture(data: Uint8Array, cells: number, channels: 2 | 4): DataTexture {
  const texture = new DataTexture(
    data,
    cells,
    cells,
    channels === 4 ? RGBAFormat : RGFormat,
    UnsignedByteType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  // RG 한 줄이 4바이트 배수가 아닐 수 있다(면 전체 타일 1칸 = 2바이트)
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

// 하늘용 varying 둘(vSunCos = 매끈한 구 위쪽 · 항성 방향, vUpView = 보기 공간 위쪽)은 하늘을 꺼도 계산하지만 쓰지 않는다
const TILE_VERTEX = /* glsl */ `
uniform vec3 uOrigin;
uniform float uExaggeration;
uniform float uSkirtDepth;
uniform vec3 uSunDir;
attribute vec3 grad;
attribute vec2 hs;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vUpView;
varying float vSunCos;
varying float vHeight;

void main() {
  vHeight = hs.x;
  // 위쪽 = 행성 중심에서 이 점으로(원점 + 위치, 32비트로도 방향은 충분히 정확하다)
  vec3 up = normalize(uOrigin + position);
  // 치마(hs.y = 1)는 바닥까지, 나머지는 보이는 높이까지(vertexLiftM과 같은 식)
  float lift = hs.y > 0.5 ? -uSkirtDepth : max(hs.x, 0.0) * uExaggeration;
  vec3 local = position + up * lift;
  vec3 n = normalize(up - uExaggeration * grad);
  vec4 viewPosition = modelViewMatrix * vec4(local, 1.0);
  vViewPosition = viewPosition.xyz;
  vNormal = normalize(normalMatrix * n);
  vUpView = normalMatrix * up;
  vSunCos = dot(up, uSunDir);
  vUv = uv;
  gl_Position = projectionMatrix * viewPosition;
}
`;

// 조각 셰이더 순서: 지형색(planetTileShader.ts) → (끔) 고른 칸 → 카메라 빛 / (켬) 항성 낮밤 → 고른 칸(빛 뒤, 밤에도 밝다). ADR 4절 합성 순서 표.
const TILE_FRAGMENT = buildTileFragmentShader(DAY_NIGHT_GLSL);

/** 타일 하나의 재질. origin32 = 타일 원점(32비트, 위쪽 방향 계산용), tileST = (s0, t0, 한 변, 면) */
export function createTileMaterial(
  shared: SharedTileUniforms,
  cellData: Texture,
  cellExtra: Texture,
  cells: number,
  origin: readonly [number, number, number],
  tileST: readonly [number, number, number, number],
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...shared,
      uOrigin: { value: new Vector3(origin[0], origin[1], origin[2]) },
      uCellData: { value: cellData },
      uCellExtra: { value: cellExtra },
      uCells: { value: cells },
      uTile: { value: new Vector4(tileST[0], tileST[1], tileST[2], tileST[3]) },
    },
    vertexShader: TILE_VERTEX,
    fragmentShader: TILE_FRAGMENT,
    side: FrontSide,
  });
}

// 바탕 구(행성 좌표 구, 회전 없음)의 물체 공간 법선 = 위쪽이라 sunCos = 법선 · 항성 방향. 하늘을 켜면 타일과 같은 낮밤(기복 없음)
const GLOBE_VERTEX = /* glsl */ `
uniform vec3 uSunDir;
varying vec3 vNormal;
varying float vSunCos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vSunCos = dot(normalize(normal), uSunDir);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GLOBE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uFlat;
varying vec3 vNormal;
varying float vSunCos;
${DAY_NIGHT_GLSL}
void main() {
  float diffuse = max(dot(normalize(vNormal), uLightDir), 0.0);
  vec3 lit = uColor * (0.5 + 0.62 * diffuse);
  if (uSkyBlend > 0.0) {
    float day;
    lit = mix(lit, nightFinish(uColor * dayNightLight(vSunCos, day), day), uSkyBlend);
  }
  gl_FragColor = vec4(mix(lit, uColor, uFlat), 1.0);
}
`;

/** 바탕 구 재질(아직 타일이 없는 곳). debug면 빛 없이 자홍색(틈 찾기). 하늘 빛은 타일과 같은 uniform 객체 */
export function createBaseGlobeMaterial(shared: SharedTileUniforms, debug: boolean): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(debug ? DEBUG_CRACK_COLOR : BASE_GLOBE_COLOR) },
      uLightDir: shared.uLightDir,
      uFlat: { value: debug ? 1 : 0 },
      ...skyLightUniformsOf(shared),
    },
    vertexShader: GLOBE_VERTEX,
    fragmentShader: GLOBE_FRAGMENT,
    side: FrontSide,
  });
}

const ATMOSPHERE_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = viewPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * viewPosition;
}
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  // 구 뒷면을 그린다: 가장자리(시선과 거의 직각)일수록 진하게
  float facing = abs(dot(normalize(vNormal), normalize(-vViewPosition)));
  float glow = pow(1.0 - facing, 2.2) * uStrength;
  gl_FragColor = vec4(uColor * glow, glow);
}
`;

/** 대기 띠(멀리서 볼 때 행성 가장자리의 옅은 빛). 가까우면 엔진이 끈다 */
export function createAtmosphereMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(0xbfe6ff) }, uStrength: { value: 0.9 } },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    side: BackSide,
    transparent: true,
    depthWrite: false,
  });
}
