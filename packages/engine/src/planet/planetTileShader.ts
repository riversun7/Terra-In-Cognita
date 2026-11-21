// 1차맵 타일 조각 셰이더(WebGL2 GLSL) — 1칸 앞치마(uPad) 무봉제 이웃 읽기 + 선명한 유기적 바이옴 + C⁰ 연속 대각·사행 하천망.
// - 타일 텍스처(34×34 = cells + 2)의 바깥 1칸에 이웃 타일(같은 면·면 경계·LOD 부모)을 복사해 경계 끊김을 없앤다.
// - 바이옴은 2×2 동일 바이옴 합산 + 도메인 워프 + 화면 픽셀 폭(fwidth) 승자 경계로 블러 없이 또렷한 유기적 등고 지형을 그린다.
// - 하천은 도메인 워프된 2×2 연속 스칼라장 + 네 변에서 이중선형과 정확히 일치하는 대각 다리(1 − |fx − fy|) + 망상 하천 내부 메움(0x80)으로
//   셀·타일 경계 절단, 대각선 끊김, 45° 직선 꺾임, 체커보드 구멍을 모두 없앤다.
// 생성기·타일 이진 형식은 바꾸지 않고 GPU 셰이더 표현만 개선한다.
import { Color } from "three";
import {
  DEPTH_COASTAL,
  DEPTH_DEEP,
  WATER_DEPTH_MASK,
  WATER_DEPTH_SHIFT,
  WATER_LAKE,
  WATER_OCEAN,
  WATER_RIVER,
} from "@terra/planet";
import {
  ELEVATION_LAKE_COLOR,
  ELEVATION_LAND_RAMP,
  ELEVATION_SEA_RAMP,
  ELEVATION_SEA_SCALE,
  MUTED_LAND_COLOR,
  MUTED_WATER_COLOR,
  RESOURCE_HIGH_COLOR,
  RESOURCE_MIX_MAX,
  RESOURCE_MIX_MIN,
  glslRamp,
  glslVec3,
} from "./layerColors.ts";
import { CHECKERBOARD_RIVER_BIT } from "./tileApron.ts";

/** 바다 수심 색(연안·대륙붕·심해), 호수·강·기후·해안 보정 색 */
export const TILE_COLORS = {
  coastal: 0x62b7d9,
  shelf: 0x3b8dc2,
  deep: 0x265e96,
  lake: 0x4ca6cf,
  river: 0x459cc9,
  riverHighlight: 0x76c9eb,
  riverBank: 0x437842,
  beachSand: 0xd9cda3,
  alpineRock: 0x87837c,
  alpineSnow: 0xeff3f7,
  coastInk: 0x1b3446,
  contourInk: 0x2a241c,
  seaContourInk: 0x163254,
  unknownBiome: 0xc8c8c8,
  dry: 0xd9cbb0,
  seaTint: 0x4d8bc2,
  pick: 0xffd66e,
} as const;

const glslColor = (hex: number): string => {
  const c = new Color(hex);
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
};

/** 1차맵 타일 조각 셰이더 문자열을 만든다(DAY_NIGHT_GLSL을 받아 프로그램 하나로 묶는다) */
export function buildTileFragmentShader(dayNightGlsl: string): string {
  return /* glsl */ `
uniform sampler2D uCellData;
uniform sampler2D uCellExtra;
uniform sampler2D uPalette;
uniform sampler2DArray uResource;
uniform sampler2DArray uResourceHigh;
uniform vec3 uResourceColor;
uniform float uResourceReady;
uniform float uElevationMax;
uniform float uCells;
uniform float uPad;
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
varying float vHeight;
${dayNightGlsl}
${glslRamp("elevationLand", ELEVATION_LAND_RAMP)}
${glslRamp("elevationSea", ELEVATION_SEA_RAMP)}

struct CellSample {
  int biome;
  float waterMask;
  float oceanMask;
  float lakeMask;
  float temp;
  float humidity;
  float forest;
  float riverGrade;
  bool hasRiver;
  vec3 waterColor;
};

CellSample sampleCell(ivec2 p) {
  vec4 d = texelFetch(uCellData, p, 0);
  vec4 e = texelFetch(uCellExtra, p, 0);
  CellSample s;
  s.biome = int(d.r * 255.0 + 0.5);
  int w = int(d.g * 255.0 + 0.5);
  s.temp = floor(d.b * 255.0 + 0.5) - 128.0;
  s.humidity = d.a;
  s.forest = e.r;
  int rawRivByte = int(e.g * 255.0 + 0.5);
  bool filledRiv = (rawRivByte & ${CHECKERBOARD_RIVER_BIT}) != 0;
  float rv = float(rawRivByte & 127);
  bool oc = (w & ${WATER_OCEAN}) != 0;
  bool lk = (w & ${WATER_LAKE}) != 0;
  bool rb = (w & ${WATER_RIVER}) != 0;
  int dc = (w & ${WATER_DEPTH_MASK}) >> ${WATER_DEPTH_SHIFT};
  s.oceanMask = oc ? 1.0 : 0.0;
  s.lakeMask = lk ? 1.0 : 0.0;
  s.waterMask = (oc || lk) ? 1.0 : 0.0;
  s.hasRiver = !(oc || lk) && (rv > 0.5 || rb || filledRiv);
  s.riverGrade = s.hasRiver ? max(rv, filledRiv ? 2.0 : 1.0) : 0.0;
  if (oc) {
    s.waterColor = dc == ${DEPTH_COASTAL} ? ${glslColor(TILE_COLORS.coastal)} : dc == ${DEPTH_DEEP} ? ${glslColor(TILE_COLORS.deep)} : ${glslColor(TILE_COLORS.shelf)};
  } else if (lk) {
    s.waterColor = ${glslColor(TILE_COLORS.lake)};
  } else {
    s.waterColor = ${glslColor(TILE_COLORS.coastal)};
  }
  return s;
}

// 앞치마(uPad = 1)를 감안해 논리 칸 좌표(-1 .. uCells)를 안전하게 읽는다
CellSample sampleAt(ivec2 cell) {
  int pad = int(uPad + 0.5);
  int maxTex = int(uCells + 0.5) + pad * 2 - 1;
  ivec2 p = clamp(cell + ivec2(pad), ivec2(0), ivec2(maxTex));
  return sampleCell(p);
}

vec3 terrainLandColor(CellSample s) {
  vec3 b = texelFetch(uPalette, ivec2(s.biome, 0), 0).rgb;
  // 숲이 짙을수록 깊은 산림 음영
  return b * (1.0 - 0.19 * s.forest);
}

vec3 mutedLandColor(CellSample s) {
  vec3 b = texelFetch(uPalette, ivec2(s.biome, 0), 0).rgb;
  float lum = dot(b, vec3(0.299, 0.587, 0.114));
  return mix(${glslVec3(MUTED_LAND_COLOR)}, vec3(lum), 0.28);
}

// 등고선·등온선 안티앨리어싱 선 세기(멀어지면 무아레를 막으려 부드럽게 사라진다)
float contourStroke(float value, float stepSize, float halfWidth) {
  float phase = value / stepSize;
  float df = max(fwidth(phase), 1e-4);
  float dist = abs(fract(phase + 0.5) - 0.5) / df;
  float fade = 1.0 - smoothstep(0.18, 0.48, df);
  return (1.0 - smoothstep(halfWidth, halfWidth + 0.9, dist)) * fade;
}

// 면 전역 칸 좌표 기반 결정적 잡음 — 같은 레벨 이웃 타일 사이에서 100% 연속이다
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// 해안·호수 곡선 굴곡(-1 ~ +1): 칸 크기에 맞춘 완만한 2옥타브 곡선
float coastWobble(vec2 gCell) {
  float n = valueNoise(gCell * 0.85) * 0.65 + valueNoise(gCell * 1.95 + vec2(17.3, 9.7)) * 0.35;
  return (n - 0.5) * 2.0;
}
// 바이옴·하천 사행용 2차원 유기적 변위(-1 ~ +1)
vec2 organicWarp(vec2 gCell) {
  float wx = valueNoise(gCell * 0.62 + vec2(3.1, 7.4)) * 0.68 + valueNoise(gCell * 1.38 + vec2(29.3, 11.9)) * 0.32;
  float wy = valueNoise(gCell * 0.62 + vec2(41.7, 19.2)) * 0.68 + valueNoise(gCell * 1.38 + vec2(13.5, 53.1)) * 0.32;
  return vec2(wx, wy) * 2.0 - 1.0;
}
// 지형 표면의 은은한 수채화·수관 결(-1 ~ +1)
float terrainGrain(vec2 gCell) {
  float g = valueNoise(gCell * 2.35 + vec2(5.2, 13.8)) * 0.6 + valueNoise(gCell * 5.4 + vec2(23.1, 7.9)) * 0.4;
  return g * 2.0 - 1.0;
}

// 2×2 동일 바이옴 합산 + 화면 픽셀 폭(fwidth) 승자 경계 — 블러 없는 선명한 유기적 바이옴 색과 경계 강도를 반환한다
vec4 crispLandBlend(
  CellSample b00, CellSample b10, CellSample b01, CellSample b11,
  vec3 c0, vec3 c1, vec3 c2, vec3 c3,
  vec2 bf, float cellFw
) {
  float w00 = (1.0 - bf.x) * (1.0 - bf.y) * (1.0 - b00.waterMask);
  float w10 = bf.x * (1.0 - bf.y) * (1.0 - b10.waterMask);
  float w01 = (1.0 - bf.x) * bf.y * (1.0 - b01.waterMask);
  float w11 = bf.x * bf.y * (1.0 - b11.waterMask);

  float g0 = w00; vec3 gc0 = c0 * w00;
  float g1 = 0.0; vec3 gc1 = vec3(0.0);
  float g2 = 0.0; vec3 gc2 = vec3(0.0);
  float g3 = 0.0; vec3 gc3 = vec3(0.0);

  if (b10.biome == b00.biome) { g0 += w10; gc0 += c1 * w10; }
  else { g1 = w10; gc1 = c1 * w10; }

  if (b01.biome == b00.biome) { g0 += w01; gc0 += c2 * w01; }
  else if (b01.biome == b10.biome) { g1 += w01; gc1 += c2 * w01; }
  else { g2 = w01; gc2 = c2 * w01; }

  if (b11.biome == b00.biome) { g0 += w11; gc0 += c3 * w11; }
  else if (b11.biome == b10.biome) { g1 += w11; gc1 += c3 * w11; }
  else if (b11.biome == b01.biome) { g2 += w11; gc2 += c3 * w11; }
  else { g3 = w11; gc3 = c3 * w11; }

  float total = g0 + g1 + g2 + g3;
  if (total < 1e-4) return vec4(c0, 0.0);
  float n0 = g0 / total;
  float n1 = g1 / total;
  float n2 = g2 / total;
  float n3 = g3 / total;

  float maxN = n0;
  float secondN = 0.0;
  if (n1 > maxN) { secondN = maxN; maxN = n1; } else if (n1 > secondN) { secondN = n1; }
  if (n2 > maxN) { secondN = maxN; maxN = n2; } else if (n2 > secondN) { secondN = n2; }
  if (n3 > maxN) { secondN = maxN; maxN = n3; } else if (n3 > secondN) { secondN = n3; }

  float aa = clamp(cellFw * 1.15, 0.022, 0.14);
  float k0 = n0 > 1e-4 ? smoothstep(maxN - aa, maxN + 1e-4, n0) : 0.0;
  float k1 = n1 > 1e-4 ? smoothstep(maxN - aa, maxN + 1e-4, n1) : 0.0;
  float k2 = n2 > 1e-4 ? smoothstep(maxN - aa, maxN + 1e-4, n2) : 0.0;
  float k3 = n3 > 1e-4 ? smoothstep(maxN - aa, maxN + 1e-4, n3) : 0.0;
  float kSum = max(k0 + k1 + k2 + k3, 1e-4);

  vec3 col = (
    (g0 > 1e-4 ? gc0 / g0 : vec3(0.0)) * k0 +
    (g1 > 1e-4 ? gc1 / g1 : vec3(0.0)) * k1 +
    (g2 > 1e-4 ? gc2 / g2 : vec3(0.0)) * k2 +
    (g3 > 1e-4 ? gc3 / g3 : vec3(0.0)) * k3
  ) / kSum;

  float seam = smoothstep(maxN - aa * 2.1, maxN, secondN) * step(0.08, secondN) * (1.0 - smoothstep(0.24, 0.62, cellFw));
  return vec4(col, seam);
}

// 2×2 C⁰ 연속 하천 스칼라장(도메인 워프 포함) — 사각형 네 변에서 이중선형과 정확히 일치하는 대각 다리를 더해
// 셀·타일 경계 절단 없이 대각선·굽이·하구·망상 하천을 부드러운 곡선으로 잇는다. 반환: (field − threshold)
float evalRiverField(vec2 tcR) {
  ivec2 rBase = ivec2(floor(tcR));
  vec2 rf = clamp(tcR - vec2(rBase), 0.0, 1.0);

  CellSample q00 = sampleAt(rBase);
  CellSample q10 = sampleAt(rBase + ivec2(1, 0));
  CellSample q01 = sampleAt(rBase + ivec2(0, 1));
  CellSample q11 = sampleAt(rBase + ivec2(1, 1));

  // 네 꼭짓점 중 하천이 하나도 없으면(순수 호수·바다·육지) 하천장을 만들지 않는다
  bool anyRiv = q00.hasRiver || q10.hasRiver || q01.hasRiver || q11.hasRiver;
  if (!anyRiv) return -1.0;

  float v00 = (q00.waterMask > 0.5 || q00.hasRiver) ? 1.0 : 0.0;
  float v10 = (q10.waterMask > 0.5 || q10.hasRiver) ? 1.0 : 0.0;
  float v01 = (q01.waterMask > 0.5 || q01.hasRiver) ? 1.0 : 0.0;
  float v11 = (q11.waterMask > 0.5 || q11.hasRiver) ? 1.0 : 0.0;

  float rw00 = (1.0 - rf.x) * (1.0 - rf.y);
  float rw10 = rf.x * (1.0 - rf.y);
  float rw01 = (1.0 - rf.x) * rf.y;
  float rw11 = rf.x * rf.y;

  float field = v00 * rw00 + v10 * rw10 + v01 * rw01 + v11 * rw11;

  // 네 변에서 0, 정중앙에서 1인 부드러운 내부 보정(대각선 폭이 직선과 같게 유지되면서 변 연속성 100% 보존)
  float edgeFade = 16.0 * rf.x * (1.0 - rf.x) * rf.y * (1.0 - rf.y);

  // 주대각(00↔11): 1 − |fx − fy|는 사각형 네 변에서 이중선형과 수학적으로 정확히 같다
  if (v00 > 0.5 && v11 > 0.5 && (q00.hasRiver || q11.hasRiver)) {
    float bMain = 1.0 - abs(rf.x - rf.y);
    bMain += (1.0 - bMain) * 0.34 * edgeFade;
    field = max(field, bMain);
  }
  // 부대각(10↔01): 1 − |fx + fy − 1| 역시 네 변에서 이중선형과 정확히 같다
  if (v10 > 0.5 && v01 > 0.5 && (q10.hasRiver || q01.hasRiver)) {
    float bAnti = 1.0 - abs(rf.x + rf.y - 1.0);
    bAnti += (1.0 - bAnti) * 0.34 * edgeFade;
    field = max(field, bAnti);
  }

  // 하천 등급에 따라 자연스럽게 굵어지는 문턱값(지류 0.72 → 본류 0.64)
  float gNum = q00.riverGrade * rw00 + q10.riverGrade * rw10 + q01.riverGrade * rw01 + q11.riverGrade * rw11;
  float gDen = (q00.hasRiver ? rw00 : 0.0) + (q10.hasRiver ? rw10 : 0.0) + (q01.hasRiver ? rw01 : 0.0) + (q11.hasRiver ? rw11 : 0.0);
  float avgGrade = gDen > 1e-4 ? gNum / gDen : 1.0;
  float threshold = 0.72 - 0.04 * clamp(avgGrade - 1.0, 0.0, 2.0);
  return field - threshold;
}

// 고른 칸: 노란 빛을 섞고 칸 가장자리에 테두리
vec3 applyPick(vec3 color) {
  if (uPick.w >= 0.0 && abs(uPick.w - uTile.w) < 0.5) {
    vec2 st = uTile.xy + vUv * uTile.z;
    vec2 local = (st - uPick.xy) / uPick.z;
    if (all(greaterThanEqual(local, vec2(0.0))) && all(lessThan(local, vec2(1.0)))) {
      vec2 edge = min(local, 1.0 - local) / max(fwidth(local), vec2(1e-6));
      float border = 1.0 - smoothstep(1.5, 3.0, min(edge.x, edge.y));
      color = mix(mix(color, ${glslColor(TILE_COLORS.pick)}, 0.35), vec3(1.0, 0.84, 0.43), border);
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
  // 면 전역 칸 좌표(같은 레벨 이웃 타일과 100% 연속) + 정육면체 면 경계에서는 워프를 0으로 모아 다른 면과도 이음매 없이 맞춘다
  vec2 worldST = uTile.xy + vUv * uTile.z;
  float faceCells = uCells / max(uTile.z, 1e-6);
  vec2 gCell = worldST * faceCells;
  float faceEdgeCells = min(min(worldST.x, 1.0 - worldST.x), min(worldST.y, 1.0 - worldST.y)) * faceCells;
  float faceEdgeFade = smoothstep(0.0, 1.5, faceEdgeCells);

  // 1) 해안선·호수·기후용 2×2 표본(앞치마 sampleAt로 타일 경계 끊김 제거)
  vec2 tc = vUv * uCells - 0.5;
  ivec2 baseCell = ivec2(floor(tc));
  vec2 frac = clamp(tc - vec2(baseCell), 0.0, 1.0);
  vec2 fs = frac * frac * (3.0 - 2.0 * frac);

  CellSample s00 = sampleAt(baseCell);
  CellSample s10 = sampleAt(baseCell + ivec2(1, 0));
  CellSample s01 = sampleAt(baseCell + ivec2(0, 1));
  CellSample s11 = sampleAt(baseCell + ivec2(1, 1));

  float w00 = (1.0 - fs.x) * (1.0 - fs.y);
  float w10 = fs.x * (1.0 - fs.y);
  float w01 = (1.0 - fs.x) * fs.y;
  float w11 = fs.x * fs.y;

  float rw00 = (1.0 - frac.x) * (1.0 - frac.y);
  float rw10 = frac.x * (1.0 - frac.y);
  float rw01 = (1.0 - frac.x) * frac.y;
  float rw11 = frac.x * frac.y;

  float waterAmtRaw = s00.waterMask * w00 + s10.waterMask * w10 + s01.waterMask * w01 + s11.waterMask * w11;
  float lakeAmt = s00.lakeMask * w00 + s10.lakeMask * w10 + s01.lakeMask * w01 + s11.lakeMask * w11;
  float edgeActivity = smoothstep(0.02, 0.25, waterAmtRaw) * (1.0 - smoothstep(0.75, 0.98, waterAmtRaw));
  float waterAmt = clamp(waterAmtRaw + coastWobble(gCell) * 0.13 * edgeActivity * faceEdgeFade, 0.0, 1.0);
  float waterFw = max(fwidth(waterAmt), 0.012);
  float waterAA = clamp(waterFw * 1.1, 0.016, 0.08);
  float isWater = smoothstep(0.5 - waterAA, 0.5 + waterAA, waterAmt);

  // 화면 픽셀 기준 또렷한 해안·호수 윤곽선 + 연안 물빛 + 해변 띠
  float shoreDist = abs(waterAmt - 0.5) / waterFw;
  float coastLine =
    (1.0 - smoothstep(0.65, 1.85, shoreDist)) *
    smoothstep(0.08, 0.35, waterAmt) *
    (1.0 - smoothstep(0.65, 0.92, waterAmt)) *
    (1.0 - smoothstep(0.32, 0.72, waterFw));
  float shallowRim = smoothstep(0.50, 0.62, waterAmt) * (1.0 - smoothstep(0.68, 0.96, waterAmt));
  float beachRim = smoothstep(0.18, 0.44, waterAmt) * (1.0 - smoothstep(0.46, 0.54, waterAmt));

  // 2) C⁰ 연속 2×2 사행 하천 스칼라장(지형·자원·영토 레이어에서만 평가)
  float rawRiverMask = 0.0;
  float riverMask = 0.0;
  float riverCore = 0.0;
  float riverOutline = 0.0;
  float riverValley = 0.0;
  if (uLayer < 0.5 || uLayer >= 2.5) {
    vec2 tcR = tc + organicWarp(gCell * 0.88 + vec2(31.7, 19.3)) * 0.16 * faceEdgeFade;
    float rVal = evalRiverField(tcR);
    float rFw = max(fwidth(rVal), 0.015);
    float rAA = clamp(rFw * 1.15, 0.016, 0.08);
    rawRiverMask = smoothstep(-rAA, rAA, rVal);
    riverMask = rawRiverMask * (1.0 - isWater);
    riverCore = smoothstep(0.06, 0.24, rVal) * riverMask;
    float bankDist = abs(rVal) / rFw;
    riverOutline = (1.0 - smoothstep(0.55, 1.65, bankDist)) * (1.0 - smoothstep(0.28, 0.65, rFw)) * (1.0 - isWater);
    riverValley = smoothstep(-0.22, -0.02, rVal) * (1.0 - riverMask) * (1.0 - isWater);
  }
  // 강이 호수·바다로 흘러드는 하구에서는 호수 윤곽선을 양쪽 모두 열어 강변 윤곽선과 자연스럽게 잇는다
  float coastLineOpen = coastLine * (1.0 - rawRiverMask * 0.96);

  float top = max(uElevationMax, 1.0);
  float hNorm = clamp(vHeight / top, 0.0, 1.0);
  float seaDepthNorm = clamp(-vHeight / (top * ${ELEVATION_SEA_SCALE.toFixed(4)}), 0.0, 1.0);

  vec3 n = normalize(vNormal);
  float slopeRelief = dot(n, uLightDir) - dot(normalize(vUpView), uLightDir);

  vec3 base;
  if (uLayer < 0.5) {
    // 1. 지형: 도메인 워프 + 동일 바이옴 합산으로 블러 없이 선명하고 유기적인 지형 경계를 그린다
    vec2 tcB = tc + organicWarp(gCell) * 0.28 * faceEdgeFade;
    ivec2 bBase = ivec2(floor(tcB));
    vec2 bf = clamp(tcB - vec2(bBase), 0.0, 1.0);
    float cellFw = max(fwidth(tcB.x), fwidth(tcB.y));

    CellSample b00 = sampleAt(bBase);
    CellSample b10 = sampleAt(bBase + ivec2(1, 0));
    CellSample b01 = sampleAt(bBase + ivec2(0, 1));
    CellSample b11 = sampleAt(bBase + ivec2(1, 1));
    // 해안 바로 옆에서 도메인 워프가 모두 물 칸에 걸리면 원래 2×2 육지 칸을 쓴다
    if (b00.waterMask + b10.waterMask + b01.waterMask + b11.waterMask > 3.5) {
      b00 = s00; b10 = s10; b01 = s01; b11 = s11; bf = frac;
    }

    vec4 landBlend = crispLandBlend(
      b00, b10, b01, b11,
      terrainLandColor(b00), terrainLandColor(b10), terrainLandColor(b01), terrainLandColor(b11),
      bf, cellFw
    );
    vec3 land = landBlend.rgb;
    // 바이옴 경계의 아주 은은한 지도 등고 음영 + 근접 시 수관·토양 미세 질감
    land *= 1.0 - 0.075 * landBlend.a;
    float grainFade = 1.0 - smoothstep(0.18, 0.55, cellFw);
    land *= 1.0 + terrainGrain(gCell) * 0.042 * grainFade;
    // 고산 암석·만년설·해변 모래 띠
    land = mix(land, ${glslColor(TILE_COLORS.alpineRock)}, 0.34 * smoothstep(0.45, 0.78, hNorm));
    land = mix(land, ${glslColor(TILE_COLORS.alpineSnow)}, 0.62 * smoothstep(0.76, 0.96, hNorm));
    land = mix(land, ${glslColor(TILE_COLORS.beachSand)}, 0.22 * beachRim * (1.0 - smoothstep(0.04, 0.14, hNorm)));
    // 산맥·구릉 기복감
    land *= 1.0 + clamp(slopeRelief * 0.24, -0.14, 0.16);
    float ww00 = w00 * s00.waterMask;
    float ww10 = w10 * s10.waterMask;
    float ww01 = w01 * s01.waterMask;
    float ww11 = w11 * s11.waterMask;
    float wwSum = max(ww00 + ww10 + ww01 + ww11, 1e-4);
    vec3 cellWater = (s00.waterColor * ww00 + s10.waterColor * ww10 + s01.waterColor * ww01 + s11.waterColor * ww11) / wwSum;
    // 바다는 연속 수심(vHeight) 기반 그라데이션을 함께 섞어 연안·대륙붕·심해 격자 계단을 부드럽게 녹인다
    vec3 smoothSea = mix(${glslColor(TILE_COLORS.coastal)}, ${glslColor(TILE_COLORS.shelf)}, smoothstep(0.02, 0.22, seaDepthNorm));
    smoothSea = mix(smoothSea, ${glslColor(TILE_COLORS.deep)}, smoothstep(0.20, 0.62, seaDepthNorm));
    float isLakeWater = smoothstep(0.25, 0.75, lakeAmt / max(waterAmtRaw, 1e-4));
    vec3 water = mix(mix(cellWater, smoothSea, 0.58), cellWater, isLakeWater);
    water = mix(water, ${glslColor(TILE_COLORS.riverHighlight)}, 0.18 * shallowRim * (1.0 - rawRiverMask * 0.85));

    // 강변 비옥 띠 + 연속 사행 강 줄기(하구에선 맞닿은 호수·연안 바다 색으로 자연스럽게 합류) + 강변 윤곽선
    land = mix(land, ${glslColor(TILE_COLORS.riverBank)}, 0.16 * riverValley);
    vec3 riverCol = mix(${glslColor(TILE_COLORS.river)}, ${glslColor(TILE_COLORS.riverHighlight)}, 0.26 * riverCore);
    riverCol = mix(riverCol, water, smoothstep(0.12, 0.50, waterAmt));
    land = mix(land, riverCol, 0.95 * riverMask);
    land = mix(land, ${glslColor(TILE_COLORS.coastInk)}, 0.38 * riverOutline);

    base = mix(land, water, isWater);
    base = mix(base, ${glslColor(TILE_COLORS.coastInk)}, 0.44 * coastLineOpen);
  } else if (uLayer < 1.5) {
    // 2. 기후: 기온·습도 무봉제 보간 + 10°C 등온선 + 해안선
    float tempSmooth = s00.temp * rw00 + s10.temp * rw10 + s01.temp * rw01 + s11.temp * rw11;
    float humSmooth = s00.humidity * rw00 + s10.humidity * rw10 + s01.humidity * rw01 + s11.humidity * rw11;
    vec3 t = temperatureColor(tempSmooth);
    vec3 landClimate = mix(mix(t, ${glslColor(TILE_COLORS.dry)}, 0.48), t * 0.84, humSmooth);
    vec3 seaClimate = mix(t, ${glslColor(TILE_COLORS.seaTint)}, 0.52);
    base = mix(landClimate, seaClimate, isWater);
    float iso = contourStroke(tempSmooth, 10.0, 0.55);
    base = mix(base, ${glslColor(TILE_COLORS.contourInk)}, (0.24 - 0.12 * isWater) * iso);
    base = mix(base, ${glslColor(TILE_COLORS.coastInk)}, 0.56 * coastLine);
  } else if (uLayer < 2.5) {
    // 3. 고도: 높이 색 띠 + 지형 등고선(주·보조) + 해저 수심 등고선 + 해안선
    vec3 landElev = elevationLand(hNorm);
    float majorLine = contourStroke(hNorm, 0.15, 0.65);
    float minorLine = contourStroke(hNorm, 0.05, 0.42);
    landElev = mix(landElev, ${glslColor(TILE_COLORS.contourInk)}, 0.14 * minorLine + 0.28 * majorLine);
    landElev *= 1.0 + clamp(slopeRelief * 0.18, -0.10, 0.12);

    vec3 seaElev = elevationSea(seaDepthNorm);
    float seaContour = contourStroke(seaDepthNorm, 0.20, 0.48);
    seaElev = mix(seaElev, ${glslColor(TILE_COLORS.seaContourInk)}, 0.18 * seaContour);
    vec3 waterElev = mix(seaElev, ${glslVec3(ELEVATION_LAKE_COLOR)}, smoothstep(0.35, 0.65, lakeAmt / max(waterAmt, 1e-4)));

    base = mix(landElev, waterElev, isWater);
    base = mix(base, ${glslColor(TILE_COLORS.coastInk)}, 0.58 * coastLine);
  } else {
    // 4·5. 자원 분포·영토(정치 아틀라스): 선명한 유기적 지형 바탕 + 산맥 기복 + 연속 사행 하천 + 해안선
    vec2 tcB = tc + organicWarp(gCell) * 0.28 * faceEdgeFade;
    ivec2 bBase = ivec2(floor(tcB));
    vec2 bf = clamp(tcB - vec2(bBase), 0.0, 1.0);
    float cellFw = max(fwidth(tcB.x), fwidth(tcB.y));

    CellSample b00 = sampleAt(bBase);
    CellSample b10 = sampleAt(bBase + ivec2(1, 0));
    CellSample b01 = sampleAt(bBase + ivec2(0, 1));
    CellSample b11 = sampleAt(bBase + ivec2(1, 1));
    if (b00.waterMask + b10.waterMask + b01.waterMask + b11.waterMask > 3.5) {
      b00 = s00; b10 = s10; b01 = s01; b11 = s11; bf = frac;
    }

    vec4 mutedBlend = crispLandBlend(
      b00, b10, b01, b11,
      mutedLandColor(b00), mutedLandColor(b10), mutedLandColor(b01), mutedLandColor(b11),
      bf, cellFw
    );
    vec3 mutedLand = mutedBlend.rgb * (1.0 - 0.05 * mutedBlend.a);
    mutedLand *= 1.0 + clamp(slopeRelief * 0.22, -0.12, 0.12);
    mutedLand = mix(mutedLand, ${glslVec3(MUTED_WATER_COLOR)} * 0.84, 0.62 * riverMask);
    mutedLand = mix(mutedLand, ${glslColor(TILE_COLORS.coastInk)}, 0.22 * riverOutline);

    vec3 mutedWater = mix(${glslVec3(MUTED_WATER_COLOR)}, ${glslVec3(MUTED_WATER_COLOR)} * 0.88, 0.55 * seaDepthNorm);
    mutedWater = mix(mutedWater, vec3(0.92, 0.96, 0.98), 0.24 * shallowRim);

    base = mix(mutedLand, mutedWater, isWater);
    base = mix(base, ${glslColor(TILE_COLORS.coastInk)}, 0.46 * coastLineOpen);
    if (uLayer < 3.5 && uResourceReady > 0.5) {
      // 자원 분포: 면 레벨 격자의 몫을 (s, t, 면)으로 읽는다(가까이선 칸 그대로, 멀리선 밉맵 평균)
      vec3 coord = vec3(uTile.xy + vUv * uTile.z, uTile.w);
      float share = texture(uResource, coord).r;
      float high = texture(uResourceHigh, coord).r;
      if (share > 0.002) base = mix(base, uResourceColor, ${RESOURCE_MIX_MIN.toFixed(3)} + ${(RESOURCE_MIX_MAX - RESOURCE_MIX_MIN).toFixed(3)} * share);
      base = mix(base, ${glslVec3(RESOURCE_HIGH_COLOR)}, 0.85 * high);
    }
  }

  bool wet = waterAmt > 0.5 || riverMask > 0.5;
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
}
