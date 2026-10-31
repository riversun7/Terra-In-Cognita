import { describe, expect, it } from "vitest";
import { createSkyClock } from "./planetSky.ts";
import { formatLocalTime, parseLocalHour, readSecondMapSkyParams, secondMapSkyMode } from "./secondMapSky.ts";

/** 가짜 시계 차이 */
const link = (measured: boolean, offsetMs = 0) => ({
  clockMeasured: () => measured,
  clockOffsetMs: () => (measured ? offsetMs : 0),
});
const utcForHour = (hour: number): number => 1_000_000 + Math.round(hour * 1000);

describe("2차맵 하늘 주소 매개변수", () => {
  it("?second-map-time=: 0~24의 수만 읽는다", () => {
    expect(parseLocalHour("12")).toBe(12);
    expect(parseLocalHour(" 18.15 ")).toBe(18.15);
    expect(parseLocalHour("0")).toBe(0);
    expect(parseLocalHour("24")).toBe(24);
    expect(parseLocalHour("24.5")).toBeNull();
    expect(parseLocalHour("-1")).toBeNull();
    expect(parseLocalHour("1e1")).toBeNull();
    expect(parseLocalHour("noon")).toBeNull();
    expect(parseLocalHour("")).toBeNull();
    expect(parseLocalHour(null)).toBeNull();
  });

  it("주소에서 시각·끔을 읽는다", () => {
    expect(readSecondMapSkyParams("?second-map-time=6.5&second-map-sky=off")).toEqual({
      localHour: 6.5,
      off: true,
    });
    expect(readSecondMapSkyParams("?pixel-ratio=2")).toEqual({ localHour: null, off: false });
  });
});

describe("2차맵 하늘 모드", () => {
  const clock = createSkyClock(link(true, 250), { now: () => 10_000, openedAtMs: 10_000 });

  it("끔 → off, 시각 → fixed(지역 시각을 서버 시각으로), 자리를 모르면 시각을 무시한다", () => {
    expect(
      secondMapSkyMode({ localHour: 6, off: true }, clock, { reducedMotion: false, utcForHour }),
    ).toEqual({
      kind: "off",
    });
    expect(
      secondMapSkyMode({ localHour: 6, off: false }, clock, { reducedMotion: false, utcForHour }),
    ).toEqual({
      kind: "fixed",
      utcMs: 1_006_000,
    });
    const mode = secondMapSkyMode({ localHour: 6, off: false }, clock, {
      reducedMotion: false,
      utcForHour: () => null,
    });
    expect(mode.kind).toBe("clock");
  });

  it("동작 줄이기면 지금 시각(서버 시각, 못 쟀으면 기기 시각)에 멈추고, 아니면 서버 시계", () => {
    expect(
      secondMapSkyMode({ localHour: null, off: false }, clock, { reducedMotion: true, utcForHour }),
    ).toEqual({
      kind: "fixed",
      utcMs: 10_250,
    });
    const unmeasured = createSkyClock(link(false), { now: () => 500, openedAtMs: 500 });
    expect(
      secondMapSkyMode({ localHour: null, off: false }, unmeasured, {
        reducedMotion: true,
        utcForHour,
        now: () => 777.9,
      }),
    ).toEqual({ kind: "fixed", utcMs: 777 });
    const live = secondMapSkyMode({ localHour: null, off: false }, clock, {
      reducedMotion: false,
      utcForHour,
    });
    expect(live.kind).toBe("clock");
    if (live.kind === "clock") {
      expect(live.serverNow()).toBe(10_250);
      expect(live.source?.()).toBe("server");
    }
  });
});

describe("HUD 지역 시각", () => {
  it("HH:MM, 없으면 –", () => {
    expect(formatLocalTime(0)).toBe("00:00");
    expect(formatLocalTime(18.15)).toBe("18:09");
    expect(formatLocalTime(23.999)).toBe("23:59");
    expect(formatLocalTime(24)).toBe("00:00");
    expect(formatLocalTime(null)).toBe("–");
    expect(formatLocalTime(Number.NaN)).toBe("–");
  });
});
