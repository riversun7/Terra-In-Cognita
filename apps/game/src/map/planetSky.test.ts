import { describe, expect, it } from "vitest";
import {
  DEVICE_CLOCK_FALLBACK_MS,
  createSkyClock,
  parsePlanetTime,
  planetSkyMode,
  planetTelemetryView,
  readPlanetSkyParams,
  skyFeaturesOf,
} from "./planetSky.ts";

/** 가짜 시계 차이: measured가 false면 0(못 잰 값) */
function link(measured: boolean, offsetMs = 0) {
  return { clockMeasured: () => measured, clockOffsetMs: () => (measured ? offsetMs : 0) };
}

/** 주소 → 성능 보고 화면 이름 */
const view = (search: string): string => planetTelemetryView("planet-map", readPlanetSkyParams(search));

describe("주소 매개변수", () => {
  it("?planet-time=: 정수 ms와 ISO 시각만 읽는다. 틀린 값은 무시한다", () => {
    expect(parsePlanetTime("1790812800000")).toBe(1_790_812_800_000);
    expect(parsePlanetTime("-5")).toBe(-5);
    expect(parsePlanetTime("2026-10-01T00:00:00Z")).toBe(1_790_812_800_000);
    expect(parsePlanetTime("2026-10-01T00:00:00.5Z")).toBe(1_790_812_800_500);
    expect(parsePlanetTime(" 2026-10-01T06:30:00+09:00 ")).toBe(Date.UTC(2026, 8, 30, 21, 30));
    expect(parsePlanetTime(null)).toBeNull();
    expect(parsePlanetTime("")).toBeNull();
    expect(parsePlanetTime("soon")).toBeNull();
    expect(parsePlanetTime("12.5")).toBeNull();
    expect(parsePlanetTime("2026-10-01")).toBe(1_790_812_800_000);
    expect(parsePlanetTime("Oct 1 2026")).toBeNull();
    expect(parsePlanetTime("99999999999999999999")).toBeNull();
  });

  it("하늘 끔·요소 끔·재기 모드", () => {
    const params = readPlanetSkyParams(
      "?planet-sky=off&planet-sky-skip=clouds,%20night,nope&planet-sky-bench=2&planet-time=1000",
    );
    expect(params).toEqual({ fixedUtcMs: 1000, off: true, skipped: ["night", "clouds"], benchRepeat: 2 });
    expect(readPlanetSkyParams("")).toEqual({ fixedUtcMs: null, off: false, skipped: [], benchRepeat: null });
    expect(readPlanetSkyParams("?planet-sky=on&planet-sky-bench=3").off).toBe(false);
    expect(readPlanetSkyParams("?planet-sky-bench=3").benchRepeat).toBeNull();
    expect(readPlanetSkyParams("?planet-sky-bench=4").benchRepeat).toBe(4);
  });

  it("끈 요소 → 엔진 요소(켠 것은 넣지 않는다)", () => {
    expect(skyFeaturesOf([])).toEqual({});
    expect(skyFeaturesOf(["moon"])).toEqual({ moon: false });
    expect(skyFeaturesOf(["night", "moon", "clouds"])).toEqual({
      dayNight: false,
      moon: false,
      clouds: false,
    });
  });

  it("성능 보고 화면 이름", () => {
    expect(view("")).toBe("planet-map");
    expect(view("?planet-time=1000")).toBe("planet-map");
    expect(view("?planet-sky=off")).toBe("planet-map:sky-off");
    expect(view("?planet-sky-skip=moon")).toBe("planet-map:sky-skip");
    expect(view("?planet-sky-bench=1&planet-sky=off")).toBe("planet-map:sky-bench");
  });
});

describe("하늘 시계", () => {
  it("쟀으면 기기 시각 + 시계 차이(소수도 그대로 — 엔진이 내린다), 출처 server", () => {
    const clock = createSkyClock(link(true, 1234.5), { now: () => 10_000, openedAtMs: 10_000 });
    expect(clock.serverNow()).toBe(11_234.5);
    expect(clock.source()).toBe("server");
  });

  it("못 쟀으면 null, 연 뒤 5초가 지나면 기기 시계(출처 device)", () => {
    let now = 50_000;
    const clock = createSkyClock(link(false), { now: () => now, openedAtMs: 50_000 });
    expect(clock.serverNow()).toBeNull();
    now += DEVICE_CLOCK_FALLBACK_MS - 1;
    expect(clock.serverNow()).toBeNull();
    now += 1;
    expect(clock.serverNow()).toBe(now);
    expect(clock.source()).toBe("device");
  });

  it("늦게 재면 그때부터 서버 시각(엔진이 1분 넘게 다르면 0.5초에 걸쳐 맞춘다)", () => {
    let measured = false;
    const clock = createSkyClock(
      { clockMeasured: () => measured, clockOffsetMs: () => (measured ? 90_000 : 0) },
      { now: () => 100_000, openedAtMs: 0 },
    );
    expect(clock.serverNow()).toBe(100_000);
    measured = true;
    expect(clock.serverNow()).toBe(190_000);
    expect(clock.source()).toBe("server");
  });
});

describe("엔진 하늘 모드", () => {
  const measured = createSkyClock(link(true, 500), { now: () => 2_000, openedAtMs: 0 });
  const options = { reducedMotion: false, debugCracks: false };

  it("기본은 서버 시계(clock), 끔·틈 찾기는 off", () => {
    const mode = planetSkyMode(readPlanetSkyParams(""), measured, options);
    expect(mode.kind).toBe("clock");
    expect(mode.kind === "clock" ? mode.serverNow() : null).toBe(2_500);
    expect(mode).not.toHaveProperty("features");
    expect(planetSkyMode(readPlanetSkyParams("?planet-sky=off"), measured, options)).toEqual({ kind: "off" });
    expect(planetSkyMode(readPlanetSkyParams(""), measured, { ...options, debugCracks: true })).toEqual({
      kind: "off",
    });
  });

  it("?planet-time=이 있으면 그 시각에 멈추고, 요소 끔을 함께 넘긴다", () => {
    expect(
      planetSkyMode(readPlanetSkyParams("?planet-time=777&planet-sky-skip=moon"), measured, options),
    ).toEqual({
      kind: "fixed",
      utcMs: 777,
      features: { moon: false },
    });
  });

  it("동작 줄이기: 지금 시각(쟀으면 서버 시각, 아니면 기기 시각, 내림)에 멈춘다", () => {
    const reduced = { reducedMotion: true, debugCracks: false, now: () => 9_999.9 };
    expect(planetSkyMode(readPlanetSkyParams(""), measured, reduced)).toEqual({
      kind: "fixed",
      utcMs: 2_500,
    });
    const waiting = createSkyClock(link(false), { now: () => 1, openedAtMs: 0 });
    expect(planetSkyMode(readPlanetSkyParams(""), waiting, reduced)).toEqual({ kind: "fixed", utcMs: 9_999 });
    // ?planet-time=이 동작 줄이기보다 먼저다(사진·시험)
    expect(planetSkyMode(readPlanetSkyParams("?planet-time=5"), measured, reduced)).toEqual({
      kind: "fixed",
      utcMs: 5,
    });
  });
});
