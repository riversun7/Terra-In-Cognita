// 행성 달력 시험 — 기대값은 손으로 센 값(2026-10-01 기원, 2300년)과 BigInt로 따로 센 값이다(같은 식을 되풀이하지 않는다).
import { describe, expect, it } from "vitest";
import {
  PLANET_CALENDAR_EPOCH_MS,
  PLANET_DAYS_PER_SEASON,
  PLANET_DAYS_PER_YEAR,
  PLANET_DAY_MS,
  PLANET_SEASONS_PER_YEAR,
  PLANET_SEASON_MS,
  PLANET_YEAR_MS,
  type PlanetCalendar,
  isPlanetCalendarTime,
  planetCalendarAt,
  planetCalendarForDisplay,
  southernSeason,
} from "./planetCalendar.ts";
import { createRng } from "./rng.ts";

const E = PLANET_CALENDAR_EPOCH_MS;
/** 실제 1시간(ms) */
const HOUR = 3_600_000;

/** BigInt 내림 나눗셈(BigInt의 /는 0 쪽으로 자르므로 음수에서 하나 내린다) */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
}

/** BigInt로 따로 센 달력 — 시험의 기준값(같은 식을 되풀이하지 않는다) */
function bigCalendar(utcMs: number): Readonly<Record<keyof PlanetCalendar, number>> {
  const elapsed = BigInt(utcMs) - BigInt(E);
  const day = BigInt(HOUR);
  const year = 28n * day;
  const dayIndex = floorDiv(elapsed, day);
  const yearIndex = floorDiv(elapsed, year);
  const dayOfYear = dayIndex - floorDiv(dayIndex, 28n) * 28n;
  return {
    msSinceEpoch: Number(elapsed),
    dayIndex: Number(dayIndex),
    msIntoDay: Number(elapsed - dayIndex * day),
    yearIndex: Number(yearIndex),
    msIntoYear: Number(elapsed - yearIndex * year),
    dayOfYear: Number(dayOfYear),
    season: Number(dayOfYear / 7n),
    dayOfSeason: Number(dayOfYear % 7n),
  };
}

describe("기획 값(D-091·D-5030)", () => {
  it("낮·밤 한 번 = 실제 1시간, 계절 = 7일 = 실제 7시간, 한 해 = 4계절 = 28일 = 실제 28시간", () => {
    expect(PLANET_DAY_MS).toBe(HOUR);
    expect(PLANET_DAYS_PER_SEASON).toBe(7);
    expect(PLANET_SEASONS_PER_YEAR).toBe(4);
    expect(PLANET_DAYS_PER_YEAR).toBe(28);
    expect(PLANET_SEASON_MS).toBe(7 * HOUR);
    expect(PLANET_YEAR_MS).toBe(28 * HOUR);
    expect(PLANET_YEAR_MS).toBe(100_800_000);
  });

  it("[임시] 기원은 2026-10-01T00:00:00Z이고 정시다(경도 0의 자정이 매 정시 UTC)", () => {
    expect(E).toBe(Date.UTC(2026, 9, 1, 0, 0, 0));
    expect(E % HOUR).toBe(0);
  });
});

describe("planetCalendarAt", () => {
  it("기원은 0년 0일 0시, 북반구 봄 첫날", () => {
    expect(planetCalendarAt(E)).toEqual({
      msSinceEpoch: 0,
      dayIndex: 0,
      msIntoDay: 0,
      yearIndex: 0,
      msIntoYear: 0,
      dayOfYear: 0,
      season: 0,
      dayOfSeason: 0,
    });
  });

  it("기원 1ms 전은 전날(일 −1, 해 −1)의 마지막 ms이고, 그해 마지막 날(겨울 7일째)이다", () => {
    expect(planetCalendarAt(E - 1)).toEqual({
      msSinceEpoch: -1,
      dayIndex: -1,
      msIntoDay: HOUR - 1,
      yearIndex: -1,
      msIntoYear: 28 * HOUR - 1,
      dayOfYear: 27,
      season: 3,
      dayOfSeason: 6,
    });
  });

  it("하루(실제 1시간)·계절(7시간)·한 해(28시간)의 경계", () => {
    expect(planetCalendarAt(E + HOUR - 1)).toMatchObject({ dayIndex: 0, msIntoDay: HOUR - 1 });
    expect(planetCalendarAt(E + HOUR)).toMatchObject({ dayIndex: 1, msIntoDay: 0, dayOfYear: 1 });
    expect(planetCalendarAt(E + 7 * HOUR - 1)).toMatchObject({ season: 0, dayOfSeason: 6 });
    expect(planetCalendarAt(E + 7 * HOUR)).toMatchObject({ season: 1, dayOfSeason: 0, dayOfYear: 7 });
    expect(planetCalendarAt(E + 28 * HOUR - 1)).toMatchObject({ yearIndex: 0, dayOfYear: 27, season: 3 });
    expect(planetCalendarAt(E + 28 * HOUR)).toMatchObject({
      yearIndex: 1,
      msIntoYear: 0,
      dayOfYear: 0,
      season: 0,
      dayIndex: 28,
    });
  });

  it("두 해 동안 날마다 계절 0~3, 계절 안의 날 0~6이 차례로 돈다", () => {
    for (let day = -56; day < 56; day++) {
      const at = planetCalendarAt(E + day * HOUR + 1234);
      const dayOfYear = ((day % 28) + 28) % 28;
      expect(at.dayIndex).toBe(day);
      expect(at.dayOfYear).toBe(dayOfYear);
      expect(at.season).toBe(Math.floor(dayOfYear / 7));
      expect(at.dayOfSeason).toBe(dayOfYear % 7);
      expect(at.msIntoDay).toBe(1234);
      expect(at.msIntoYear).toBe(dayOfYear * HOUR + 1234);
    }
  });

  it("2300-01-01 00:00 UTC: 기원에서 2,395,272일, 85,545년 12일째(여름 6일째)", () => {
    const at = planetCalendarAt(Date.UTC(2300, 0, 1));
    expect(at).toEqual({
      msSinceEpoch: 8_622_979_200_000,
      dayIndex: 2_395_272,
      msIntoDay: 0,
      yearIndex: 85_545,
      msIntoYear: 12 * HOUR,
      dayOfYear: 12,
      season: 1,
      dayOfSeason: 5,
    });
  });

  it("기원 앞뒤 아주 먼 시각까지 BigInt로 센 값과 같다(나머지는 늘 0 이상, 몫 × 길이 + 나머지 = 입력)", () => {
    const rng = createRng(20261029);
    const extremes = [
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER + E,
      E - 28 * HOUR * 1_000_000 - 1,
      0,
      -1,
    ];
    const randomTimes = Array.from({ length: 2000 }, () => {
      // 53비트 부호 있는 정수: 위 21비트 × 2^32 + 아래 32비트
      const high = rng.nextU32() % 0x20_0000;
      const value = high * 0x1_0000_0000 + rng.nextU32();
      const signed = rng.nextU32() % 2 === 0 ? value : -value;
      return Math.max(Number.MIN_SAFE_INTEGER + E, signed);
    });
    for (const t of [...extremes, ...randomTimes]) {
      const at = planetCalendarAt(t);
      expect(at).toEqual(bigCalendar(t));
      expect(at.msIntoDay).toBeGreaterThanOrEqual(0);
      expect(at.msIntoYear).toBeGreaterThanOrEqual(0);
    }
  });

  it("안전 정수가 아니면 RangeError를 던진다(판정 쪽 실수를 잡는다)", () => {
    for (const bad of [
      E + 0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -Number.POSITIVE_INFINITY,
      2 ** 53,
      -(2 ** 53),
    ]) {
      expect(() => planetCalendarAt(bad)).toThrow(RangeError);
    }
    // 입력은 안전 정수지만 기원에서 센 ms가 안전 정수 밖
    expect(isPlanetCalendarTime(Number.MIN_SAFE_INTEGER)).toBe(false);
    expect(() => planetCalendarAt(Number.MIN_SAFE_INTEGER)).toThrow(RangeError);
    expect(isPlanetCalendarTime(Number.MIN_SAFE_INTEGER + E)).toBe(true);
  });
});

describe("남반구 계절(D-142: 남반구는 계절이 반대)", () => {
  it("남반구 = 북반구 + 2: 봄 ↔ 가을, 여름 ↔ 겨울", () => {
    expect(southernSeason(0)).toBe(2);
    expect(southernSeason(1)).toBe(3);
    expect(southernSeason(2)).toBe(0);
    expect(southernSeason(3)).toBe(1);
  });

  it("두 번 바꾸면 그대로이고, 한 해 내내 두 반구의 계절이 늘 다르다", () => {
    for (let day = 0; day < 28; day++) {
      const { season } = planetCalendarAt(E + day * HOUR);
      expect(southernSeason(southernSeason(season))).toBe(season);
      expect(southernSeason(season)).not.toBe(season);
    }
  });
});

describe("planetCalendarForDisplay(화면 쪽 입구, 검토 H1)", () => {
  it("소수 시각(시계 차이 x.5ms)은 내림한 시각과 같은 날짜를 준다. 던지지 않는다", () => {
    expect(planetCalendarForDisplay(E + 0.5)).toEqual(planetCalendarAt(E));
    expect(planetCalendarForDisplay(E - 0.5)).toEqual(planetCalendarAt(E - 1));
    expect(planetCalendarForDisplay(E + HOUR - 0.25)).toEqual(planetCalendarAt(E + HOUR - 1));
  });

  it("기기 시각 + x.5ms 차이 꼴의 값은 모두 날짜가 된다", () => {
    const rng = createRng(7);
    for (let k = 0; k < 500; k++) {
      const deviceNow = 1_793_282_066_990 + rng.nextInt(400_000_000);
      const offsetMs = (rng.nextInt(20_001) - 10_000) / 2; // 서버 − 기기, 0.5ms 단위(clock.ts의 평균)
      const shown = planetCalendarForDisplay(deviceNow + offsetMs);
      expect(shown).toEqual(planetCalendarAt(Math.floor(deviceNow + offsetMs)));
    }
  });

  it("수가 아니거나 받는 범위 밖이면 null이다(던지지 않는다)", () => {
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -Number.POSITIVE_INFINITY,
      2 ** 60,
      Number.MIN_SAFE_INTEGER,
    ]) {
      expect(planetCalendarForDisplay(bad)).toBeNull();
    }
  });
});
