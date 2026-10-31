// 2차맵 낮밤 조명 — 순수 계산(three.js를 쓰지 않는다, 시험 대상). ADR 2026-10-28-s1-second-map "구현하며 정한 것 (2차맵 낮밤)".
// - 시각·항성·달은 1차맵 하늘과 같은 함수다(planet/sky.ts skyAt — 공용 행성 달력, D-091 지역 시각 = 경도, D-5030 하루 = 실제 1시간).
//   그래서 같은 시각에 1차맵의 그 자리와 2차맵이 같은 낮밤이다. 밤은 연출만이다(D-142, 판정에 쓰지 않는다).
// - 자리: 2차맵 키(1차맵 최소 칸의 셀 키) → 칸 가운데 방향·꼭짓점(@terra/planet/projection) → 위도·경도와 2차맵 세계 축.
//   세계 축은 그 칸의 면 격자 축이다: x = 칸 i가 커지는 쪽, y = 위, z = x × y(칸 j가 작아지는 쪽, 오른손 좌표).
//   면 0 가운데(S1 시험 2차맵)에서는 x 동·z 남이다. 다른 면에서는 북쪽이 돌아간다(면 3은 x가 남쪽). 극에서도 축이 정해진다.
// - 빛: 반구광(하늘·땅 색, 세기) + 방향광 하나(낮에는 항성, 밤에는 달). 빛 수가 늘 같아 셰이더를 다시 만들지 않는다.
//   방향광은 항성 직사광이 0이 된 뒤에만 달로 바뀐다(두 세기가 모두 0인 곳에서 방향을 바꾼다 — 튀지 않는다).
// - 낮밤 띠·박명 색·밤 색은 1차맵 낮밤 값(skyShade.ts DAY_NIGHT_SHADE, sky.ts DAY_NIGHT_BAND)을 그대로 쓴다.
// - 색 관리를 끈 렌더러라(sharedRenderer.ts) 색·세기는 sRGB 값에 그대로 곱한다. 숫자는 헤드리스 사진으로 고른 출발값이다(휴대폰에서 다듬는다).
import { isCellKey } from "@terra/planet";
import { type Vec3, cellCenter, cellCorners } from "@terra/planet/projection";
import { PLANET_CALENDAR_EPOCH_MS, PLANET_DAY_MS } from "@terra/shared/planetCalendar";
import { type PlanetSkyFeatures, type PlanetSkyState, localSolarHours } from "../planet/sky.ts";
import { DAY_NIGHT_SHADE, type Rgb, dayAmount } from "../planet/skyShade.ts";
import { add, cross, dot, normalize, scale, sub } from "../planet/vec3.ts";

export type { Rgb };

/** 2차맵 하나가 행성 위에 놓인 자리 */
export interface SecondMapPlace {
  readonly latDeg: number;
  /** 경도(°, −180 초과 180 이하) */
  readonly lonDeg: number;
  /** 2차맵 세계 축(행성 좌표 단위 벡터). x = 칸 i가 커지는 쪽, up = 칸 가운데 위쪽, z = x × up */
  readonly xAxis: Vec3;
  readonly up: Vec3;
  readonly zAxis: Vec3;
}

const DEG = Math.PI / 180;

/** 2차맵 키 → 자리. 셀 키가 아니면 null(엔진은 늘 낮으로 그린다) */
export function secondMapPlace(mapKey: number): SecondMapPlace | null {
  if (!isCellKey(mapKey)) return null;
  const up = cellCenter(mapKey);
  const [c0, c1, c2, c3] = cellCorners(mapKey);
  // i가 큰 쪽 꼭짓점(1, 2) − i가 작은 쪽(0, 3)을 위쪽에 수직으로 만든다
  const iward = sub(add(c1, c2), add(c0, c3));
  const xAxis = normalize(sub(iward, scale(up, dot(iward, up))));
  return {
    latDeg: Math.asin(Math.max(-1, Math.min(1, up[2]))) / DEG,
    lonDeg: Math.atan2(up[1], up[0]) / DEG,
    xAxis,
    up,
    zAxis: cross(xAxis, up),
  };
}

/** 행성 좌표 방향 → 2차맵 세계 좌표 방향(x, y 위, z) */
export function toMapDirection(place: SecondMapPlace, direction: Vec3): Vec3 {
  return [dot(direction, place.xAxis), dot(direction, place.up), dot(direction, place.zAxis)];
}

/**
 * 시험·사진용 시각(?second-map-time=): 그 2차맵의 지역 시각 hour(0 이상 24 이하)가 되는 서버 시각(정수 ms).
 * 날짜는 달력 기원에서 dayIndex일째다(기본 3일째: 첫 계절 가운데 앞이라 달이 거의 보름이다 — 밤 사진에 달빛이 든다).
 * 지역 시각 = 24 × 하루 비율 + 경도 ÷ 15(sky.ts localSolarHours)의 거꾸로다.
 */
export const PREVIEW_DAY_INDEX = 3;

export function utcMsForLocalHour(lonDeg: number, hour: number, dayIndex = PREVIEW_DAY_INDEX): number {
  const hoursIntoDay = (((hour - lonDeg / 15) % 24) + 24) % 24;
  return (
    PLANET_CALENDAR_EPOCH_MS + dayIndex * PLANET_DAY_MS + Math.round((hoursIntoDay / 24) * PLANET_DAY_MS)
  );
}

/** 한 시각의 2차맵 빛(three 빛에 그대로 넣는 값) */
export interface SecondMapLight {
  /** 반구광: 하늘 색·땅 색(0 ~ 1, 세기를 곱하기 전)과 세기 */
  readonly hemisphereSky: Rgb;
  readonly hemisphereGround: Rgb;
  readonly hemisphereIntensity: number;
  /** 방향광: 색, 세기, 빛이 오는 쪽(2차맵 세계 좌표 단위 벡터) */
  readonly directColor: Rgb;
  readonly directIntensity: number;
  readonly direction: Vec3;
  /** 2차맵 밖(하늘) 색 */
  readonly background: Rgb;
  /** 낮 정도(0 밤 ~ 1 낮, 1차맵 낮밤 띠와 같은 식) */
  readonly day: number;
  /** 방향광이 무엇인가: 항성·달·없음(세기 0) */
  readonly source: "sun" | "moon" | "none";
  /** 지역 시각(시, 0 이상 24 미만). 하늘이 없으면(끔·시각 모름) null */
  readonly localHours: number | null;
  /** 그 자리의 항성·달 고도(°). 하늘이 없으면 null */
  readonly sunElevationDeg: number | null;
  readonly moonElevationDeg: number | null;
  /** 첫 달의 밝은 비율(0 삭 ~ 1 보름). 달이 없으면 null */
  readonly moonLit: number | null;
}

/** 0xRRGGBB → [0, 1] */
const rgbOf = (hex: number): Rgb => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/** 지금(낮밤 전) 고정 빛: 하늘 색, 반구광, 방향광(방향 (0.55, 1, 0.4)) — 하늘 끔·시각을 모를 때 그대로 쓴다 */
const FIXED_SKY_HEX = 0xd6eef7;
const FIXED_GROUND_HEX = 0xb59f86;
const FIXED_DIRECTION: Vec3 = normalize([0.55, 1, 0.4]);

/**
 * 2차맵 낮밤 값(출발값). 낮 기준 = 지금 고정 빛이 위를 보는 면에 주는 밝기(반구 1.7 + 방향 2.1 × 0.827).
 * 사용자 확인(2026-10-31) "선명도 나쁘진 않음"의 그 모습이 한낮이다.
 */
export const SECOND_MAP_LIGHT = {
  hemisphereSky: [1, 1, 1] as Rgb,
  hemisphereGround: rgbOf(FIXED_GROUND_HEX),
  hemisphereIntensity: 1.7,
  sunIntensity: 2.1,
  /** 지금 고정 빛 방향의 위쪽 성분(항성 고도 약 55.8°) — 낮 기준 밝기를 정한다 */
  referenceSunSin: FIXED_DIRECTION[1],
  /**
   * 항성이 낮을 때 줄어든 직사광의 이 몫을 반구광으로 채운다. 지평선에서도 평지 밝기가 낮 기준의 약 80%다
   * (아침·저녁에도 읽기 쉽게. 0이면 약 50%까지 어두워진다)
   */
  lowSunFill: 0.6,
  /** 직사광이 켜지는 항성 고도 sin(지평선 약 −1.1° ~ +5.7°). 이 아래로는 항성 빛이 0이다 */
  sunDirect: { low: -0.02, high: 0.1 },
  /** 노을(항성이 낮을 때 직사광 색 곱). 고도 sin 0.35(약 20°) 위로는 흰색 */
  sunsetTint: [1.0, 0.8, 0.62] as Rgb,
  sunsetFrom: 0.35,
  /** 아침·저녁 반구광 색 곱(노을과 같은 정도로 준다). 직사광만 물들이면 평지에서는 거의 보이지 않았다(헤드리스 사진) */
  goldenTint: [1.0, 0.93, 0.85] as Rgb,
  /**
   * 땅에서 튀는 빛: 직사광이 평지에 주는 밝기(반구 세기에 견줌)의 이 몫을 반구광 땅 색에 곱해 더한다. 해가 머리 위면 옆면(유닛·건물 벽)에
   * 직사광이 닿지 않아 지금 고정 빛의 그늘 쪽보다 어두웠다(헤드리스 1440 한낮 사진에서 유닛이 검게 보임). 평지 밝기는 바꾸지 않는다
   */
  groundBounce: 0.4,
  /**
   * 달빛(푸른 방향광): 항성이 sunDirect.low 아래로 더 내려가 moonFrom(약 −5.7°)에 이르면 다 켜진다.
   * 세기 = moonIntensity × 밝은 비율 × 달이 뜬 정도(고도 sin −0.02 ~ 0.1)
   */
  moonTint: [0.68, 0.78, 1.0] as Rgb,
  moonIntensity: 0.35,
  moonFrom: -0.1,
  /**
   * 밤 깊이(0 = 늘 낮, 1 = 1차맵 지구본의 온전한 밤과 같은 빛). 1차맵 가까운 거리(옅은 밤)는 0.6이다(사용자 결정 U1 (나)).
   * 1이면 위를 보는 흰 면이 낮 기준의 약 0.54·0.57·0.75배(라벤더)다.
   */
  nightStrength: 1,
} as const;

/** 낮 기준 밝기(빛 단위: 반구 세기 + 방향 세기 × 위쪽 성분, π로 나누기 전) */
const REFERENCE_FLAT =
  SECOND_MAP_LIGHT.hemisphereIntensity + SECOND_MAP_LIGHT.sunIntensity * SECOND_MAP_LIGHT.referenceSunSin;

/**
 * 밤 바닥: 위를 보는 흰 면의 밝기(채널마다)가 어느 시각·위도·계절에도 낮 기준의 이 배 아래로 내려가지 않는다
 * (시험 secondMapLight.test.ts가 지킨다). 유닛·건물·아이콘·고른 표시가 밤에도 보이게 하는 아래 한계다.
 */
export const SECOND_MAP_NIGHT_FLOOR = 0.5;

/** 밤에 유닛 몸이 스스로 내는 빛(자기 색 × 이 값 × 밤 정도). 땅보다 밝게 남아 밤에도 유닛이 먼저 보인다 */
export const UNIT_NIGHT_LIFT = 0.3;

/** 하늘 끔·시각 모름: 지금 고정 빛 그대로 */
export const FIXED_SECOND_MAP_LIGHT: SecondMapLight = {
  hemisphereSky: SECOND_MAP_LIGHT.hemisphereSky,
  hemisphereGround: SECOND_MAP_LIGHT.hemisphereGround,
  hemisphereIntensity: SECOND_MAP_LIGHT.hemisphereIntensity,
  directColor: [1, 1, 1],
  directIntensity: SECOND_MAP_LIGHT.sunIntensity,
  direction: FIXED_DIRECTION,
  background: rgbOf(FIXED_SKY_HEX),
  day: 1,
  source: "sun",
  localHours: null,
  sunElevationDeg: null,
  moonElevationDeg: null,
  moonLit: null,
};

const clamp01 = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0);
function smoothstep(low: number, high: number, x: number): number {
  const u = clamp01((x - low) / (high - low));
  return u * u * (3 - 2 * u);
}
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const mapRgb = (f: (i: 0 | 1 | 2) => number): Rgb => [f(0), f(1), f(2)];

/** 밤 반구광(빛 단위, 채널마다): 위를 보는 흰 면이 1차맵 밤 빛 곱(밤 ÷ 낮)만큼 되게 */
function nightFlat(strength: number): Rgb {
  const s = DAY_NIGHT_SHADE;
  return mapRgb((i) => REFERENCE_FLAT * (1 + ((s.nightLight * s.nightTint[i]) / s.dayLight - 1) * strength));
}

/**
 * 그 시각 그 자리의 빛. sky가 null(끔·시각 모름)이거나 낮밤 요소를 끄면 고정 빛이다. features.moon이 false면 달빛이 없다.
 * nightStrength는 밤 깊이(기본 SECOND_MAP_LIGHT.nightStrength).
 */
export function secondMapLightAt(
  sky: PlanetSkyState | null,
  place: SecondMapPlace,
  features: PlanetSkyFeatures = {},
  nightStrength: number = SECOND_MAP_LIGHT.nightStrength,
): SecondMapLight {
  if (sky === null || features.dayNight === false) return FIXED_SECOND_MAP_LIGHT;
  const k = SECOND_MAP_LIGHT;
  const sun = toMapDirection(place, sky.sun.direction);
  const sunSin = sun[1];
  const day = dayAmount(sunSin);

  // 항성 직사광: 지평선 근처에서 꺼지고, 낮을수록 노을 색
  const sunUp = smoothstep(k.sunDirect.low, k.sunDirect.high, sunSin);
  const warmth = 1 - smoothstep(0, k.sunsetFrom, sunSin);
  const flatDirect = k.sunIntensity * sunUp * Math.max(0, sunSin);

  // 반구광: 낮(줄어든 직사광을 일부 채움)과 밤(1차맵 밤 색) 사이를 낮 정도로 잇고 박명 색을 곱한다
  const hemiDay = k.hemisphereIntensity + k.lowSunFill * (k.sunIntensity * k.referenceSunSin - flatDirect);
  const night = nightFlat(nightStrength);
  const twilight = DAY_NIGHT_SHADE.twilightAmount * 4 * day * (1 - day);
  const golden = warmth * day;
  const hemi = mapRgb(
    (i) =>
      lerp(night[i], hemiDay, day) *
      (1 + ((DAY_NIGHT_SHADE.twilightTint[i] ?? 1) - 1) * twilight) *
      (1 + ((k.goldenTint[i] ?? 1) - 1) * golden),
  );
  const hemisphereIntensity = Math.max(hemi[0], hemi[1], hemi[2]);
  const hemisphereSky = mapRgb((i) => hemi[i] / hemisphereIntensity);
  const bounce = 1 + (k.groundBounce * flatDirect) / hemisphereIntensity;
  const hemisphereGround = mapRgb((i) => (k.hemisphereGround[i] ?? 0) * hemisphereSky[i] * bounce);

  // 방향광: 항성 직사광이 있으면 항성, 없으면(항성이 sunDirect.low 아래) 달
  const moonState = sky.moons[0];
  let directColor: Rgb = mapRgb((i) => lerp(1, k.sunsetTint[i] ?? 1, warmth));
  let directIntensity = k.sunIntensity * sunUp;
  let direction: Vec3 = sun;
  let source: SecondMapLight["source"] = directIntensity > 0 ? "sun" : "none";
  let moonElevationDeg: number | null = null;
  if (moonState) {
    const moon = toMapDirection(place, moonState.direction);
    moonElevationDeg = Math.asin(Math.max(-1, Math.min(1, moon[1]))) / DEG;
    if (directIntensity <= 0 && features.moon !== false) {
      const moonUp = smoothstep(k.sunDirect.low, k.sunDirect.high, moon[1]);
      const dark = 1 - smoothstep(k.moonFrom, k.sunDirect.low, sunSin);
      const intensity = k.moonIntensity * moonState.litFraction * moonUp * dark;
      if (intensity > 0) {
        directColor = k.moonTint;
        directIntensity = intensity;
        direction = moon;
        source = "moon";
      }
    }
  }

  // 하늘 색: 지금 하늘 색 × 위를 보는 흰 면 밝기(낮 기준에 견줌, 1을 넘지 않게)
  const fixedBackground = FIXED_SECOND_MAP_LIGHT.background;
  const flat = flatLight({
    hemisphereSky,
    hemisphereGround,
    hemisphereIntensity,
    directColor,
    directIntensity,
    direction,
  });
  const background = mapRgb(
    (i) => (fixedBackground[i] ?? 0) * Math.min(1, flat[i] / (REFERENCE_FLAT / Math.PI)),
  );

  return {
    hemisphereSky,
    hemisphereGround,
    hemisphereIntensity,
    directColor,
    directIntensity,
    direction,
    background,
    day,
    source,
    localHours: localSolarHours(sky.calendar, place.lonDeg),
    sunElevationDeg: Math.asin(Math.max(-1, Math.min(1, sunSin))) / DEG,
    moonElevationDeg,
    moonLit: moonState ? moonState.litFraction : null,
  };
}

type LightTerms = Pick<
  SecondMapLight,
  | "hemisphereSky"
  | "hemisphereGround"
  | "hemisphereIntensity"
  | "directColor"
  | "directIntensity"
  | "direction"
>;

/**
 * three Lambert와 같은 식으로 흰 면(반사율 1)이 받는 밝기(채널마다, 색 관리 끔이라 sRGB 값 곱):
 * (반구(하늘·땅을 법선으로 섞음) × 세기 + 방향광 색 × 세기 × max(0, 법선 · 방향)) ÷ π. 기본 법선은 위(평지).
 */
export function flatLight(light: LightTerms, normal: Vec3 = [0, 1, 0]): Rgb {
  const w = 0.5 * normal[1] + 0.5;
  const lambert = Math.max(0, dot(normal, light.direction));
  return mapRgb(
    (i) =>
      (lerp(light.hemisphereGround[i] ?? 0, light.hemisphereSky[i] ?? 0, w) * light.hemisphereIntensity +
        (light.directColor[i] ?? 0) * light.directIntensity * lambert) /
      Math.PI,
  );
}

/** 낮 기준(지금 고정 빛이 평지에 주는 밝기, π로 나눈 값) — 시험·통계가 밝기를 이것에 견준다 */
export const REFERENCE_FLAT_LIGHT = REFERENCE_FLAT / Math.PI;

/** 밤 정도(유닛 밤 빛 세기에 곱한다) = 1 − 낮 정도. 고정 빛은 0 */
export const nightAmount = (light: SecondMapLight): number => 1 - light.day;

/**
 * 두 빛이 눈에 띄게 다른가(쉬는 동안 다시 그릴지): 평지 밝기 채널이 1/255 넘게, 또는 방향광이 0.5° 넘게(세기가 있을 때) 바뀌면.
 * 항성은 1초에 0.1° 돌아(D-5030) 한낮에는 약 5초에 한 번, 박명에는 밝기가 빨리 바뀌어 더 자주 그린다.
 */
export function lightChanged(a: SecondMapLight, b: SecondMapLight): boolean {
  if (a.source !== b.source) return true;
  const fa = flatLight(a);
  const fb = flatLight(b);
  for (let i = 0; i < 3; i++) if (Math.abs((fa[i] ?? 0) - (fb[i] ?? 0)) > 1 / 255) return true;
  if (Math.abs(a.directIntensity - b.directIntensity) > 0.01) return true;
  if (a.directIntensity > 0 || b.directIntensity > 0) {
    if (dot(a.direction, b.direction) < Math.cos(0.5 * DEG)) return true;
  }
  return false;
}

/** 두 빛 사이(u = 0이면 a, 1이면 b) — 시계를 늦게 재거나 모드를 바꿀 때 0.5초에 걸쳐 옮긴다 */
export function blendLight(a: SecondMapLight, b: SecondMapLight, u: number): SecondMapLight {
  if (u >= 1) return b;
  if (u <= 0) return a;
  const mix = (x: Rgb, y: Rgb): Rgb => mapRgb((i) => lerp(x[i] ?? 0, y[i] ?? 0, u));
  // 방향은 세기를 곱한 벡터를 섞는다: 한쪽 세기가 0이면 다른 쪽 방향만 남는다
  const va = scale(a.direction, a.directIntensity);
  const vb = scale(b.direction, b.directIntensity);
  const mixed = add(scale(va, 1 - u), scale(vb, u));
  const mixedLength = Math.hypot(...mixed);
  return {
    ...b,
    hemisphereSky: mix(a.hemisphereSky, b.hemisphereSky),
    hemisphereGround: mix(a.hemisphereGround, b.hemisphereGround),
    hemisphereIntensity: lerp(a.hemisphereIntensity, b.hemisphereIntensity, u),
    directColor: mix(a.directColor, b.directColor),
    directIntensity: lerp(a.directIntensity, b.directIntensity, u),
    direction: mixedLength > 1e-9 ? scale(mixed, 1 / mixedLength) : b.direction,
    background: mix(a.background, b.background),
    day: lerp(a.day, b.day, u),
  };
}
