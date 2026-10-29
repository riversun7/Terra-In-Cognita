// 1차맵 하늘 계산 시험 — 기대값은 기획 규칙(D-091 지역 시각 = 경도, D-142 남반구 반대)과 천문 식(고도 공식, 정오 고도)에서
// 따로 낸 값이다. 시각은 공용 달력의 [임시] 기원(2026-10-01T00:00Z)을 기준으로 적는다.
import { createRng } from "@terra/shared";
import {
  PLANET_CALENDAR_EPOCH_MS,
  PLANET_DAY_MS,
  PLANET_YEAR_MS,
  planetCalendarAt,
  southernSeason,
} from "@terra/shared/planetCalendar";
import { averageCellEdgeMeters, planetRadiusMeters } from "@terra/planet/projection";
import { describe, expect, it } from "vitest";
import {
  type GlobePose,
  type Viewport,
  directionOfLatLon,
  globeLimits,
  globePose,
  initialGlobe,
} from "./globeCamera.ts";
import {
  CLIMATE_NIGHT_FACTOR,
  DAY_NIGHT_BAND,
  PLACEHOLDER_PLANET_SKY,
  type PlanetMoonDescription,
  type PlanetSkyDescription,
  SKY_CLOCK,
  cloudFade,
  localSolarHours,
  moonAt,
  moonOnScreen,
  moonPhaseMs,
  nightStrength,
  skyAt,
  skyClockIntervalMs,
  skyOnScreen,
  sunAt,
  sunCosRangeOnScreen,
} from "./sky.ts";
import { EARTH_RADIUS_M } from "./testSupport.ts";
import { type Vec3, angleBetween, dot, length, scale } from "./vec3.ts";

const E = PLANET_CALENDAR_EPOCH_MS;
const HOUR = PLANET_DAY_MS;
const DEG = Math.PI / 180;
const TILT = 23.44;
const sky = PLACEHOLDER_PLANET_SKY;

const sunOf = (utcMs: number) => sunAt(planetCalendarAt(utcMs), sky);
/** 위도·경도(°)에서 항성 고도(°) */
const elevationDeg = (sun: Vec3, latDeg: number, lonDeg: number): number =>
  Math.asin(dot(directionOfLatLon(latDeg, lonDeg), sun)) / DEG;
/** 경도 차(°, −180~180) */
const lonDiff = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;

/** [임시] 달: 삭망월 7일(실제 7시간), 삭 = 기원(계절 첫날), 기울기 5°, 승교점 0°, 12R·0.27R */
const MOON: PlanetMoonDescription = {
  synodicMs: 7 * HOUR,
  newMoonOffsetMs: 0,
  inclinationDeg: 5,
  ascendingNodeDeg: 0,
  distanceRadii: 12,
  radiusRadii: 0.27,
  lookSeed: 20_261_029,
};

const moonOf = (utcMs: number, moon = MOON) => moonAt(planetCalendarAt(utcMs), sky, moon);
/** 행성 중심에서 본 달과 항성 사이 각(이각, °) */
const elongationDeg = (utcMs: number): number =>
  angleBetween(moonOf(utcMs).direction, sunOf(utcMs).direction) / DEG;
/** 방향의 경도(°) */
const lonOf = (d: Vec3): number => Math.atan2(d[1], d[0]) / DEG;

describe("[임시] 행성 하늘 값", () => {
  it("자전축 23.44°, 계절 가운데가 춘분·하지·추분·동지(φ0 = 1/8), 달 하나", () => {
    expect(sky.axialTiltDeg).toBe(TILT);
    expect(sky.equinoxYearFraction).toBe(1 / 8);
    expect(sky.moons).toEqual([MOON]);
  });
});

describe("항성 방향 — 알려진 시각(D-091: 지역 시각은 경도로, 하루 = 실제 1시간)", () => {
  it("기원(경도 0의 자정)에는 항성이 경도 180° 위에 있다. 적위는 봄 첫날 값 −16.34°", () => {
    const sun = sunOf(E);
    expect(Math.abs(sun.subsolarLonDeg)).toBeCloseTo(180, 9);
    expect(sun.subsolarLatDeg).toBeCloseTo(-16.3366, 4);
  });

  it("30분 뒤(경도 0의 정오) 경도 0°, 15분 뒤(경도 0의 6시) 동경 90°, 45분 뒤 서경 90°", () => {
    expect(sunOf(E + HOUR / 2).subsolarLonDeg).toBeCloseTo(0, 9);
    expect(sunOf(E + HOUR / 4).subsolarLonDeg).toBeCloseTo(90, 9);
    expect(sunOf(E + (3 * HOUR) / 4).subsolarLonDeg).toBeCloseTo(-90, 9);
  });

  it("항성은 1초에 경도 0.1°씩 서쪽으로 간다(실제 1시간에 한 바퀴)", () => {
    const a = sunOf(E + 1_234_000);
    const b = sunOf(E + 1_235_000);
    expect(lonDiff(a.subsolarLonDeg, b.subsolarLonDeg)).toBeCloseTo(0.1, 6);
  });

  it("항성 바로 아래 경도는 늘 지역 정오(12시)다 — 기원 앞 시각 포함", () => {
    for (const t of [E + 123_456, E + 7 * HOUR + 999_999, E - 5_555_555, E + 97 * HOUR + 1]) {
      const calendar = planetCalendarAt(t);
      expect(localSolarHours(calendar, sunAt(calendar, sky).subsolarLonDeg)).toBeCloseTo(12, 9);
    }
  });

  it("계절 가운데 날(3.5일째)의 적위: 봄 0, 여름 +23.44°, 가을 0, 겨울 −23.44°", () => {
    const expected = [0, TILT, 0, -TILT];
    for (let season = 0; season < 4; season++) {
      const sun = sunOf(E + (season * 7 + 3.5) * HOUR);
      expect(sun.subsolarLatDeg).toBeCloseTo(expected[season] ?? 0, 9);
    }
  });

  it("고도 sin = 위쪽 · 항성 방향 = sin φ sin δ + cos φ cos δ cos(λ − λs) (무작위 2,000곳·시각)", () => {
    const rng = createRng(42);
    for (let k = 0; k < 2000; k++) {
      const t = E - 10 * PLANET_YEAR_MS + rng.nextInt(50 * 28) * HOUR + rng.nextInt(HOUR);
      const lat = (rng.nextInt(18_001) / 100 - 90) * DEG;
      const lon = (rng.nextInt(36_001) / 100 - 180) * DEG;
      const sun = sunOf(t);
      const d = sun.subsolarLatDeg * DEG;
      const ls = sun.subsolarLonDeg * DEG;
      const formula = Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(lon - ls);
      expect(dot(directionOfLatLon(lat / DEG, lon / DEG), sun.direction)).toBeCloseTo(formula, 12);
    }
  });
});

describe("이어짐", () => {
  it("하루·한 해 경계와 기원에서 1ms 사이 항성 방향이 튀지 않는다(0.1°/s라 1ms에 1e-4° 안)", () => {
    const boundaries = [E, E + HOUR, E + 7 * HOUR, E + 28 * HOUR, E - 28 * HOUR, E + 1000 * 28 * HOUR];
    for (const t of boundaries) {
      const step = angleBetween(sunOf(t - 1).direction, sunOf(t).direction) / DEG;
      expect(step).toBeLessThan(2e-4);
    }
  });

  it("1분마다 하루를 돌면 걸음이 늘 약 6°(경도)다 — 끊김·뒤로 감 없음", () => {
    const start = E + 3 * HOUR + 17_000;
    for (let minute = 1; minute <= 60; minute++) {
      const a = sunOf(start + (minute - 1) * 60_000);
      const b = sunOf(start + minute * 60_000);
      expect(lonDiff(a.subsolarLonDeg, b.subsolarLonDeg)).toBeCloseTo(6, 6);
    }
  });
});

describe("반구별 계절의 부호(D-142: 남반구는 계절이 반대)", () => {
  it("북반구 여름(계절 1)의 모든 날 항성은 북쪽(적위 > 0), 겨울(계절 3)은 남쪽(적위 < 0)", () => {
    for (let day = 0; day < 28; day++) {
      for (const hourFraction of [0, 0.5, 0.999]) {
        const t = E + (day + hourFraction) * HOUR;
        const calendar = planetCalendarAt(Math.floor(t));
        const lat = sunAt(calendar, sky).subsolarLatDeg;
        if (calendar.season === 1) expect(lat).toBeGreaterThan(0);
        if (calendar.season === 3) expect(lat).toBeLessThan(0);
      }
    }
  });

  it("북반구 하지 정오: 40°N 고도 73.44°, 40°S 26.56° — 그때 남반구 계절은 겨울", () => {
    const t = E + 10.5 * HOUR; // 한 해의 3/8(여름 가운데), 경도 0의 정오
    const calendar = planetCalendarAt(t);
    const sun = sunAt(calendar, sky).direction;
    expect(elevationDeg(sun, 40, 0)).toBeCloseTo(90 - (40 - TILT), 9);
    expect(elevationDeg(sun, -40, 0)).toBeCloseTo(90 - (40 + TILT), 9);
    expect(calendar.season).toBe(1);
    expect(southernSeason(calendar.season)).toBe(3);
  });

  it("북반구 동지 정오는 반대: 40°S가 더 높다", () => {
    const sun = sunOf(E + 24.5 * HOUR).direction; // 한 해의 7/8(겨울 가운데)
    expect(elevationDeg(sun, -40, 0)).toBeCloseTo(90 - (40 - TILT), 9);
    expect(elevationDeg(sun, 40, 0)).toBeCloseTo(90 - (40 + TILT), 9);
  });

  it("극야·백야: 하지에 80°N은 하루 내내 낮, 80°S는 하루 내내 밤", () => {
    let northMin = 90;
    let southMax = -90;
    for (let minute = 0; minute < 60; minute++) {
      const sun = sunOf(E + 10 * HOUR + minute * 60_000).direction;
      northMin = Math.min(northMin, elevationDeg(sun, 80, 30));
      southMax = Math.max(southMax, elevationDeg(sun, -80, 30));
    }
    expect(northMin).toBeGreaterThan(0);
    expect(southMax).toBeLessThan(0);
  });

  it("자전축 기울기가 0이면 계절이 없다(적위 늘 0)", () => {
    const flat: PlanetSkyDescription = { ...sky, axialTiltDeg: 0 };
    for (let day = 0; day < 28; day++) {
      expect(sunAt(planetCalendarAt(E + day * HOUR), flat).subsolarLatDeg).toBeCloseTo(0, 12);
    }
  });
});

describe("skyAt — 엔진이 부르는 입구(던지지 않는다)", () => {
  it("소수 시각(x.5ms 시계 차이)은 내린 시각과 같은 하늘이다", () => {
    const a = skyAt(E + 1_000_000.5);
    const b = skyAt(E + 1_000_000);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a?.utcMs).toBe(E + 1_000_000);
  });

  it("시각이 수가 아니면 null(낮으로 그린다)", () => {
    expect(skyAt(Number.NaN)).toBeNull();
    expect(skyAt(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("달 — 같은 달력, 위상은 정수 ms 나머지(ADR 5절)", () => {
  it("위상: 기원 = 첫 삭(0), 3.5시간 뒤 보름(삭망월의 절반), 7시간 뒤 다시 삭, 1ms 전은 삭망월 − 1ms", () => {
    expect(moonPhaseMs(planetCalendarAt(E), MOON)).toBe(0);
    expect(moonPhaseMs(planetCalendarAt(E + 3.5 * HOUR), MOON)).toBe(12_600_000);
    expect(moonPhaseMs(planetCalendarAt(E + 7 * HOUR), MOON)).toBe(0);
    expect(moonPhaseMs(planetCalendarAt(E - 1), MOON)).toBe(7 * HOUR - 1);
    expect(moonPhaseMs(planetCalendarAt(E + 5), { ...MOON, newMoonOffsetMs: 10 })).toBe(7 * HOUR - 5);
  });

  it("2300년에도 위상이 정확하다: 삭망월 1,000번 뒤 같은 위상", () => {
    const t = Date.UTC(2300, 0, 1) + 12_345;
    expect(moonPhaseMs(planetCalendarAt(t + 1000 * MOON.synodicMs), MOON)).toBe(
      moonPhaseMs(planetCalendarAt(t), MOON),
    );
    expect(moonOf(t + 1000 * MOON.synodicMs).phase).toBe(moonOf(t).phase);
  });

  it("삭에는 달이 항성 쪽(이각 ≤ 궤도 기울기), 보름에는 반대쪽(이각 ≥ 180° − 기울기)", () => {
    const rng = createRng(3);
    for (let n = 0; n < 200; n++) {
      const newMoon = E + (n + rng.nextInt(40) * 4) * MOON.synodicMs;
      expect(elongationDeg(newMoon)).toBeLessThanOrEqual(MOON.inclinationDeg + 1e-9);
      expect(elongationDeg(newMoon + MOON.synodicMs / 2)).toBeGreaterThanOrEqual(
        180 - MOON.inclinationDeg - 1e-9,
      );
    }
  });

  it("달은 항성에서 동쪽으로 멀어진다(순행): 상현(1/4)에 달 아래 경도 ≈ 항성 아래 경도 + 90°, 하현(3/4)에 − 90°", () => {
    for (let n = 0; n < 40; n++) {
      const newMoon = E + n * MOON.synodicMs;
      for (const [fraction, east] of [
        [0.25, 90],
        [0.75, -90],
      ] as const) {
        const t = newMoon + fraction * MOON.synodicMs;
        const gap = lonDiff(lonOf(moonOf(t).direction), sunOf(t).subsolarLonDeg);
        // 자전축 기울기 때문에 적도 위 경도 차는 황도 위 90°에서 몇 도 어긋난다
        expect(Math.abs(gap - east)).toBeLessThan(6);
      }
    }
  });

  it("밝은 부분 비율은 삭 0 → 보름 1로 늘어난다", () => {
    let previous = -1;
    for (let k = 0; k <= 50; k++) {
      const lit = moonOf(E + 3 * MOON.synodicMs + Math.round((k / 100) * MOON.synodicMs)).litFraction;
      expect(lit).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = lit;
    }
    expect(moonOf(E).litFraction).toBeLessThan(0.01);
    expect(moonOf(E + MOON.synodicMs / 2).litFraction).toBeGreaterThan(0.99);
  });

  it("궤도 기울기 0이면 삭의 달 방향 = 항성 방향: 달 궤도의 항성이 낮밤의 항성과 같은 좌표다", () => {
    const flat = { ...MOON, inclinationDeg: 0 };
    const rng = createRng(11);
    for (let k = 0; k < 300; k++) {
      const t = E + rng.nextInt(2000) * MOON.synodicMs;
      expect(angleBetween(moonOf(t, flat).direction, sunOf(t).direction)).toBeLessThan(1e-12);
    }
  });

  it("달의 적위는 자전축 기울기 + 궤도 기울기(28.44°)를 넘지 않는다", () => {
    let maxDecl = 0;
    for (let k = 0; k < 20_000; k++) {
      const d = moonOf(E + Math.round((k / 20_000) * PLANET_YEAR_MS)).direction;
      maxDecl = Math.max(maxDecl, Math.abs(Math.asin(d[2]) / DEG));
    }
    expect(maxDecl).toBeLessThanOrEqual(TILT + MOON.inclinationDeg + 1e-9);
    expect(maxDecl).toBeGreaterThan(TILT + MOON.inclinationDeg - 0.5);
  });

  it("궤도 극은 별에 고정이라 행성 좌표에서는 한 해(28일)에 29바퀴 돈다(행성 항성일 = 28/29일 ≈ 57.93분)", () => {
    const steps = 28 * 29 * 40;
    let turns = 0;
    let previous = moonOf(E).orbitPole;
    for (let k = 1; k <= steps; k++) {
      const pole = moonOf(E + Math.round((k / steps) * PLANET_YEAR_MS)).orbitPole;
      let d = Math.atan2(pole[1], pole[0]) - Math.atan2(previous[1], previous[0]);
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      turns += d / (2 * Math.PI);
      previous = pole;
    }
    expect(Math.abs(turns)).toBeCloseTo(29, 6);
  });

  it("달 방향은 궤도 극에 수직이고 둘 다 단위 벡터다", () => {
    for (let k = 0; k < 100; k++) {
      const m = moonOf(E + k * 1_234_567);
      expect(dot(m.direction, m.orbitPole)).toBeCloseTo(0, 12);
      expect(dot(m.direction, m.direction)).toBeCloseTo(1, 12);
      expect(dot(m.orbitPole, m.orbitPole)).toBeCloseTo(1, 12);
    }
  });

  it("skyAt은 행성 설명의 달을 차례대로 담는다", () => {
    const state = skyAt(E + 3.5 * HOUR);
    expect(state?.moons).toHaveLength(1);
    expect(state?.moons[0]?.phase).toBe(0.5);
    expect(skyAt(E, { ...sky, moons: [] })?.moons).toEqual([]);
  });
});

// ── 화면 쪽 계산(거리·보임·하늘 시계) ──
const R = EARTH_RADIUS_M;
const PORTRAIT: Viewport = { width: 412, height: 892 };
const LANDSCAPE: Viewport = { width: 892, height: 412 };
const limitsOf = (viewport: Viewport, faceLevel = 9) => {
  const radius = planetRadiusMeters(faceLevel);
  return globeLimits(radius, averageCellEdgeMeters(faceLevel, radius), viewport);
};
const portraitLimits = limitsOf(PORTRAIT);
/** 위도 20°·경도 30°(처음 보기)를 그 거리에서 보는 카메라 */
const poseAt = (viewport: Viewport, distance: number, latDeg = 20, lonDeg = 30): GlobePose => {
  const limits = limitsOf(viewport);
  return globePose(initialGlobe(latDeg, lonDeg, distance, limits), R, limits);
};

describe('낮밤 세기 — 사용자 결정 U1 (나) "가까이선 옅은 밤"', () => {
  const minD = portraitLimits.minDistance;
  const at = (distance: number, layer: "terrain" | "climate" = "terrain") =>
    nightStrength(distance, minD, R, layer);

  it("가장 가까이(F9 약 12km)에서 0.6, 거리 0.5R(F9 약 265km)부터 1", () => {
    expect(minD).toBeGreaterThan(11_000);
    expect(minD).toBeLessThan(13_000);
    expect(at(minD)).toBeCloseTo(0.6, 12);
    expect(at(0.5 * R)).toBeCloseTo(1, 12);
    expect(at(265_000)).toBeGreaterThan(0.999);
    expect(at(portraitLimits.maxDistance)).toBe(1);
  });

  it("사이는 로그 거리를 따라 부드럽게 늘어난다: 로그 가운데에서 0.8, 거리가 늘면 줄지 않는다", () => {
    expect(at(Math.sqrt(minD * 0.5 * R))).toBeCloseTo(0.8, 9);
    let previous = 0;
    for (let d = minD; d <= R; d *= 1.1) {
      const strength = at(d);
      expect(strength).toBeGreaterThanOrEqual(previous);
      previous = strength;
    }
  });

  it("기후 레이어(자료 색·범례)에서는 × 0.35", () => {
    expect(CLIMATE_NIGHT_FACTOR).toBe(0.35);
    expect(at(minD, "climate")).toBeCloseTo(0.6 * 0.35, 12);
    expect(at(2 * R, "climate")).toBeCloseTo(0.35, 12);
  });

  it("작은 행성(F4: 거리 0.5R가 가장 가까운 거리보다 가깝다)은 모든 거리에서 1", () => {
    const radius = planetRadiusMeters(4);
    const limits = limitsOf(PORTRAIT, 4);
    expect(0.5 * radius).toBeLessThan(limits.minDistance);
    expect(nightStrength(limits.minDistance, limits.minDistance, radius, "terrain")).toBe(1);
  });

  it("거리가 수가 아니거나 0 이하면 가장 가까운 거리의 값(던지지 않는다)", () => {
    expect(at(Number.NaN)).toBeCloseTo(0.6, 12);
    expect(at(0)).toBeCloseTo(0.6, 12);
  });
});

describe("구름 걷힘 — 가까이 갈수록 덮임 문턱을 올려 걷힌다(ADR 6절)", () => {
  it("2.5R 밖은 온전, 1.2R(F9 약 637km) 안쪽은 껍질을 그리지 않는다", () => {
    expect(cloudFade(2.5 * R, R)).toEqual({ u: 1, thresholdShift: 0, opacityScale: 1, visible: true });
    expect(cloudFade(3 * R, R).u).toBe(1);
    expect(cloudFade(1.2 * R, R)).toEqual({ u: 0, thresholdShift: 0.24, opacityScale: 0, visible: false });
    expect(cloudFade(636_000, R).visible).toBe(false);
    expect(cloudFade(12_000, R).visible).toBe(false);
  });

  it("가운데(1.85R)에서 u = 0.5: 문턱 +0.12, 불투명도 × √0.5", () => {
    const fade = cloudFade(1.85 * R, R);
    expect(fade.u).toBeCloseTo(0.5, 12);
    expect(fade.thresholdShift).toBeCloseTo(0.12, 12);
    expect(fade.opacityScale).toBeCloseTo(Math.SQRT1_2, 12);
    expect(fade.visible).toBe(true);
  });
});

describe("하늘이 화면에 있는가 — 네 모서리 시선 중 하나라도 행성을 비킨다", () => {
  it("세로 휴대폰(412×892): 가장 가까이·1.6R에는 하늘이 없고, 2R·가장 멀리는 있다", () => {
    expect(skyOnScreen(poseAt(PORTRAIT, portraitLimits.minDistance), PORTRAIT, R)).toBe(false);
    expect(skyOnScreen(poseAt(PORTRAIT, 1.6 * R), PORTRAIT, R)).toBe(false);
    expect(skyOnScreen(poseAt(PORTRAIT, 2 * R), PORTRAIT, R)).toBe(true);
    expect(skyOnScreen(poseAt(PORTRAIT, portraitLimits.maxDistance), PORTRAIT, R)).toBe(true);
  });

  it("가로 휴대폰(892×412)은 0.47R(약 250km)부터 하늘이 보인다(거리 문턱을 쓰지 않는 이유)", () => {
    expect(skyOnScreen(poseAt(LANDSCAPE, 0.3 * R), LANDSCAPE, R)).toBe(false);
    expect(skyOnScreen(poseAt(LANDSCAPE, 0.47 * R), LANDSCAPE, R)).toBe(true);
  });
});

describe("달이 화면에 보이는가 — 가드·화면 옆 네 평면·행성 원판 뒤(ADR 5절)", () => {
  // 행성 중심에서 6R 위(+z)에서 바로 아래를 보는 카메라(화면 위쪽 = +y)
  const pose: GlobePose = {
    position: [0, 0, 6 * R],
    right: [1, 0, 0],
    up: [0, 1, 0],
    back: [0, 0, 1],
    tilt: 0,
    targetPoint: [0, 0, R],
  };
  const r = 0.27 * R;
  const visible = (center: Vec3, viewport = PORTRAIT, cameraPose = pose) =>
    moonOnScreen(cameraPose, viewport, center, r, R);

  it("행성 가장자리 바깥 하늘(위로 10.6°, 행성 반각 9.6°)에 있으면 보인다", () => {
    expect(visible([0, 3 * R, -10 * R])).toBe(true);
  });

  it("행성 가장자리에 반쯤 걸쳐도(달 가운데가 가장자리 위, 9.6°) 그린다 — 행성이 그 위에 덮어 그린다", () => {
    const edge = Math.tan(Math.asin(1 / 6)) * 16 * R;
    expect(visible([0, edge, -10 * R])).toBe(true);
  });

  it("행성 원판 뒤에 다 들어가면(위로 3.6°) 그리지 않는다", () => {
    expect(visible([0, R, -10 * R])).toBe(false);
  });

  it("화면 옆으로 17°: 세로 화면(옆 반각 9.5°) 밖, 가로 화면(옆 반각 38°) 안", () => {
    expect(visible([5 * R, 0, -10 * R], PORTRAIT)).toBe(false);
    expect(visible([5 * R, 0, -10 * R], LANDSCAPE)).toBe(true);
  });

  it("카메라 뒤는 그리지 않는다", () => {
    expect(visible([0, 0, 20 * R])).toBe(false);
  });

  it("가드: 카메라의 행성 중심 거리가 달 거리 − 2 × 달 반지름 이상이면 그리지 않는다(달이 카메라와 행성 사이에 올 수 있다)", () => {
    const far: GlobePose = { ...pose, position: [0, 0, 11 * R] };
    expect(visible([0, 3 * R, -10 * R], PORTRAIT, far)).toBe(false);
  });

  it("[임시] 12R·0.27R 달은 세로·가로 휴대폰의 가장 먼 거리(행성 중심 6.94R·3.36R)에서도 가드를 지킨다", () => {
    for (const viewport of [PORTRAIT, LANDSCAPE, { width: 360, height: 700 }]) {
      const centre = (limitsOf(viewport).maxDistance + R) / R;
      expect(centre).toBeLessThan(MOON.distanceRadii - 2 * MOON.radiusRadii);
    }
    expect((portraitLimits.maxDistance + R) / R).toBeCloseTo(6.94, 2);
    expect((limitsOf(LANDSCAPE).maxDistance + R) / R).toBeCloseTo(3.36, 2);
  });
});

describe("화면에 보이는 땅의 항성 고도 sin 범위(하늘 시계가 낮밤 띠를 찾는다)", () => {
  // 처음 보기(위도 20°·경도 30°)를 행성 중심 3R(가장자리 cos = 1/3)에서 본다
  const pose = poseAt(PORTRAIT, 2 * R);
  const target = directionOfLatLon(20, 30);

  it("항성이 화면 가운데 위: 가운데 ≈ 1, 모서리 시선은 행성을 비켜 가장자리(cos = R ÷ 3R)를 본다 → 낮 쪽만 보인다", () => {
    expect(length(pose.position) / R).toBeCloseTo(3, 9);
    const range = sunCosRangeOnScreen(pose, PORTRAIT, R, target);
    expect(range.max).toBeCloseTo(1, 6);
    expect(range.min).toBeCloseTo(1 / 3, 6);
    expect(range.min).toBeGreaterThan(DAY_NIGHT_BAND.high);
  });

  it("항성이 뒤: 밤 쪽만 보인다", () => {
    const range = sunCosRangeOnScreen(pose, PORTRAIT, R, scale(target, -1));
    expect(range.max).toBeLessThan(DAY_NIGHT_BAND.low);
  });

  it("항성이 옆: 범위가 띠를 지난다", () => {
    const side: Vec3 = directionOfLatLon(20, 120);
    const range = sunCosRangeOnScreen(pose, PORTRAIT, R, scale(side, 1 / length(side)));
    expect(range.min).toBeLessThan(DAY_NIGHT_BAND.low);
    expect(range.max).toBeGreaterThan(DAY_NIGHT_BAND.high);
  });

  it("가장 가까이(12km)에서는 범위가 좁고 화면 가운데 땅의 값을 담는다", () => {
    const close = poseAt(PORTRAIT, portraitLimits.minDistance);
    const sun = directionOfLatLon(-10, 100);
    const range = sunCosRangeOnScreen(close, PORTRAIT, R, sun);
    expect(range.max - range.min).toBeLessThan(0.1);
    expect(range.min).toBeLessThanOrEqual(dot(target, sun) + 1e-6);
    expect(range.max).toBeGreaterThanOrEqual(dot(target, sun) - 1e-6);
  });
});

const interval = (
  nightStrengthValue: number,
  sunCos: { min: number; max: number },
  moonPxPerSecond: number | null = null,
) => skyClockIntervalMs({ nightStrength: nightStrengthValue, sunCos, moonPxPerSecond });

describe("쉬는 동안 하늘 시계 간격(ADR 7절)", () => {
  const band = { min: -0.5, max: 0.5 };
  const daySide = { min: 0.2, max: 1 };
  const nightSide = { min: -1, max: -0.3 };

  it("낮밤 띠가 화면에 있으면 1.7초 ÷ 밤 세기: 밤 세기 1(지구본·0.5R 밖) 1.7초, 가장 가까이(0.6) 약 2.8초", () => {
    expect(SKY_CLOCK.bandStepMs).toBe(1700);
    expect(interval(1, band)).toBe(1700);
    expect(interval(0.6, band)).toBeCloseTo(1700 / 0.6, 9);
  });

  it("낮 쪽만 보이면 가장 느린 4초(항성 높이에 따른 아주 느린 밝기 변화), 밤 쪽만이면 멈춘다", () => {
    expect(interval(1, daySide)).toBe(4000);
    expect(interval(0.6, daySide)).toBe(4000);
    expect(interval(1, nightSide)).toBeNull();
  });

  it("밤 세기 0이고 달이 없으면 멈춘다", () => {
    expect(interval(0, band)).toBeNull();
    expect(interval(0, daySide)).toBeNull();
  });

  it("달이 보이면 한 걸음 0.5 CSS px: 초당 1.0px → 0.5초, 1.5px → 약 0.33초, 띠보다 빠르면 달을 따른다", () => {
    expect(interval(0, nightSide, 1)).toBe(500);
    expect(interval(1, band, 1.5)).toBeCloseTo(1000 / 3, 9);
    expect(interval(1, nightSide, 0)).toBeNull();
  });

  it("0.25~4초로 묶는다", () => {
    expect(interval(0, nightSide, 5)).toBe(250);
    expect(interval(CLIMATE_NIGHT_FACTOR, band)).toBe(4000);
  });
});
