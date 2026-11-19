// 1차맵 타일 조각 셰이더(WebGL2 GLSL) — 2×2 이웃 부드러운 지형·해안선·하천·기후 등온선·고도 등고선·전략 아틀라스 바탕.
// 칸 텍스처(uCellData·uCellExtra)는 바이옴·물 비트(정수)를 담아 NearestFilter지만, 셰이더에서 주변 2×2 칸을 읽어
// 육지·바다를 따로 부드럽게 섞어 픽셀 계단을 없애고 전략 지도(4X·삼국지)다운 해안선·등고선·강 줄기를 만든다.
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

/** 바다 수심 색(연안·대륙붕·심해), 호수·강·기후·해안 보정 색 */
export const TILE_COLORS = {
  coastal: 0x62b7d9,
  shelf: 0x3b8dc2,
  deep: 0x265e96,
  lake: 0x4ca6cf,
  river: 0x3482b8,
  riverHighlight: 0x6cc0e3,
  riverBank: 0x467a44,
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
  float river;
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
  float rv = floor(e.g * 255.0 + 0.5);
  bool oc = (w & ${WATER_OCEAN}) != 0;
  bool lk = (w & ${WATER_LAKE}) != 0;
  bool rb = (w & ${WATER_RIVER}) != 0;
  int dc = (w & ${WATER_DEPTH_MASK}) >> ${WATER_DEPTH_SHIFT};
  s.oceanMask = oc ? 1.0 : 0.0;
  s.lakeMask = lk ? 1.0 : 0.0;
  s.waterMask = (oc || lk) ? 1.0 : 0.0;
  s.river = (oc || lk) ? 0.0 : ((rv > 0.5 || rb) ? (0.48 + 0.16 * min(rv, 3.0)) : 0.0);
  if (oc) {
    s.waterColor = dc == ${DEPTH_COASTAL} ? ${glslColor(TILE_COLORS.coastal)} : dc == ${DEPTH_DEEP} ? ${glslColor(TILE_COLORS.deep)} : ${glslColor(TILE_COLORS.shelf)};
  } else if (lk) {
    s.waterColor = ${glslColor(TILE_COLORS.lake)};
  } else {
    s.waterColor = ${glslColor(TILE_COLORS.coastal)};
  }
  return s;
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

// 결정적 세계 좌표(s, t) 미세 굴곡 — 타일 이음매 없이 직각 해안선·호수 계단을 유기적인 지도 해안선으로 다듬는다
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = smoothstep(0.0, 1.0, fract(p));
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float coastWobble(vec2 worldST) {
  // 칸 크기에 맞춰 2옥타브 자연 굴곡(-1 ~ +1)
  vec2 q = worldST * 512.0;
  float n = valueNoise(q * 2.2) * 0.65 + valueNoise(q * 5.1 + vec2(17.3, 9.7)) * 0.35;
  return (n - 0.5) * 2.0;
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
  // 주변 2×2 칸 표본으로 픽셀 계단을 줄이고 유기적인 해안선·하천·기후 경계를 만든다
  vec2 tc = vUv * uCells - 0.5;
  vec2 baseCell = floor(tc);
  vec2 frac = clamp(tc - baseCell, 0.0, 1.0);
  vec2 fs = smoothstep(0.06, 0.94, frac);
  float maxIdx = uCells - 1.0;
  ivec2 p00 = ivec2(clamp(baseCell, vec2(0.0), vec2(maxIdx)));
  ivec2 p10 = ivec2(clamp(baseCell + vec2(1.0, 0.0), vec2(0.0), vec2(maxIdx)));
  ivec2 p01 = ivec2(clamp(baseCell + vec2(0.0, 1.0), vec2(0.0), vec2(maxIdx)));
  ivec2 p11 = ivec2(clamp(baseCell + vec2(1.0, 1.0), vec2(0.0), vec2(maxIdx)));

  CellSample s00 = sampleCell(p00);
  CellSample s10 = sampleCell(p10);
  CellSample s01 = sampleCell(p01);
  CellSample s11 = sampleCell(p11);

  float w00 = (1.0 - fs.x) * (1.0 - fs.y);
  float w10 = fs.x * (1.0 - fs.y);
  float w01 = (1.0 - fs.x) * fs.y;
  float w11 = fs.x * fs.y;

  float waterAmtRaw = s00.waterMask * w00 + s10.waterMask * w10 + s01.waterMask * w01 + s11.waterMask * w11;
  float lakeAmt = s00.lakeMask * w00 + s10.lakeMask * w10 + s01.lakeMask * w01 + s11.lakeMask * w11;
  // 물·육지 경계에만 미세한 자연 굴곡을 더해 직각 격자 계단을 없앤다(타일 좌표 기반이라 이음매 없음)
  vec2 worldST = uTile.xy + vUv * uTile.z;
  float edgeActivity = smoothstep(0.02, 0.25, waterAmtRaw) * (1.0 - smoothstep(0.75, 0.98, waterAmtRaw));
  float wobble = coastWobble(worldST) * 0.14 * edgeActivity;
  float waterAmt = clamp(waterAmtRaw + wobble, 0.0, 1.0);
  float isWater = smoothstep(0.43, 0.57, waterAmt);
  // 해안 윤곽선·얕은 연안 물결·해변 띠
  float coastLine = smoothstep(0.32, 0.50, waterAmt) * (1.0 - smoothstep(0.50, 0.68, waterAmt));
  float shallowRim = smoothstep(0.50, 0.62, waterAmt) * (1.0 - smoothstep(0.70, 0.99, waterAmt));
  float beachRim = smoothstep(0.16, 0.42, waterAmt) * (1.0 - smoothstep(0.44, 0.55, waterAmt));

  // 하천: 대각선 칸끼리 끊기지 않도록 대각 다리 보간을 더해 매끈한 강 줄기를 만든다
  float rw00 = (1.0 - frac.x) * (1.0 - frac.y);
  float rw10 = frac.x * (1.0 - frac.y);
  float rw01 = (1.0 - frac.x) * frac.y;
  float rw11 = frac.x * frac.y;
  float riverLin = s00.river * rw00 + s10.river * rw10 + s01.river * rw01 + s11.river * rw11;
  float diagMain = min(s00.river, s11.river) * (1.0 - smoothstep(0.18, 0.55, abs(frac.x - frac.y)));
  float diagAnti = min(s10.river, s01.river) * (1.0 - smoothstep(0.18, 0.55, abs(frac.x + frac.y - 1.0)));
  float riverField = max(riverLin, max(diagMain, diagAnti) * 0.92);
  float riverBand = smoothstep(0.24, 0.46, riverField);
  float riverCore = smoothstep(0.46, 0.74, riverField);
  float riverValley = smoothstep(0.08, 0.26, riverField) * (1.0 - riverBand);

  float top = max(uElevationMax, 1.0);
  float hNorm = clamp(vHeight / top, 0.0, 1.0);
  float seaDepthNorm = clamp(-vHeight / (top * ${ELEVATION_SEA_SCALE.toFixed(4)}), 0.0, 1.0);

  vec3 n = normalize(vNormal);
  float slopeRelief = dot(n, uLightDir) - dot(normalize(vUpView), uLightDir);

  vec3 base;
  if (uLayer < 0.5) {
    // 1. 지형: 육지끼리만 부드럽게 섞고, 고산·설산·강변·연안 물결·해안선으로 전략 지도 질감을 살린다
    float lw00 = w00 * (1.0 - s00.waterMask);
    float lw10 = w10 * (1.0 - s10.waterMask);
    float lw01 = w01 * (1.0 - s01.waterMask);
    float lw11 = w11 * (1.0 - s11.waterMask);
    float lwSum = max(lw00 + lw10 + lw01 + lw11, 1e-4);
    vec3 land = (terrainLandColor(s00) * lw00 + terrainLandColor(s10) * lw10 + terrainLandColor(s01) * lw01 + terrainLandColor(s11) * lw11) / lwSum;
    // 고산 암석·만년설 음영과 약한 지형 기복 강조
    land = mix(land, ${glslColor(TILE_COLORS.alpineRock)}, 0.34 * smoothstep(0.45, 0.78, hNorm));
    land = mix(land, ${glslColor(TILE_COLORS.alpineSnow)}, 0.62 * smoothstep(0.76, 0.96, hNorm));
    land = mix(land, ${glslColor(TILE_COLORS.beachSand)}, 0.24 * beachRim * (1.0 - smoothstep(0.04, 0.14, hNorm)));
    // 강변 비옥 띠 + 부드러운 강 줄기
    land = mix(land, ${glslColor(TILE_COLORS.riverBank)}, 0.18 * riverValley);
    vec3 riverCol = mix(${glslColor(TILE_COLORS.river)}, ${glslColor(TILE_COLORS.riverHighlight)}, 0.38 * riverCore);
    land = mix(land, riverCol, 0.84 * riverBand);
    // 산맥·구릉 기복감을 지형색에도 살짝 보태 전략 지도의 입체감을 높인다
    land *= 1.0 + clamp(slopeRelief * 0.24, -0.14, 0.16);

    float ww00 = w00 * s00.waterMask;
    float ww10 = w10 * s10.waterMask;
    float ww01 = w01 * s01.waterMask;
    float ww11 = w11 * s11.waterMask;
    float wwSum = max(ww00 + ww10 + ww01 + ww11, 1e-4);
    vec3 water = (s00.waterColor * ww00 + s10.waterColor * ww10 + s01.waterColor * ww01 + s11.waterColor * ww11) / wwSum;
    // 수심에 따른 자연스러운 해양 그라데이션 + 얕은 연안 빛
    water = mix(water, ${glslColor(TILE_COLORS.deep)}, 0.30 * seaDepthNorm * (1.0 - smoothstep(0.2, 0.7, lakeAmt)));
    water = mix(water, ${glslColor(TILE_COLORS.riverHighlight)}, 0.22 * shallowRim);

    base = mix(land, water, isWater);
    // 또렷한 해안선 잉크 테두리
    base = mix(base, ${glslColor(TILE_COLORS.coastInk)}, 0.42 * coastLine);
  } else if (uLayer < 1.5) {
    // 2. 기후: 기온·습도 부드러운 보간 + 10°C 등온선 + 해안선
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
    // 4·5. 자원 분포·영토(정치 아틀라스): 고지도·전략판 느낌의 깔끔한 바탕 + 산맥 기복 + 옅은 하천 + 선명한 해안선
    float lw00 = w00 * (1.0 - s00.waterMask);
    float lw10 = w10 * (1.0 - s10.waterMask);
    float lw01 = w01 * (1.0 - s01.waterMask);
    float lw11 = w11 * (1.0 - s11.waterMask);
    float lwSum = max(lw00 + lw10 + lw01 + lw11, 1e-4);
    vec3 mutedLand = (mutedLandColor(s00) * lw00 + mutedLandColor(s10) * lw10 + mutedLandColor(s01) * lw01 + mutedLandColor(s11) * lw11) / lwSum;
    // 전략 지도 산맥 음영과 은은한 강 줄기
    mutedLand *= 1.0 + clamp(slopeRelief * 0.22, -0.12, 0.12);
    mutedLand = mix(mutedLand, ${glslVec3(MUTED_WATER_COLOR)} * 0.86, 0.48 * riverBand);

    vec3 mutedWater = mix(${glslVec3(MUTED_WATER_COLOR)}, ${glslVec3(MUTED_WATER_COLOR)} * 0.88, 0.55 * seaDepthNorm);
    mutedWater = mix(mutedWater, vec3(0.92, 0.96, 0.98), 0.24 * shallowRim);

    base = mix(mutedLand, mutedWater, isWater);
    base = mix(base, ${glslColor(TILE_COLORS.coastInk)}, 0.46 * coastLine);
    if (uLayer < 3.5 && uResourceReady > 0.5) {
      // 자원 분포: 면 레벨 격자의 몫을 (s, t, 면)으로 읽는다(가까이선 칸 그대로, 멀리선 밉맵 평균)
      vec3 coord = vec3(uTile.xy + vUv * uTile.z, uTile.w);
      float share = texture(uResource, coord).r;
      float high = texture(uResourceHigh, coord).r;
      if (share > 0.002) base = mix(base, uResourceColor, ${RESOURCE_MIX_MIN.toFixed(3)} + ${(RESOURCE_MIX_MAX - RESOURCE_MIX_MIN).toFixed(3)} * share);
      base = mix(base, ${glslVec3(RESOURCE_HIGH_COLOR)}, 0.85 * high);
    }
  }

  bool wet = waterAmt > 0.5;
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
