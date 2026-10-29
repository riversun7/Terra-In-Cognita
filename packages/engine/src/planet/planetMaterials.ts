// 1차맵 재질 — WebGL2 + 짧은 GLSL(three ShaderMaterial, ADR 36 "셰이더 언어: 지금은 WebGL2 + GLSL").
// - 타일: 꼭짓점 셰이더가 높이를 올리고(max(높이, 0) × 과장, 치마는 아래로), 법선 = 정규화(위쪽 − 과장 × 기울기).
//   조각 셰이더가 칸 자료 텍스처를 칸마다 그대로 읽어(texelFetch) 레이어 색을 고르고, 보기 공간 빛으로 음영을 넣는다.
// - 빛은 카메라에 붙인다(화면 왼쪽 위에서): 어느 쪽을 돌려 봐도 밝다(지도라서 밤이 없다).
// - 세계 색은 화면 테마와 상관없다(D-070). 색 관리를 끈 렌더러(sharedRenderer.ts)라 적은 값이 그대로 보인다.
// - 모든 타일 재질은 같은 셰이더(프로그램 하나)이고, 함께 쓰는 값(레이어·과장·빛·바이옴 색·고른 칸)은 같은 uniform 객체를 나눠 쓴다.
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

/** 모든 타일이 함께 쓰는 uniform(같은 객체를 나눠 쓴다) */
export interface SharedTileUniforms {
  uExaggeration: { value: number };
  /** 0 지형, 1 기후 */
  uLayer: { value: number };
  uLightDir: { value: Vector3 };
  uPalette: { value: Texture };
  /** 고른 칸: (s0, t0, 한 변 길이, 면) — 면이 −1이면 없음 */
  uPick: { value: Vector4 };
}

export function createSharedTileUniforms(biomeColors: readonly number[]): SharedTileUniforms {
  return {
    uExaggeration: { value: 1 },
    uLayer: { value: 0 },
    uLightDir: { value: LIGHT_DIRECTION.clone() },
    uPalette: { value: createPaletteTexture(biomeColors) },
    uPick: { value: new Vector4(0, 0, 0, -1) },
  };
}

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

const TILE_VERTEX = /* glsl */ `
uniform vec3 uOrigin;
uniform float uExaggeration;
uniform float uSkirtDrop;
attribute vec3 grad;
attribute vec2 hs;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  // 위쪽 = 행성 중심에서 이 점으로(원점 + 위치, 32비트로도 방향은 충분히 정확하다)
  vec3 up = normalize(uOrigin + position);
  float lift = max(hs.x, 0.0) * uExaggeration - hs.y * uSkirtDrop;
  vec3 local = position + up * lift;
  vec3 n = normalize(up - uExaggeration * grad);
  vec4 viewPosition = modelViewMatrix * vec4(local, 1.0);
  vViewPosition = viewPosition.xyz;
  vNormal = normalize(normalMatrix * n);
  vUv = uv;
  gl_Position = projectionMatrix * viewPosition;
}
`;

const TILE_FRAGMENT = /* glsl */ `
uniform sampler2D uCellData;
uniform sampler2D uCellExtra;
uniform sampler2D uPalette;
uniform float uCells;
uniform float uLayer;
uniform vec3 uLightDir;
uniform vec4 uTile;
uniform vec4 uPick;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

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

  // 고른 칸: 노란 빛을 섞고 칸 가장자리에 테두리
  if (uPick.w >= 0.0 && abs(uPick.w - uTile.w) < 0.5) {
    vec2 st = uTile.xy + vUv * uTile.z;
    vec2 local = (st - uPick.xy) / uPick.z;
    if (all(greaterThanEqual(local, vec2(0.0))) && all(lessThan(local, vec2(1.0)))) {
      vec2 edge = min(local, 1.0 - local) / max(fwidth(local), vec2(1e-6));
      float border = 1.0 - smoothstep(1.5, 3.0, min(edge.x, edge.y));
      base = mix(mix(base, ${glslColor(COLORS.pick)}, 0.35), vec3(1.0, 0.84, 0.43), border);
    }
  }

  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, uLightDir), 0.0);
  vec3 color = base * (0.5 + 0.62 * diffuse);
  if (ocean || lake) {
    vec3 view = normalize(-vViewPosition);
    vec3 halfway = normalize(uLightDir + view);
    color += vec3(0.1) * pow(max(dot(n, halfway), 0.0), 48.0);
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
      uSkirtDrop: { value: 0 },
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

const GLOBE_VERTEX = /* glsl */ `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GLOBE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uFlat;
varying vec3 vNormal;
void main() {
  float diffuse = max(dot(normalize(vNormal), uLightDir), 0.0);
  vec3 lit = uColor * (0.5 + 0.62 * diffuse);
  gl_FragColor = vec4(mix(lit, uColor, uFlat), 1.0);
}
`;

/** 바탕 구 재질(아직 타일이 없는 곳). debug면 빛 없이 자홍색(틈 찾기) */
export function createBaseGlobeMaterial(shared: SharedTileUniforms, debug: boolean): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(debug ? DEBUG_CRACK_COLOR : BASE_GLOBE_COLOR) },
      uLightDir: shared.uLightDir,
      uFlat: { value: debug ? 1 : 0 },
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
