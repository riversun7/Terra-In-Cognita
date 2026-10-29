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
  DataTexture,
  FrontSide,
  NearestFilter,
  RGBAFormat,
  RGFormat,
  ShaderMaterial,
  type Texture,
  UnsignedByteType,
  Vector3,
  Vector4,
} from "three";
// 물 비트는 @terra/planet 정의 하나를 셰이더 문자열에 넣는다(값을 따로 적지 않는다)
import {
  DEPTH_COASTAL,
  DEPTH_DEEP,
  WATER_DEPTH_MASK,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
} from "@terra/planet";
import { DAY_NIGHT_BAND } from "./sky.ts";
import { DAY_NIGHT_SHADE } from "./skyShade.ts";

/** 바다 수심 색(연안·대륙붕·심해), 호수·강 색 — 파스텔 장난감 톤 */
const COLORS = {
  coastal: 0x9fdcef,
  shelf: 0x7cc6e6,
  deep: 0x4f97cf,
  lake: 0x86cbe8,
  river: 0x5aa8d8,
  unknownBiome: 0xc8c8c8,
  dry: 0xd9cbb0,
  seaTint: 0x6fb3df,
  pick: 0xffd66e,
} as const;
/** 바탕 구(아직 타일이 없는 곳) 색 = 심해 */
export const BASE_GLOBE_COLOR = COLORS.deep;
/** 틈 찾기(시험) 색 */
export const DEBUG_CRACK_COLOR = 0xff00ff;

/** 빛 방향(보기 공간): 화면 왼쪽 위 앞에서 */
const LIGHT_DIRECTION = new Vector3(-0.45, 0.62, 0.64).normalize();

const glslColor = (hex: number): string => {
  const c = new Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

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
  /** 0 지형, 1 기후 */
  uLayer: { value: number };
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

export function createSharedTileUniforms(
  biomeColors: readonly number[],
  skirtDepthM: number,
): SharedTileUniforms {
  return {
    uExaggeration: { value: 1 },
    uSkirtDepth: { value: skirtDepthM },
    uLayer: { value: 0 },
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
    color.setHex(biomeColors[i] ?? COLORS.unknownBiome);
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

void main() {
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

// 조각 셰이더 순서: 지형색 → (끔) 고른 칸 → 카메라 빛 / (켬) 항성 낮밤 → 고른 칸(빛 뒤, 밤에도 밝다). ADR 4절 합성 순서 표.
// cameraLight는 하늘 전의 식 그대로다(끔 모드 사진이 지금과 같아야 한다). skyLight의 기복 = 카메라 빛 경사(평지 0),
// 물 반짝임은 항성 방향이고 낮 쪽에만 있다. 켜지는 중(0 < uSkyBlend < 1)에는 두 빛을 섞는다.
const TILE_FRAGMENT = /* glsl */ `
uniform sampler2D uCellData;
uniform sampler2D uCellExtra;
uniform sampler2D uPalette;
uniform float uCells;
uniform float uLayer;
uniform vec3 uLightDir;
uniform vec3 uSunDirView;
uniform vec4 uTile;
uniform vec4 uPick;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vUpView;
varying float vSunCos;
${DAY_NIGHT_GLSL}
// 고른 칸: 노란 빛을 섞고 칸 가장자리에 테두리
vec3 applyPick(vec3 color) {
  if (uPick.w >= 0.0 && abs(uPick.w - uTile.w) < 0.5) {
    vec2 st = uTile.xy + vUv * uTile.z;
    vec2 local = (st - uPick.xy) / uPick.z;
    if (all(greaterThanEqual(local, vec2(0.0))) && all(lessThan(local, vec2(1.0)))) {
      vec2 edge = min(local, 1.0 - local) / max(fwidth(local), vec2(1e-6));
      float border = 1.0 - smoothstep(1.5, 3.0, min(edge.x, edge.y));
      color = mix(mix(color, ${glslColor(COLORS.pick)}, 0.35), vec3(1.0, 0.84, 0.43), border);
    }
  }
  return color;
}

vec3 cameraLight(vec3 base, vec3 n, bool wet) {
  float diffuse = max(dot(n, uLightDir), 0.0);
  vec3 color = base * (0.5 + 0.62 * diffuse);
  if (wet) {
    vec3 view = normalize(-vViewPosition);
    vec3 halfway = normalize(uLightDir + view);
    color += vec3(0.1) * pow(max(dot(n, halfway), 0.0), 48.0);
  }
  return color;
}

vec3 skyLight(vec3 base, vec3 n, bool wet) {
  float relief = dot(n, uLightDir) - dot(normalize(vUpView), uLightDir);
  float day;
  vec3 light = dayNightLight(vSunCos, day);
  vec3 color = nightFinish(base * light * (1.0 + uShade.z * relief / uShade.w), day);
  if (wet) {
    vec3 view = normalize(-vViewPosition);
    vec3 halfway = normalize(uSunDirView + view);
    color += vec3(0.1) * pow(max(dot(n, halfway), 0.0), 48.0) * day;
  }
  return color;
}

// 기온 색: 추움(파랑) → 더움(빨강)
vec3 temperatureColor(float t) {
  vec3 c = vec3(0.357, 0.431, 0.882);
  c = mix(c, vec3(0.498, 0.698, 0.941), smoothstep(-30.0, -10.0, t));
  c = mix(c, vec3(0.718, 0.894, 0.961), smoothstep(-10.0, 0.0, t));
  c = mix(c, vec3(0.659, 0.902, 0.631), smoothstep(0.0, 10.0, t));
  c = mix(c, vec3(0.965, 0.898, 0.553), smoothstep(10.0, 20.0, t));
  c = mix(c, vec3(0.973, 0.698, 0.416), smoothstep(20.0, 28.0, t));
  c = mix(c, vec3(0.910, 0.380, 0.353), smoothstep(28.0, 38.0, t));
  return c;
}

void main() {
  vec2 cell = clamp(floor(vUv * uCells), vec2(0.0), vec2(uCells - 1.0));
  ivec2 texel = ivec2(cell);
  vec4 data = texelFetch(uCellData, texel, 0);
  vec4 extra = texelFetch(uCellExtra, texel, 0);
  int biome = int(data.r * 255.0 + 0.5);
  int water = int(data.g * 255.0 + 0.5);
  float temperature = floor(data.b * 255.0 + 0.5) - 128.0;
  float humidity = data.a;
  float forest = extra.r;
  float river = floor(extra.g * 255.0 + 0.5);
  bool ocean = (water & ${WATER_OCEAN}) != 0;
  bool lake = (water & ${WATER_LAKE}) != 0;
  bool riverBit = (water & ${WATER_RIVER}) != 0;
  int depthClass = (water & ${WATER_DEPTH_MASK}) >> ${WATER_DEPTH_SHIFT};

  vec3 base;
  if (uLayer < 0.5) {
    if (ocean) {
      base = depthClass == ${DEPTH_COASTAL} ? ${glslColor(COLORS.coastal)} : depthClass == ${DEPTH_DEEP} ? ${glslColor(COLORS.deep)} : ${glslColor(COLORS.shelf)};
    } else if (lake) {
      base = ${glslColor(COLORS.lake)};
    } else {
      base = texelFetch(uPalette, ivec2(biome, 0), 0).rgb;
      base *= 1.0 - 0.16 * forest;
      if (river > 0.5 || riverBit) base = mix(base, ${glslColor(COLORS.river)}, 0.4 + 0.12 * min(river, 3.0));
    }
  } else {
    vec3 t = temperatureColor(temperature);
    if (ocean) {
      base = mix(t, ${glslColor(COLORS.seaTint)}, 0.45);
    } else {
      // 마를수록 옅게(모래빛), 습할수록 진하게
      base = mix(mix(t, ${glslColor(COLORS.dry)}, 0.55), t * 0.86, humidity);
    }
  }

  vec3 n = normalize(vNormal);
  bool wet = ocean || lake;
  vec3 color;
  if (uSkyBlend <= 0.0) {
    color = cameraLight(applyPick(base), n, wet);
  } else {
    color = skyLight(base, n, wet);
    if (uSkyBlend < 1.0) color = mix(cameraLight(base, n, wet), color, uSkyBlend);
    color = applyPick(color);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

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
