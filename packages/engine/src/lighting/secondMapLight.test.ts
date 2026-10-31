import { cellKey } from "@terra/planet";
import { PLANET_DAY_MS, PLANET_DAYS_PER_YEAR, planetCalendarAt } from "@terra/shared/planetCalendar";
import { describe, expect, it } from "vitest";
import { localSolarHours, skyAt } from "../planet/sky.ts";
import type { Rgb } from "../planet/skyShade.ts";
import { cross, dot, length } from "../planet/vec3.ts";
import {
  FIXED_SECOND_MAP_LIGHT,
  PREVIEW_DAY_INDEX,
  REFERENCE_FLAT_LIGHT,
  SECOND_MAP_LIGHT,
  SECOND_MAP_NIGHT_FLOOR,
  type SecondMapLight,
  type SecondMapPlace,
  UNIT_NIGHT_LIFT,
  blendLight,
  flatLight,
  lightChanged,
  nightAmount,
  secondMapLightAt,
  secondMapPlace,
  utcMsForLocalHour,
} from "./secondMapLight.ts";

/** S1 시험 2차맵 = 지구(면 레벨 9) 면 0의 (256, 256) 칸(packages/protocol S1_TEST_MAP_KEY) */
const S1_KEY = cellKey(0, 9, 256, 256);

const placeOf = (key: number): SecondMapPlace => {
  const place = secondMapPlace(key);
  if (!place) throw new Error(`no place: ${key}`);
  return place;
};

/** 위도·경도(°)에 가장 가까운 레벨 9 칸 — 면 0의 가운데 줄만 쓰면 위도가 한정되므로 여러 면에서 고른다 */
function keyNear(face: 0 | 1 | 2 | 3 | 4 | 5, i: number, j: number): number {
  return cellKey(face, 9, i, j);
}

/** 그 자리의 지역 시각 hour, 달력 day일째 빛 */
function lightAt(place: SecondMapPlace, hour: number, day = PREVIEW_DAY_INDEX, moon = true): SecondMapLight {
  return secondMapLightAt(
    skyAt(utcMsForLocalHour(place.lonDeg, hour, day)),
    place,
    moon ? {} : { moon: false },
  );
}

/** 위를 보는 흰 면 밝기 ÷ 낮 기준(채널마다) */
const relativeFlat = (light: SecondMapLight): Rgb => {
  const [r, g, b] = flatLight(light);
  return [r / REFERENCE_FLAT_LIGHT, g / REFERENCE_FLAT_LIGHT, b / REFERENCE_FLAT_LIGHT];
};

/** sRGB → 선형, WCAG 상대 휘도·대비 */
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** 세 채널 평균 */
const average = (rgb: Rgb): number => (rgb[0] + rgb[1] + rgb[2]) / 3;
const hex = (value: number): Rgb => [
  ((value >> 16) & 255) / 255,
  ((value >> 8) & 255) / 255,
  (value & 255) / 255,
];
const times = (a: Rgb, b: Rgb, add = 0): Rgb => [
  Math.min(1, a[0] * (b[0] + add)),
  Math.min(1, a[1] * (b[1] + add)),
  Math.min(1, a[2] * (b[2] + add)),
];

describe("2차맵 자리", () => {
  it("S1 시험 2차맵은 적도·경도 0 근처이고, 세계 축이 x 동·y 위·z 남이다(ADR 33)", () => {
    const place = placeOf(S1_KEY);
    expect(place.latDeg).toBeCloseTo(0.088, 2);
    expect(place.lonDeg).toBeCloseTo(0.088, 2);
    expect(place.xAxis[1]).toBeGreaterThan(0.9999); // 동 = 행성 +y
    expect(place.zAxis[2]).toBeLessThan(-0.9999); // 남 = 행성 −z
    expect(place.up[0]).toBeGreaterThan(0.9999);
  });

  it("모든 면(극 포함)에서 축이 정규 직교이고 오른손 좌표다(x × 위 = z)", () => {
    for (const face of [0, 1, 2, 3, 4, 5] as const) {
      for (const [i, j] of [
        [0, 0],
        [511, 0],
        [256, 256],
        [17, 400],
        [511, 511],
      ] as const) {
        const place = placeOf(keyNear(face, i, j));
        for (const axis of [place.xAxis, place.up, place.zAxis]) expect(length(axis)).toBeCloseTo(1, 12);
        expect(dot(place.xAxis, place.up)).toBeCloseTo(0, 12);
        expect(dot(place.zAxis, place.up)).toBeCloseTo(0, 12);
        const z = cross(place.xAxis, place.up);
        expect(dot(z, place.zAxis)).toBeCloseTo(1, 12);
      }
    }
  });

  it("면 격자 축이라 면 3 가운데에서는 x가 남쪽이다(북쪽이 돌아간다)", () => {
    const place = placeOf(keyNear(3, 256, 256));
    expect(Math.abs(place.lonDeg)).toBeGreaterThan(179.8);
    expect(place.xAxis[2]).toBeLessThan(-0.9999); // 면 3의 uAxis = −z = 남
  });

  it("셀 키가 아니면 null", () => {
    expect(secondMapPlace(-1)).toBeNull();
    expect(secondMapPlace(1.5)).toBeNull();
    expect(secondMapPlace(Number.MAX_SAFE_INTEGER)).toBeNull();
  });
});

describe("시험 시각(?second-map-time=)", () => {
  it("그 2차맵의 지역 시각이 된다(달력 3일째)", () => {
    for (const lonDeg of [-179.9, -45.5, 0, 0.088, 90, 179.9]) {
      for (const hour of [0, 5.25, 12, 18.15, 23.99, 24]) {
        const utc = utcMsForLocalHour(lonDeg, hour);
        const calendar = planetCalendarAt(utc);
        expect(calendar.dayIndex === PREVIEW_DAY_INDEX).toBe(true);
        const local = localSolarHours(calendar, lonDeg);
        // 둘레 차이(−12 이상 12 미만)
        const delta = ((((local - hour) % 24) + 36) % 24) - 12;
        expect(Math.abs(delta)).toBeLessThan(1e-5);
      }
    }
  });
});

describe("2차맵 빛", () => {
  const s1 = placeOf(S1_KEY);

  it("하늘이 없거나 낮밤을 끄면 지금 고정 빛 그대로다(반구 1.7 흰·갈색, 방향 2.1, 방향 (0.55, 1, 0.4), 하늘 #d6eef7)", () => {
    expect(secondMapLightAt(null, s1)).toBe(FIXED_SECOND_MAP_LIGHT);
    expect(secondMapLightAt(skyAt(utcMsForLocalHour(0, 0)), s1, { dayNight: false })).toBe(
      FIXED_SECOND_MAP_LIGHT,
    );
    const fixed = FIXED_SECOND_MAP_LIGHT;
    expect(fixed.hemisphereIntensity).toBe(1.7);
    expect(fixed.hemisphereSky).toEqual([1, 1, 1]);
    expect(fixed.hemisphereGround).toEqual(hex(0xb59f86));
    expect(fixed.directIntensity).toBe(2.1);
    expect(fixed.directColor).toEqual([1, 1, 1]);
    const norm = Math.hypot(0.55, 1, 0.4);
    expect(fixed.direction[0]).toBeCloseTo(0.55 / norm, 12);
    expect(fixed.direction[1]).toBeCloseTo(1 / norm, 12);
    expect(fixed.direction[2]).toBeCloseTo(0.4 / norm, 12);
    expect(fixed.background).toEqual(hex(0xd6eef7));
    expect(nightAmount(fixed)).toBe(0);
  });

  it("한낮은 낮 기준 밝기, 아침 해는 동쪽(+x)·저녁 해는 서쪽(−x)에서 온다", () => {
    const noon = lightAt(s1, 12);
    expect(noon.day).toBe(1);
    expect(noon.source).toBe("sun");
    for (const value of relativeFlat(noon)) {
      expect(value).toBeGreaterThan(0.95);
      expect(value).toBeLessThan(1.1);
    }
    expect(lightAt(s1, 8).direction[0]).toBeGreaterThan(0.5);
    expect(lightAt(s1, 16).direction[0]).toBeLessThan(-0.5);
    expect(noon.localHours).toBeCloseTo(12, 4);
  });

  it("해가 머리 위여도 옆면(수평 법선, 어느 쪽이든)이 지금 고정 빛의 그늘 쪽 옆면보다 어둡지 않다(땅에서 튀는 빛)", () => {
    // 지금 고정 빛에서 빛 반대쪽을 보는 옆면(직사광 0)
    const fixedDirection = FIXED_SECOND_MAP_LIGHT.direction;
    const away = Math.hypot(fixedDirection[0], fixedDirection[2]);
    const shade = average(
      flatLight(FIXED_SECOND_MAP_LIGHT, [-fixedDirection[0] / away, 0, -fixedDirection[2] / away]),
    );
    const noon = lightAt(s1, 12);
    expect(noon.sunElevationDeg ?? 0).toBeGreaterThan(85);
    for (let angle = 0; angle < 360; angle += 15) {
      const a = (angle * Math.PI) / 180;
      expect(average(flatLight(noon, [Math.cos(a), 0, Math.sin(a)]))).toBeGreaterThanOrEqual(shade);
    }
  });

  it("해가 낮아도(고도 5~20°) 평지가 낮 기준의 75% 이상(채널 평균, 노을 색이라 파랑은 65% 이상)이고, 직사광이 노을 색이다", () => {
    let checked = 0;
    for (let hour = 5; hour <= 19; hour += 0.02) {
      const light = lightAt(s1, hour);
      const elevation = light.sunElevationDeg ?? 0;
      if (elevation < 5 || elevation > 20) continue;
      checked += 1;
      const values = relativeFlat(light);
      expect((values[0] + values[1] + values[2]) / 3).toBeGreaterThan(0.75);
      expect(Math.min(...values)).toBeGreaterThan(0.65);
      expect(light.directColor[0]).toBeGreaterThan(light.directColor[2]);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("한밤은 라벤더(파랑 > 빨강)이고 낮 기준의 0.8배 아래로 어둡다 — 밤이 보인다", () => {
    const night = lightAt(s1, 23, PREVIEW_DAY_INDEX, false);
    expect(night.day).toBe(0);
    expect(night.source).toBe("none");
    const [r, g, b] = relativeFlat(night);
    expect(b).toBeGreaterThan(r);
    expect(Math.max(r, g)).toBeLessThan(0.65);
    expect(b).toBeLessThan(0.8);
    expect(nightAmount(night)).toBe(1);
  });

  it("밤 바닥: 어느 시각·위도·계절에도 평지 흰 면이 채널마다 낮 기준의 SECOND_MAP_NIGHT_FLOOR배 이상이고 1.15배를 넘지 않는다", () => {
    const keys = [
      keyNear(0, 256, 256),
      keyNear(0, 256, 480),
      keyNear(1, 100, 30),
      keyNear(2, 256, 256), // 북극
      keyNear(2, 40, 300),
      keyNear(4, 300, 470),
      keyNear(5, 256, 256), // 남극
    ];
    let lowest = Number.POSITIVE_INFINITY;
    let highest = 0;
    for (const key of keys) {
      const place = placeOf(key);
      for (let day = 0; day < PLANET_DAYS_PER_YEAR; day += 3) {
        for (let hour = 0; hour < 24; hour += 0.1) {
          for (const moon of [true, false]) {
            const values = relativeFlat(lightAt(place, hour, day, moon));
            lowest = Math.min(lowest, ...values);
            highest = Math.max(highest, ...values);
          }
        }
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(SECOND_MAP_NIGHT_FLOOR);
    expect(highest).toBeLessThanOrEqual(1.15);
  });

  it("박명은 따뜻한 색(반구 하늘 빨강 > 파랑)이고 낮 정도가 0과 1 사이다", () => {
    const light = lightAt(s1, 18.15);
    expect(light.day).toBeGreaterThan(0.1);
    expect(light.day).toBeLessThan(0.9);
    expect(light.hemisphereSky[0]).toBeGreaterThan(light.hemisphereSky[2]);
  });

  it("방향광이 항성에서 달로 바뀔 때 두 세기가 모두 0 근처다(방향이 튀지 않는다), 세기는 1초마다 조금씩만 바뀐다", () => {
    let switches = 0;
    let previous = lightAt(s1, 17.5);
    for (let second = 1; second <= 3600; second++) {
      const light = lightAt(s1, 17.5 + (second * 24) / 3600 / 24);
      expect(Math.abs(light.directIntensity - previous.directIntensity)).toBeLessThan(0.02);
      if (light.source !== previous.source && previous.source !== "none" && light.source !== "none") {
        switches += 1;
      }
      if (light.source !== previous.source) {
        expect(Math.max(light.directIntensity, previous.directIntensity)).toBeLessThan(0.02);
      }
      previous = light;
    }
    // 해 → 없음 → 달: 바로 바뀌는 일은 없다
    expect(switches).toBe(0);
  });

  it("달이 머리 위에 있어도 항성이 지는 동안 방향광은 세기 0에서만 항성 → 달로 바뀐다(가짜 하늘로 고도를 훑는다)", () => {
    const base = skyAt(utcMsForLocalHour(s1.lonDeg, 12));
    if (!base) throw new Error("no sky");
    const moonState = base.moons[0];
    if (!moonState) throw new Error("no moon");
    let previous: SecondMapLight | null = null;
    let sawMoon = false;
    for (let step = 0; step <= 3000; step++) {
      const elevation = (15 - step * 0.01) * (Math.PI / 180);
      // 행성 좌표: 동쪽(+y)에서 elevation만큼 위(+x = 위)로
      const sun: readonly [number, number, number] = [Math.sin(elevation), Math.cos(elevation), 0];
      const sky = {
        ...base,
        sun: { ...base.sun, direction: sun },
        moons: [{ ...moonState, direction: [1, 0, 0] as const, litFraction: 1 }],
      };
      const light = secondMapLightAt(sky, s1);
      if (light.source === "moon") sawMoon = true;
      if (previous && previous.source !== light.source) {
        expect(Math.max(previous.directIntensity, light.directIntensity)).toBeLessThan(0.01);
      }
      previous = light;
    }
    expect(sawMoon).toBe(true);
  });

  it("밤에 뜬 달은 푸른 방향광이고 밝은 비율에 따라 세다. 달을 끄면 방향광이 없다", () => {
    const moonNight = lightAt(s1, 23);
    expect(moonNight.source).toBe("moon");
    expect(moonNight.moonElevationDeg ?? 0).toBeGreaterThan(30);
    expect(moonNight.moonLit ?? 0).toBeGreaterThan(0.9);
    expect(moonNight.directColor[2]).toBeGreaterThan(moonNight.directColor[0]);
    expect(moonNight.directIntensity).toBeLessThanOrEqual(SECOND_MAP_LIGHT.moonIntensity);
    expect(moonNight.directIntensity).toBeGreaterThan(0.2);
    // 삭(기원 0일째)의 한밤: 달이 항성 쪽이라 지평선 아래 → 방향광 없음
    expect(lightAt(s1, 0, 0).source).toBe("none");
    expect(lightAt(s1, 23, PREVIEW_DAY_INDEX, false).directIntensity).toBe(0);
  });

  it("하늘 색은 지금 하늘 색에서 시작해 밤에 어두운 라벤더가 된다(검정이 아니다)", () => {
    const noon = lightAt(s1, 12).background;
    const fixed = FIXED_SECOND_MAP_LIGHT.background;
    for (let i = 0; i < 3; i++) expect(noon[i]).toBeCloseTo(fixed[i] ?? 0, 2);
    const night = lightAt(s1, 1, PREVIEW_DAY_INDEX, false).background;
    expect(night[2]).toBeGreaterThan(night[0]);
    expect(Math.min(...night)).toBeGreaterThan(0.35);
  });

  it("밤에는 유닛(밤 빛 포함)이 낮보다 땅에서 더 잘 보인다: 쌍마다 밤 대비 ≥ 낮 대비, 가장 낮은 밤 대비 ≥ 1.5", () => {
    const units = [0xff9aa2, 0x8fc8ff, 0xb7a6ff, 0x8fe0bd, 0xffcf75].map(hex);
    // terrainTextures.ts SURFACE_RGB(물·풀·흙·바위)
    const surfaces: Rgb[] = [
      [0.56, 0.74, 0.72],
      [0.56, 0.8, 0.45],
      [0.79, 0.67, 0.49],
      [0.63, 0.63, 0.67],
    ];
    const day = relativeFlat(lightAt(s1, 12));
    const night = relativeFlat(lightAt(s1, 23));
    const lift = UNIT_NIGHT_LIFT;
    let worst = Number.POSITIVE_INFINITY;
    let lowestNight = Number.POSITIVE_INFINITY;
    for (const unit of units) {
      for (const surface of surfaces) {
        const dayContrast = contrast(times(unit, day), times(surface, day));
        const nightContrast = contrast(times(unit, night, lift), times(surface, night));
        worst = Math.min(worst, nightContrast / dayContrast);
        lowestNight = Math.min(lowestNight, nightContrast);
      }
    }
    // 밤 빛이 없으면(0) 0.88배·가장 낮은 밤 대비 1.02였다(낮에도 민트 유닛과 풀은 대비가 1.01뿐이다 — 외곽선이 가른다)
    expect(worst).toBeGreaterThan(1);
    expect(lowestNight).toBeGreaterThan(1.5);
  });
});

describe("빛 바꾸기", () => {
  const s1 = placeOf(S1_KEY);

  it("1초 차이 한낮은 다시 그릴 만큼 다르지 않고, 10초면 다르다(방향 1°)", () => {
    const at = utcMsForLocalHour(s1.lonDeg, 10);
    const a = secondMapLightAt(skyAt(at), s1);
    expect(lightChanged(a, a)).toBe(false);
    expect(lightChanged(a, secondMapLightAt(skyAt(at + 1000), s1))).toBe(false);
    expect(lightChanged(a, secondMapLightAt(skyAt(at + 10_000), s1))).toBe(true);
    expect(lightChanged(a, FIXED_SECOND_MAP_LIGHT)).toBe(true);
  });

  it("사이 값: 끝은 그대로, 가운데는 섞이고 방향은 단위 벡터다", () => {
    const a = lightAt(s1, 12);
    const b = lightAt(s1, 23);
    expect(blendLight(a, b, 0)).toBe(a);
    expect(blendLight(a, b, 1)).toBe(b);
    const mid = blendLight(a, b, 0.5);
    expect(mid.hemisphereIntensity).toBeCloseTo((a.hemisphereIntensity + b.hemisphereIntensity) / 2, 12);
    expect(length(mid.direction)).toBeCloseTo(1, 12);
    expect(mid.day).toBeCloseTo(0.5, 12);
  });

  it("시험 시각 24시와 0시는 같은 서버 시각이고, 하루(PLANET_DAY_MS = 실제 1시간) 안에 든다", () => {
    for (const lonDeg of [-120, 0, 0.088, 135]) {
      expect(utcMsForLocalHour(lonDeg, 24)).toBe(utcMsForLocalHour(lonDeg, 0));
      const spread = utcMsForLocalHour(lonDeg, 23.999) - utcMsForLocalHour(lonDeg, 0.001);
      expect(Math.abs(spread)).toBeLessThan(PLANET_DAY_MS);
    }
  });
});
