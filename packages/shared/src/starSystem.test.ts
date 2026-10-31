// 항성계 계산(생명 가능 지대·빛 세기·온도 제안)과 항성계 정의 검사 시험
import { describe, expect, it } from "vitest";
import { PLANET_SETTING_RANGES } from "./planetDefinition.ts";
import { NORMAL_PRESETS, resolvePlanetSettings } from "./planetPresets.ts";
import {
  DEFAULT_STAR_TYPE,
  SOLAR_HABITABLE_ZONE_AU,
  STAR_SYSTEM_DISTANCE_RANGE,
  STAR_SYSTEM_MAX_ORBITS,
  STAR_TYPES,
  emptyStarSystem,
  habitableZone,
  parseStarSystemDefinition,
  starType,
  stellarFlux,
  suggestTemperatures,
  temperatureOffsetC,
  zoneOf,
} from "./starSystem.ts";

const EARTH = resolvePlanetSettings(NORMAL_PRESETS);
const PLANET_ID = "0b6f1c9e-3a52-4d8e-9f10-2c3d4e5f6a7b";

const VALID = {
  v: 1,
  star: { type: "k0v" },
  orbits: [
    { distanceMilliAu: 400, body: { kind: "asteroid_belt" } },
    { distanceMilliAu: 900, body: { kind: "planet", planetId: PLANET_ID } },
    { distanceMilliAu: 1500, body: { kind: "empty" } },
    { distanceMilliAu: 3000, body: { kind: "structure" } },
  ],
};

/** 궤도 하나(빈 자리)만 있는 정의 */
const withDistance = (distanceMilliAu: unknown) => ({
  ...VALID,
  orbits: [{ distanceMilliAu, body: { kind: "empty" } }],
});

/** 빈 자리 궤도 count개 */
const emptyOrbits = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    distanceMilliAu: 100 * (index + 1),
    body: { kind: "empty" },
  }));

/** 1 AU 궤도 하나에 이 천체 */
const withBody = (value: unknown) => ({ ...VALID, orbits: [{ distanceMilliAu: 1000, body: value }] });

describe("항성 종류 표", () => {
  it("ID는 하나씩이고 태양형은 광도 1, 뜨거운 별일수록 밝다", () => {
    expect(new Set(STAR_TYPES.map((type) => type.id)).size).toBe(STAR_TYPES.length);
    expect(starType(DEFAULT_STAR_TYPE)?.luminosity).toBe(1);
    for (let index = 1; index < STAR_TYPES.length; index += 1) {
      const hotter = STAR_TYPES[index - 1];
      const cooler = STAR_TYPES[index];
      expect(hotter && cooler && hotter.luminosity > cooler.luminosity).toBe(true);
      expect(hotter && cooler && hotter.temperatureK > cooler.temperatureK).toBe(true);
    }
    expect(starType("x9z")).toBeUndefined();
  });
});

describe("생명 가능 지대", () => {
  it("태양은 Kopparapu 2013 보수적 한계, 다른 별은 √L배", () => {
    expect(habitableZone(1)).toEqual(SOLAR_HABITABLE_ZONE_AU);
    const bright = habitableZone(4);
    expect(bright.inner).toBeCloseTo(SOLAR_HABITABLE_ZONE_AU.inner * 2, 12);
    expect(bright.outer).toBeCloseTo(SOLAR_HABITABLE_ZONE_AU.outer * 2, 12);
    const dim = habitableZone(0.01);
    expect(dim.inner).toBeCloseTo(SOLAR_HABITABLE_ZONE_AU.inner / 10, 12);
  });

  it("지대 안팎: 안쪽은 더움, 바깥은 추움, 경계는 안", () => {
    expect(zoneOf(1, 1)).toBe("habitable");
    expect(zoneOf(1, 0.7)).toBe("hot");
    expect(zoneOf(1, 5.2)).toBe("cold");
    expect(zoneOf(1, SOLAR_HABITABLE_ZONE_AU.inner)).toBe("habitable");
    expect(zoneOf(1, SOLAR_HABITABLE_ZONE_AU.outer)).toBe("habitable");
    // 어두운 별은 지구 거리가 춥다
    expect(zoneOf(0.069, 1)).toBe("cold");
  });
});

describe("빛 세기", () => {
  it("L ÷ d²", () => {
    expect(stellarFlux(1, 1)).toBe(1);
    expect(stellarFlux(1, 2)).toBe(0.25);
    expect(stellarFlux(4, 2)).toBe(1);
    expect(stellarFlux(1, 0.5)).toBe(4);
  });
});

describe("온도 제안", () => {
  it("빛 세기 1이면 지구 기준(보통 프리셋) 그대로", () => {
    expect(temperatureOffsetC(1)).toBe(0);
    expect(suggestTemperatures(1, EARTH)).toEqual({
      equatorTemperatureC: EARTH.equatorTemperatureC,
      poleTemperatureC: EARTH.poleTemperatureC,
      offsetC: 0,
    });
  });

  it("가까울수록(빛이 셀수록) 덥고, 적도·극에 같은 차이를 더한다", () => {
    const near = suggestTemperatures(stellarFlux(1, 0.9), EARTH);
    const far = suggestTemperatures(stellarFlux(1, 1.5), EARTH);
    expect(near.offsetC).toBeGreaterThan(0);
    expect(far.offsetC).toBeLessThan(0);
    expect(near.equatorTemperatureC - EARTH.equatorTemperatureC).toBe(near.offsetC);
    expect(near.poleTemperatureC - EARTH.poleTemperatureC).toBe(near.offsetC);
    expect(far.equatorTemperatureC - EARTH.equatorTemperatureC).toBe(far.offsetC);
    // 빛 세기에 대해 줄지 않는다
    let previous = Number.NEGATIVE_INFINITY;
    for (const flux of [0.05, 0.2, 0.5, 0.9, 1, 1.1, 1.5, 2, 4]) {
      const offset = temperatureOffsetC(flux);
      expect(offset).toBeGreaterThan(previous);
      previous = offset;
    }
  });

  it("두 배 빛이면 누그러뜨린 평형 온도 차이(약 +24°C)", () => {
    expect(suggestTemperatures(2, EARTH).offsetC).toBe(24);
    expect(suggestTemperatures(0.5, EARTH).offsetC).toBe(-20);
  });

  it("정수이고 세부 수치 범위 안이며 극은 적도를 넘지 않는다", () => {
    for (const flux of [0.0001, 0.01, 0.3, 1, 3, 30, 1000]) {
      const result = suggestTemperatures(flux, EARTH);
      expect(Number.isInteger(result.equatorTemperatureC)).toBe(true);
      expect(Number.isInteger(result.poleTemperatureC)).toBe(true);
      const [equatorMin, equatorMax] = PLANET_SETTING_RANGES.equatorTemperatureC;
      const [poleMin, poleMax] = PLANET_SETTING_RANGES.poleTemperatureC;
      expect(result.equatorTemperatureC).toBeGreaterThanOrEqual(equatorMin);
      expect(result.equatorTemperatureC).toBeLessThanOrEqual(equatorMax);
      expect(result.poleTemperatureC).toBeGreaterThanOrEqual(poleMin);
      expect(result.poleTemperatureC).toBeLessThanOrEqual(poleMax);
      expect(result.poleTemperatureC).toBeLessThanOrEqual(result.equatorTemperatureC);
    }
    // 아주 가까우면 범위 끝에 붙는다
    expect(suggestTemperatures(1000, EARTH).equatorTemperatureC).toBe(
      PLANET_SETTING_RANGES.equatorTemperatureC[1],
    );
    expect(suggestTemperatures(0.0001, EARTH).poleTemperatureC).toBe(
      PLANET_SETTING_RANGES.poleTemperatureC[0],
    );
  });

  it("기준이 극 > 적도로 묶일 때도 극을 적도로 낮춘다", () => {
    const result = suggestTemperatures(1, { equatorTemperatureC: 10, poleTemperatureC: 30 });
    expect(result.poleTemperatureC).toBe(10);
  });
});

describe("항성계 정의 검사", () => {
  it("맞는 정의는 같은 모양 새 객체로 돌려준다", () => {
    const parsed = parseStarSystemDefinition(VALID);
    expect(parsed).toEqual(VALID);
    expect(parsed).not.toBe(VALID);
    expect(parseStarSystemDefinition(emptyStarSystem())).toEqual({ v: 1, star: { type: "g2v" }, orbits: [] });
    expect(parseStarSystemDefinition(JSON.parse(JSON.stringify(VALID)))).toEqual(VALID);
  });

  it("판·항성 종류·모르는 칸이 틀리면 받지 않는다", () => {
    expect(parseStarSystemDefinition(null)).toBeNull();
    expect(parseStarSystemDefinition([])).toBeNull();
    expect(parseStarSystemDefinition({ ...VALID, v: 2 })).toBeNull();
    expect(parseStarSystemDefinition({ ...VALID, extra: 1 })).toBeNull();
    expect(parseStarSystemDefinition({ ...VALID, star: { type: "o5v" } })).toBeNull();
    expect(parseStarSystemDefinition({ ...VALID, star: { type: "g2v", mass: 1 } })).toBeNull();
    expect(parseStarSystemDefinition({ v: 1, star: { type: "g2v" } })).toBeNull();
    expect(parseStarSystemDefinition({ ...VALID, orbits: {} })).toBeNull();
  });

  it("거리는 범위 안 정수이고 늘 커진다", () => {
    const [min, max] = STAR_SYSTEM_DISTANCE_RANGE;
    expect(parseStarSystemDefinition(withDistance(min))).not.toBeNull();
    expect(parseStarSystemDefinition(withDistance(max))).not.toBeNull();
    expect(parseStarSystemDefinition(withDistance(min - 1))).toBeNull();
    expect(parseStarSystemDefinition(withDistance(max + 1))).toBeNull();
    expect(parseStarSystemDefinition(withDistance(1000.5))).toBeNull();
    expect(parseStarSystemDefinition(withDistance("1000"))).toBeNull();
    expect(parseStarSystemDefinition(withDistance(Number.NaN))).toBeNull();
    const same = {
      ...VALID,
      orbits: [
        { distanceMilliAu: 1000, body: { kind: "empty" } },
        { distanceMilliAu: 1000, body: { kind: "empty" } },
      ],
    };
    expect(parseStarSystemDefinition(same)).toBeNull();
    const backwards = {
      ...same,
      orbits: [same.orbits[0], { distanceMilliAu: 500, body: { kind: "empty" } }],
    };
    expect(parseStarSystemDefinition(backwards)).toBeNull();
  });

  it("궤도 수 상한", () => {
    expect(
      parseStarSystemDefinition({ ...VALID, orbits: emptyOrbits(STAR_SYSTEM_MAX_ORBITS) }),
    ).not.toBeNull();
    expect(
      parseStarSystemDefinition({ ...VALID, orbits: emptyOrbits(STAR_SYSTEM_MAX_ORBITS + 1) }),
    ).toBeNull();
  });

  it("천체: 알려진 종류만, 행성은 소문자 uuid, 다른 칸은 틀림", () => {
    expect(parseStarSystemDefinition(withBody({ kind: "planet", planetId: PLANET_ID }))).not.toBeNull();
    expect(
      parseStarSystemDefinition(withBody({ kind: "planet", planetId: PLANET_ID.toUpperCase() })),
    ).toBeNull();
    expect(parseStarSystemDefinition(withBody({ kind: "planet", planetId: "s2_test_planet" }))).toBeNull();
    expect(parseStarSystemDefinition(withBody({ kind: "planet" }))).toBeNull();
    expect(parseStarSystemDefinition(withBody({ kind: "empty", planetId: PLANET_ID }))).toBeNull();
    expect(parseStarSystemDefinition(withBody({ kind: "moon" }))).toBeNull();
    expect(parseStarSystemDefinition(withBody({ kind: "empty", note: "x" }))).toBeNull();
    expect(parseStarSystemDefinition(withBody("empty"))).toBeNull();
    // 원형에 숨은 칸은 보지 않는다
    const inherited = { kind: "planet" };
    Object.setPrototypeOf(inherited, { planetId: PLANET_ID });
    expect(parseStarSystemDefinition(withBody(inherited))).toBeNull();
  });
});
