// 1차맵 하늘 고르기 — 화면 주소 매개변수·서버 시계·동작 줄이기로 엔진 하늘 모드(PlanetSkyMode)를 만든다.
// ADR 2026-10-29-primary-map-sky 2·7·9절. 순수 모듈이다(시험 planetSky.test.ts). 주소 매개변수는 시험·측정용이라 화면 문구가 없다.
// - 시계: 서버 시계를 쟀으면 기기 시각 + 시계 차이, 못 쟀으면 null(엔진은 지금 빛 = 낮으로 그린다). 1차맵을 연 뒤 5초가 지나도
//   못 재면(WebSocket이 막힌 세션 등) 기기 시계를 쓴다. 소수 시계 차이는 엔진이 내린다.
// - 동작 줄이기(prefers-reduced-motion: reduce)면 하늘이 움직이지 않게 그 시각에 멈춘다(fixed).
// - 주소 매개변수(packages/shared routes.ts map_planet.search에도 있다 — 표에 없는 검색어는 주소를 다시 만들 때 빠진다):
//   ?planet-time=<ISO 시각 또는 정수 ms> 시각을 멈춘다(사진·시험), ?planet-sky=off 하늘 끔,
//   ?planet-sky-skip=night,moon,clouds 고른 요소만 끔, ?planet-sky-bench=<1|2|4> GPU 몫 재기 모드.
import type { PlanetSkyFeatures, PlanetSkyMode, SkyClockSource } from "@terra/engine/planet";

export const PLANET_SKY_PARAMS = {
  time: "planet-time",
  sky: "planet-sky",
  skip: "planet-sky-skip",
  bench: "planet-sky-bench",
} as const;

/** 시계를 못 재면 1차맵을 연 뒤 이만큼 지나 기기 시계로 켠다(ms) */
export const DEVICE_CLOCK_FALLBACK_MS = 5000;

/** 끌 수 있는 요소(?planet-sky-skip=) */
export type SkySkip = "night" | "moon" | "clouds";
const SKIPS: readonly SkySkip[] = ["night", "moon", "clouds"];
const BENCH_REPEATS = [1, 2, 4] as const;
export type SkyBenchRepeat = (typeof BENCH_REPEATS)[number];

export interface PlanetSkyParams {
  /** ?planet-time= → 멈출 시각(정수 ms). 없거나 틀리면 null(지금 시각) */
  readonly fixedUtcMs: number | null;
  /** ?planet-sky=off */
  readonly off: boolean;
  /** ?planet-sky-skip=로 끈 요소(주소 순서와 상관없이 정한 순서) */
  readonly skipped: readonly SkySkip[];
  /** ?planet-sky-bench=<1|2|4>. 아니면 null */
  readonly benchRepeat: SkyBenchRepeat | null;
}

const isBenchRepeat = (value: number): value is SkyBenchRepeat => BENCH_REPEATS.some((n) => n === value);

/**
 * ISO 8601 날짜·시각만 받는다(브라우저 Date.parse는 "12.5" 같은 글자도 날짜로 읽는다). 시간대가 없는 날짜·시각은 기기 시간대로
 * 읽히므로(ECMAScript 명세) 사진·시험은 Z나 +09:00을 붙인다.
 */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/** ?planet-time= 값: 정수 ms 또는 ISO 시각 → 정수 ms. 틀리면 null(무시한다 — 지금 시각) */
export function parsePlanetTime(raw: string | null): number | null {
  if (raw === null) return null;
  const text = raw.trim();
  if (/^-?\d+$/.test(text)) {
    const value = Number(text);
    return Number.isSafeInteger(value) ? value : null;
  }
  if (!ISO_TIME.test(text)) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

export function readPlanetSkyParams(search: string): PlanetSkyParams {
  const params = new URLSearchParams(search);
  const skipText = params.get(PLANET_SKY_PARAMS.skip) ?? "";
  const asked = new Set(skipText.split(",").map((token) => token.trim()));
  const bench = Number(params.get(PLANET_SKY_PARAMS.bench) ?? "");
  return {
    fixedUtcMs: parsePlanetTime(params.get(PLANET_SKY_PARAMS.time)),
    off: params.get(PLANET_SKY_PARAMS.sky)?.trim() === "off",
    skipped: SKIPS.filter((skip) => asked.has(skip)),
    benchRepeat: isBenchRepeat(bench) ? bench : null,
  };
}

/** 끈 요소 → 엔진 요소 표(켠 것은 넣지 않는다 — 엔진 기본이 켬) */
export function skyFeaturesOf(skipped: readonly SkySkip[]): PlanetSkyFeatures {
  return {
    ...(skipped.includes("night") ? { dayNight: false } : {}),
    ...(skipped.includes("moon") ? { moon: false } : {}),
    ...(skipped.includes("clouds") ? { clouds: false } : {}),
  };
}

/** 시계 차이를 아는 쪽(앱의 serverLink) */
export interface SkyClockLink {
  clockMeasured(): boolean;
  clockOffsetMs(): number;
}

export interface SkyClock {
  /** 서버 시각(ms, 소수일 수 있다). 아직 못 쟀고 5초가 안 됐으면 null */
  readonly serverNow: () => number | null;
  /** 지금 시각의 출처 */
  readonly source: () => SkyClockSource;
}

export function createSkyClock(
  link: SkyClockLink,
  options: { now?: () => number; openedAtMs?: number; fallbackMs?: number } = {},
): SkyClock {
  const now = options.now ?? Date.now;
  const openedAt = options.openedAtMs ?? now();
  const fallbackMs = options.fallbackMs ?? DEVICE_CLOCK_FALLBACK_MS;
  return {
    serverNow: () => {
      if (link.clockMeasured()) return now() + link.clockOffsetMs();
      return now() - openedAt >= fallbackMs ? now() : null;
    },
    source: () => (link.clockMeasured() ? "server" : "device"),
  };
}

/**
 * 엔진에 넘길 하늘 모드. 틈 찾기·?planet-sky=off는 끔, ?planet-time=이 있으면 그 시각에 멈춤,
 * 동작 줄이기면 지금 시각(쟀으면 서버 시각, 아니면 기기 시각)에 멈춤, 나머지는 서버 시계.
 */
export function planetSkyMode(
  params: PlanetSkyParams,
  clock: SkyClock,
  options: { reducedMotion: boolean; debugCracks: boolean; now?: () => number },
): PlanetSkyMode {
  if (options.debugCracks || params.off) return { kind: "off" };
  const features = skyFeaturesOf(params.skipped);
  const withFeatures = Object.keys(features).length > 0 ? { features } : {};
  if (params.fixedUtcMs !== null) return { kind: "fixed", utcMs: params.fixedUtcMs, ...withFeatures };
  if (options.reducedMotion) {
    const at = clock.serverNow() ?? (options.now ?? Date.now)();
    return { kind: "fixed", utcMs: Math.floor(at), ...withFeatures };
  }
  return { kind: "clock", serverNow: clock.serverNow, source: clock.source, ...withFeatures };
}

/**
 * 성능 보고 화면 이름(nas-metrics가 나눠 본다. ADR 9절): 재기 모드 → planet-map:sky-bench, 하늘 끔 → planet-map:sky-off,
 * 요소 끔 → planet-map:sky-skip, 나머지(시각 멈춤 포함) → planet-map
 */
export function planetTelemetryView(base: string, params: PlanetSkyParams): string {
  if (params.benchRepeat !== null) return `${base}:sky-bench`;
  if (params.off) return `${base}:sky-off`;
  if (params.skipped.length > 0) return `${base}:sky-skip`;
  return base;
}
