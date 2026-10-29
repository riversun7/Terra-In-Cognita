// 1차맵 하늘 계산 — 순수 함수(시험 대상, three.js를 쓰지 않는다). ADR 2026-10-29-primary-map-sky 3·5절.
// - 화면 연출만이라 엔진의 Math 함수를 쓴다(판정 코드가 아니다, ADR 36과 같다). 판정이 쓰는 값(계절)은 공용 달력이 정수로 낸다.
// - 시각: 서버 UTC ms → @terra/shared/planetCalendar. 기기 시각은 소수가 섞이므로 planetCalendarForDisplay가 내림한다(검토 H1).
// - 좌표: 행성 좌표(globeCamera.ts와 같다) — 원점 행성 중심, 북극 +z, 경도 0 = +x, 동쪽 = +y. 방향은 단위 벡터.
// - 임시 값은 PLACEHOLDER_PLANET_SKY 한곳에 모은다([임시]). 기획 답이 오면 콘텐츠 팩 → 목록 정보 → 행성 설명으로 옮긴다.
// - 화면 쪽 계산(낮밤 세기·구름 걷힘·보임·하늘 시계)도 여기 둔다. 값은 시제품 출발값이고 휴대폰에서 다듬는다(ADR 4·6·7절).
import {
  PLANET_DAY_MS,
  PLANET_YEAR_MS,
  type PlanetCalendar,
  planetCalendarForDisplay,
} from "@terra/shared/planetCalendar";
import { GLOBE_FOV_RAD, type GlobePose, type Viewport, raySphere, screenRay } from "./globeCamera.ts";
import type { PlanetLayer } from "./planetTypes.ts";
import { type Vec3, add, addScaled, angleBetween, dot, length, normalize, scale, sub } from "./vec3.ts";

/** 하늘 보기(화면이 정한다). 없으면 off = 지금 모습(카메라 빛, 밤·달·구름 없음) */
export type PlanetSkyMode =
  | { readonly kind: "off" }
  | {
      readonly kind: "clock";
      /** 서버 시각(ms). null이면 시계를 아직 못 쟀다(낮으로 그린다). 소수여도 된다(엔진이 내림한다) */
      readonly serverNow: () => number | null;
      readonly features?: PlanetSkyFeatures;
    }
  | { readonly kind: "fixed"; readonly utcMs: number; readonly features?: PlanetSkyFeatures };

/** 켤 요소. 기본은 모두 켬. 휴대폰 켬·끔 비교와 대체 경로에 쓴다. 구름 그림자는 없다(사용자 결정 U2) */
export interface PlanetSkyFeatures {
  readonly dayNight?: boolean;
  readonly moon?: boolean;
  readonly clouds?: boolean;
}

/** 달 하나(화면 연출만: 조수·사건·달빛 없음) */
export interface PlanetMoonDescription {
  /** 삭망월(위상 한 바퀴, 정수 ms) */
  readonly synodicMs: number;
  /** 달력 기원 뒤 첫 삭(새 달)까지(정수 ms) */
  readonly newMoonOffsetMs: number;
  /** 궤도 기울기(황도 기준, °) */
  readonly inclinationDeg: number;
  /** 승교점(궤도가 황도를 남에서 북으로 지나는 곳)의 황도 경도(°, 고정) */
  readonly ascendingNodeDeg: number;
  /** 보이는 거리·반지름(행성 반지름 배수). 화면 표현 값이고 항성계 규모가 아니다 */
  readonly distanceRadii: number;
  readonly radiusRadii: number;
  /** 크레이터 모습 시드(u32) — 모든 기기에서 같은 모습 */
  readonly lookSeed: number;
}

/** 행성 하나의 하늘 값 */
export interface PlanetSkyDescription {
  /** 자전축 기울기(°). 0이면 계절이 없다 */
  readonly axialTiltDeg: number;
  /** 북반구 춘분이 오는 한 해 안 자리(0 이상 1 미만). 1/8이면 계절 가운데가 춘분·하지·추분·동지 */
  readonly equinoxYearFraction: number;
  /** 달(0~4개, 엔진은 먼 것부터 그린다) */
  readonly moons: readonly PlanetMoonDescription[];
}

/**
 * [임시] 기획 답 전의 하늘 값(docs/questions/2026-10-29-game-calendar.md 질문 2·3, …-primary-map-sky.md 질문 8~13).
 * 자전축은 지구 값, 계절 가운데 = 춘분·하지·추분·동지. 달은 삭망월 7일(실제 7시간, 계절에 한 번), 삭 = 계절 첫날
 * (그래서 보름 = 계절 가운데), 궤도 기울기 5°(지구 달 5.145°), 승교점 고정, 거리 12R·반지름 0.27R(보이는 축척).
 */
export const PLACEHOLDER_PLANET_SKY: PlanetSkyDescription = {
  axialTiltDeg: 23.44,
  equinoxYearFraction: 1 / 8,
  moons: [
    {
      synodicMs: 7 * PLANET_DAY_MS,
      newMoonOffsetMs: 0,
      inclinationDeg: 5,
      ascendingNodeDeg: 0,
      distanceRadii: 12,
      radiusRadii: 0.27,
      lookSeed: 20_261_029,
    },
  ],
};

/** 항성 */
export interface SunState {
  /** 항성 쪽 단위 벡터(행성 좌표) */
  readonly direction: Vec3;
  /** 항성 바로 아래 점: 위도(°) = 적위(항성이 적도에서 남북으로 떨어진 각), 경도(°, −180 이상 180 미만) */
  readonly subsolarLatDeg: number;
  readonly subsolarLonDeg: number;
}

/** 달 */
export interface MoonState {
  /** 행성 중심에서 달 쪽 단위 벡터(행성 좌표). 달 중심 = 방향 × distanceRadii × R */
  readonly direction: Vec3;
  /** 궤도 극(단위 벡터, 별에 고정) — 조석 고정 자세(앞면이 늘 행성 쪽)를 잡을 때 쓴다 */
  readonly orbitPole: Vec3;
  /** 위상(0 이상 1 미만): 0 삭 → 0.5 보름 */
  readonly phase: number;
  /** 행성 중심에서 본 밝은 부분 비율(0 삭 ~ 1 보름) = (1 − cos 이각) ÷ 2 */
  readonly litFraction: number;
}

/** 한 시각의 하늘 */
export interface PlanetSkyState {
  /** 내린 시각(정수 ms) */
  readonly utcMs: number;
  readonly calendar: PlanetCalendar;
  readonly sun: SunState;
  /** 행성 설명의 달 순서 그대로 */
  readonly moons: readonly MoonState[];
}

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;

/** −π 이상 π 미만으로 감는다 */
const wrapPi = (angle: number): number => angle - TAU * Math.floor((angle + Math.PI) / TAU);

/** 항성의 각(rad): 황도 경도 L(공전 궤도 위의 각), 적위 δ, 항성 바로 아래 경도 λs */
interface StarAngles {
  readonly eclipticLongitude: number;
  readonly declination: number;
  readonly subsolarLongitude: number;
}

/**
 * 원 궤도, 균시차 없음(D-091은 지역 시각을 경도로만 정하고, 길이가 같은 계절은 원 궤도로 본다: Assumed).
 * L = 2π(한 해 비율 − φ0), δ = asin(sin ε · sin L), λs = π − 2π·하루 비율(서쪽으로 돈다 = 순행 자전).
 */
function starAngles(calendar: PlanetCalendar, sky: PlanetSkyDescription): StarAngles {
  const dayFraction = calendar.msIntoDay / PLANET_DAY_MS;
  const yearFraction = calendar.msIntoYear / PLANET_YEAR_MS;
  const eclipticLongitude = TAU * (yearFraction - sky.equinoxYearFraction);
  return {
    eclipticLongitude,
    declination: Math.asin(Math.sin(sky.axialTiltDeg * DEG) * Math.sin(eclipticLongitude)),
    subsolarLongitude: wrapPi(Math.PI - TAU * dayFraction),
  };
}

/** 항성 방향 s = (cos δ cos λs, cos δ sin λs, sin δ). 그곳 항성 고도의 sin = 위쪽 · s */
function sunDirection({ declination, subsolarLongitude }: StarAngles): Vec3 {
  const c = Math.cos(declination);
  return [c * Math.cos(subsolarLongitude), c * Math.sin(subsolarLongitude), Math.sin(declination)];
}

/** 그 날짜의 항성 */
export function sunAt(calendar: PlanetCalendar, sky: PlanetSkyDescription): SunState {
  const star = starAngles(calendar, sky);
  return {
    direction: sunDirection(star),
    subsolarLatDeg: star.declination / DEG,
    subsolarLonDeg: star.subsolarLongitude / DEG,
  };
}

/** 삭에서 지난 시간(ms, 0 이상 삭망월 미만). 기원에서 잰 정수 ms의 나머지라 먼 미래에도 정확하다 */
export function moonPhaseMs(calendar: PlanetCalendar, moon: PlanetMoonDescription): number {
  const sinceNewMoon = calendar.msSinceEpoch - moon.newMoonOffsetMs;
  return ((sinceNewMoon % moon.synodicMs) + moon.synodicMs) % moon.synodicMs;
}

/**
 * 그 날짜의 달(원 궤도, 승교점 고정). 달의 황도 경도 = 항성의 L + 2π·위상(삭이면 항성과 같은 황도 경도).
 * 황도 좌표에서 기울기·승교점으로 돌린 뒤 x축으로 ε(황도 → 관성 적도), z축으로 −θ(관성 적도 → 행성 좌표)를 돌린다.
 * θ = 항성 적경 α − λs라서 이 변환 위의 항성은 sunAt의 항성과 같은 방향이다(시험).
 */
export function moonAt(
  calendar: PlanetCalendar,
  sky: PlanetSkyDescription,
  moon: PlanetMoonDescription,
): MoonState {
  const star = starAngles(calendar, sky);
  const tilt = sky.axialTiltDeg * DEG;
  const longitude = star.eclipticLongitude;
  const theta =
    Math.atan2(Math.cos(tilt) * Math.sin(longitude), Math.cos(longitude)) - star.subsolarLongitude;
  const phase = moonPhaseMs(calendar, moon) / moon.synodicMs;
  const node = moon.ascendingNodeDeg * DEG;
  const inclination = moon.inclinationDeg * DEG;
  // 위도 인수 u(승교점부터 잰 궤도 위의 각). 기울기가 작아 실제 황도 경도와의 차는 기울기² ÷ 4 안팎이다
  const u = longitude + TAU * phase - node;
  const cosI = Math.cos(inclination);
  const sinI = Math.sin(inclination);
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  // 황도 좌표 → 행성 좌표
  const toPlanet = ([x, y, z]: Vec3): Vec3 => {
    const yEquator = y * cosTilt - z * sinTilt;
    return [
      x * cosTheta + yEquator * sinTheta,
      -x * sinTheta + yEquator * cosTheta,
      y * sinTilt + z * cosTilt,
    ];
  };
  const direction = toPlanet([
    cosNode * Math.cos(u) - sinNode * Math.sin(u) * cosI,
    sinNode * Math.cos(u) + cosNode * Math.sin(u) * cosI,
    Math.sin(u) * sinI,
  ]);
  return {
    direction,
    orbitPole: toPlanet([sinNode * sinI, -cosNode * sinI, cosI]),
    phase,
    litFraction: (1 - dot(direction, sunDirection(star))) / 2,
  };
}

/** 지역 시각(시, 0 이상 24 미만) = 24 × 하루 비율 + 경도 ÷ 15°(D-091: 지역 시각은 경도로) */
export function localSolarHours(calendar: PlanetCalendar, lonDeg: number): number {
  const hours = (calendar.msIntoDay / PLANET_DAY_MS) * 24 + lonDeg / 15;
  return ((hours % 24) + 24) % 24;
}

/**
 * 그 시각의 하늘(엔진이 프레임마다 부르는 입구). 던지지 않는다: 소수 시각은 내리고, 수가 아니거나 달력 범위 밖이면 null
 * (시각을 모르는 것과 같다 — 낮으로 그린다).
 */
export function skyAt(
  utcMs: number,
  sky: PlanetSkyDescription = PLACEHOLDER_PLANET_SKY,
): PlanetSkyState | null {
  const calendar = planetCalendarForDisplay(utcMs);
  if (calendar === null) return null;
  return {
    utcMs: Math.floor(utcMs),
    calendar,
    sun: sunAt(calendar, sky),
    moons: sky.moons.map((moon) => moonAt(calendar, sky, moon)),
  };
}

// ── 화면 쪽 계산 ──

const clamp01 = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0);
const smoothstep01 = (u: number): number => u * u * (3 - 2 * u);

/**
 * 낮밤 띠: 항성 고도의 sin(= 위쪽 · 항성 방향)이 low~high 사이에서 밤에서 낮으로 바뀐다(고도 약 −8.0° ~ +3.4°).
 * 셰이더 출발값(시제품 3판)과 같은 값이다. 하늘 시계는 이 띠가 화면에 있는지로 간격을 정한다.
 */
export const DAY_NIGHT_BAND = { low: -0.14, high: 0.06 } as const;

/** 가까운 거리의 밤 규칙: 가장 가까이 closest, 거리(목표점에서 카메라까지) fullFromRadii × R부터 1 */
export interface CloseNightRule {
  readonly closest: number;
  readonly fullFromRadii: number;
}

/**
 * 사용자 결정 U1 (나) "가까이선 옅은 밤"(2026-10-29): 가장 가까이(F9 약 12km)에서 0.6, 거리 0.5R(F9 약 265km)부터 1.
 * 일하는 거리에서도 라벤더 밤 기운이 옅게 남는다(시제품 사진 v2-close-night-near06).
 */
export const CLOSE_NIGHT_RULE: CloseNightRule = { closest: 0.6, fullFromRadii: 0.5 };

/** 기후 레이어(자료 색·범례)의 낮밤 세기 배율. 1이면 밤 쪽 범례 색이 탁해졌다(시제품 사진) */
export const CLIMATE_NIGHT_FACTOR = 0.35;

/**
 * 낮밤 세기(0 = 늘 낮, 1 = 온전한 밤). 거리는 목표점에서 카메라까지(GlobeState.distance), 가장 가까운 거리는 globeLimits 값.
 * 사이는 로그 거리를 따라 smoothstep으로 늘어난다(기울기 tiltFor와 같은 모양). 0.5R가 가장 가까운 거리보다 가까운
 * 작은 행성은 늘 1이다. 거리가 수가 아니거나 0 이하면 가장 가까운 값이다.
 */
export function nightStrength(
  distanceM: number,
  minDistanceM: number,
  radiusM: number,
  layer: PlanetLayer,
  rule: CloseNightRule = CLOSE_NIGHT_RULE,
): number {
  const low = Math.log(minDistanceM);
  const high = Math.log(rule.fullFromRadii * radiusM);
  const u = high > low ? clamp01((Math.log(distanceM) - low) / (high - low)) : 1;
  const strength = rule.closest + (1 - rule.closest) * smoothstep01(u);
  return layer === "climate" ? strength * CLIMATE_NIGHT_FACTOR : strength;
}

/** 구름 걷힘: 거리(목표점에서 카메라까지)가 nearRadii × R 안쪽이면 구름이 없고 farRadii × R 밖은 온전하다 */
export const CLOUD_FADE = { nearRadii: 1.2, farRadii: 2.5, thresholdLift: 0.24 } as const;

export interface CloudFade {
  /** smoothstep(1.2R, 2.5R, 거리) */
  readonly u: number;
  /** 덮임 문턱에 더하는 값 = 0.24 × (1 − u)(투명해지는 대신 걷힌다) */
  readonly thresholdShift: number;
  /** 불투명도 배율 = √u */
  readonly opacityScale: number;
  /** u > 0일 때만 껍질을 그린다(아니면 visible = false, 비용 0) */
  readonly visible: boolean;
}

/** 가까이 갈 때 구름(ADR 6절, 걷히기). F9에서 약 637km 안쪽(일하는 거리)에는 구름이 없다 */
export function cloudFade(distanceM: number, radiusM: number): CloudFade {
  const u = smoothstep01(
    clamp01(
      (distanceM - CLOUD_FADE.nearRadii * radiusM) / ((CLOUD_FADE.farRadii - CLOUD_FADE.nearRadii) * radiusM),
    ),
  );
  return {
    u,
    thresholdShift: CLOUD_FADE.thresholdLift * (1 - u),
    opacityScale: Math.sqrt(u),
    visible: u > 0,
  };
}

/** 화면 네 모서리(CSS px) */
const corners = (viewport: Viewport) => [
  { x: 0, y: 0 },
  { x: viewport.width, y: 0 },
  { x: 0, y: viewport.height },
  { x: viewport.width, y: viewport.height },
];

/** 화면에 하늘이 보이는가: 네 모서리 시선 중 하나라도 행성(반지름 radiusM)을 비킨다. 행성의 화면 모양이 볼록이라 정확하다 */
export function skyOnScreen(
  pose: GlobePose,
  viewport: Viewport,
  radiusM: number,
  fov = GLOBE_FOV_RAD,
): boolean {
  return corners(viewport).some((point) => {
    const ray = screenRay(pose, viewport, point, fov);
    return raySphere(ray.origin, ray.dir, radiusM) === null;
  });
}

/**
 * 달이 화면에 보이는가(ADR 5절). 셋 다 맞을 때만 그린다(아니면 visible = false, 비용 0).
 * 1. 가드: 카메라의 행성 중심 거리 < 달 거리 − 2 × 달 반지름. 그러면 달이 카메라와 행성 사이에 오지 않는다.
 * 2. 달 구가 화면 옆 네 평면 안에 걸친다(앞·뒤 자르기 면은 보지 않는다 — 배경으로 그린다).
 * 3. 행성 원판 뒤에 다 가리지 않는다(가려지면 행성이 덮어 그려 보이지 않으므로 그리지 않고 하늘 시계도 돌리지 않는다).
 *    planetRadiusM은 덮는 쪽 반지름이다(바탕 구가 해수면 아래면 그 반지름을 넘긴다).
 */
export function moonOnScreen(
  pose: GlobePose,
  viewport: Viewport,
  moonCenter: Vec3,
  moonRadiusM: number,
  planetRadiusM: number,
  fov = GLOBE_FOV_RAD,
): boolean {
  const cameraDistance = length(pose.position);
  if (cameraDistance >= length(moonCenter) - 2 * moonRadiusM) return false;
  const toMoon = sub(moonCenter, pose.position);
  const x = dot(toMoon, pose.right);
  const y = dot(toMoon, pose.up);
  const z = dot(toMoon, pose.back);
  if (z >= 0) return false;
  const tanV = Math.tan(fov / 2);
  const tanH = tanV * (viewport.height > 0 ? viewport.width / viewport.height : 1);
  // 옆 평면까지 부호 있는 거리(바깥 +). 달 반지름만큼 넘어도 걸친다
  if ((Math.abs(x) + z * tanH) / Math.sqrt(1 + tanH * tanH) > moonRadiusM) return false;
  if ((Math.abs(y) + z * tanV) / Math.sqrt(1 + tanV * tanV) > moonRadiusM) return false;
  const moonDistance = length(toMoon);
  const planetAngle = Math.asin(Math.min(1, planetRadiusM / cameraDistance));
  const moonAngle = Math.asin(Math.min(1, moonRadiusM / moonDistance));
  const separation = angleBetween(scale(toMoon, 1 / moonDistance), scale(pose.position, -1 / cameraDistance));
  return separation + moonAngle > planetAngle;
}

/**
 * 시선이 닿는 땅의 방향. 행성을 비키면 그 시선 쪽 가장자리(시선이 행성에 스치는 점)의 방향이다:
 * 카메라 위치 P와 시선이 만드는 평면에서 L·P = R², |L| = R인 점.
 */
function visibleGroundDirection(origin: Vec3, dir: Vec3, radiusM: number): Vec3 {
  const hit = raySphere(origin, dir, radiusM);
  if (hit !== null) return normalize(addScaled(origin, dir, hit));
  const distance = length(origin);
  const outward = scale(origin, 1 / distance);
  const side = normalize(sub(dir, scale(outward, dot(dir, outward))));
  const cosLimb = Math.min(1, radiusM / distance);
  return add(scale(outward, cosLimb), scale(side, Math.sqrt(1 - cosLimb * cosLimb)));
}

/** 화면 표본 수(가로·세로): 모서리·변 가운데·화면 가운데를 포함한다 */
const RANGE_SAMPLES = 5;

/**
 * 화면에 보이는 땅의 항성 고도 sin(위쪽 · 항성 방향) 범위. 표본 5 × 5로 어림한다(띠가 표본 사이 화면 가장자리에만
 * 걸치면 놓칠 수 있다. 그때는 낮 쪽 간격 4초로 돈다).
 */
export function sunCosRangeOnScreen(
  pose: GlobePose,
  viewport: Viewport,
  radiusM: number,
  sun: Vec3,
  fov = GLOBE_FOV_RAD,
): { readonly min: number; readonly max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let j = 0; j < RANGE_SAMPLES; j++) {
    for (let i = 0; i < RANGE_SAMPLES; i++) {
      const point = {
        x: (i / (RANGE_SAMPLES - 1)) * viewport.width,
        y: (j / (RANGE_SAMPLES - 1)) * viewport.height,
      };
      const ray = screenRay(pose, viewport, point, fov);
      const sunCos = dot(visibleGroundDirection(ray.origin, ray.dir, radiusM), sun);
      min = Math.min(min, sunCos);
      max = Math.max(max, sunCos);
    }
  }
  return { min, max };
}

/**
 * 쉬는 동안 하늘 시계(ADR 7절). 보이는 하늘이 바뀔 때만 돈다.
 * - 낮밤 띠가 화면에 있으면 bandStepMs ÷ 밤 세기. 1.7초는 지구본(F9 세로 휴대폰)에서 경계가 0.5 CSS px 움직이는 시간이다.
 *   한 화소의 밝기는 그 땅의 항성 고도로만 바뀌어(초당 0.1° 이하) 거리와 상관이 없다. 그래서 가까이서도 같은 밝기 걸음을
 *   밤 세기로 나눠 쓴다(가장 가까이 0.6 → 약 2.8초). 한 걸음의 밝기 변화는 낮의 약 0.5%(띠 가운데)~1.3%(항성이 지평선에
 *   걸린 곳)다(Assumed: 시제품 3판 식으로 계산, 휴대폰 미확인).
 * - 띠 없이 낮 쪽만 보이면 가장 느린 4초: 낮 쪽 밝기도 항성 높이를 따라 아주 천천히 바뀐다(한 걸음 0.3% 이하, 띠 바로
 *   위가 가장 빠르다. Assumed: 같은 식으로 계산). 오래 쉰 뒤 첫 손가락 동작에서 밝기가 튀지 않게 하려는 것이다.
 *   밤 쪽만이면 바뀌는 것이 없어 멈춘다.
 * - 달이 보이면 한 걸음 0.5 CSS px(지구본에서 달은 초당 1.0~1.5px → 0.33~0.5초).
 */
export const SKY_CLOCK = {
  minMs: 250,
  maxMs: 4000,
  bandStepMs: 1700,
  daySideStepMs: 4000,
  moonStepPx: 0.5,
} as const;

export interface SkyClockInput {
  /** 지금 낮밤 세기(nightStrength). 0이면 낮밤이 바뀌지 않는다 */
  readonly nightStrength: number;
  /** 화면에 보이는 땅의 항성 고도 sin 범위(sunCosRangeOnScreen) */
  readonly sunCos: { readonly min: number; readonly max: number };
  /** 그리는 달의 화면 빠르기(CSS px/s). 달을 그리지 않으면 null */
  readonly moonPxPerSecond: number | null;
}

/** 다음 하늘 프레임까지(ms, 0.25~4초). null이면 시계를 멈춘다(보이는 변화가 없다) */
export function skyClockIntervalMs(input: SkyClockInput): number | null {
  const candidates: number[] = [];
  if (input.nightStrength > 0) {
    const { min, max } = input.sunCos;
    if (max >= DAY_NIGHT_BAND.low && min <= DAY_NIGHT_BAND.high) {
      candidates.push(SKY_CLOCK.bandStepMs / input.nightStrength);
    } else if (min > DAY_NIGHT_BAND.high) {
      candidates.push(SKY_CLOCK.daySideStepMs);
    }
  }
  if (input.moonPxPerSecond !== null && input.moonPxPerSecond > 0) {
    candidates.push((SKY_CLOCK.moonStepPx / input.moonPxPerSecond) * 1000);
  }
  if (candidates.length === 0) return null;
  return Math.min(SKY_CLOCK.maxMs, Math.max(SKY_CLOCK.minMs, Math.min(...candidates)));
}
