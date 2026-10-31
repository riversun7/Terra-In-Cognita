// 2차맵 하늘 고르기 — 주소 매개변수·서버 시계·동작 줄이기로 2차맵 엔진의 하늘 모드를 만든다(1차맵 planetSky.ts와 같은 규칙).
// ADR 2026-10-28-s1-second-map "구현하며 정한 것 (2차맵 낮밤)". 순수 모듈이다(시험 secondMapSky.test.ts).
// - 시계는 1차맵과 같은 것을 쓴다(createSkyClock): 서버 시계를 쟀으면 그 시각, 못 쟀으면 null(엔진은 낮으로 그린다),
//   화면을 연 뒤 5초가 지나도 못 재면 기기 시계.
// - 동작 줄이기(prefers-reduced-motion: reduce)면 그 시각에 멈춘다(빛이 저절로 바뀌지 않는다).
// - 주소 매개변수(시험·측정용, 화면 문구 없음. packages/shared routes.ts map.search에도 있다):
//   ?second-map-time=<0~24> 그 2차맵의 지역 시각에 멈춘다(달력 3일째 — 달이 거의 보름. 엔진 utcMsForLocalHour),
//   ?second-map-sky=off 낮밤 끔(지금 고정 빛).
import type { PlanetSkyMode } from "@terra/engine";
import type { SkyClock } from "./planetSky.ts";

export const SECOND_MAP_SKY_PARAMS = {
  time: "second-map-time",
  sky: "second-map-sky",
} as const;

export interface SecondMapSkyParams {
  /** ?second-map-time= → 지역 시각(시, 0 이상 24 이하). 없거나 틀리면 null(지금 시각) */
  readonly localHour: number | null;
  /** ?second-map-sky=off */
  readonly off: boolean;
}

/** ?second-map-time= 값: 0~24 사이의 수(소수 가능, "18.5" = 18시 30분). 틀리면 null(무시한다 — 지금 시각) */
export function parseLocalHour(raw: string | null): number | null {
  if (raw === null) return null;
  const text = raw.trim();
  if (!/^\d{1,2}(?:\.\d+)?$/.test(text)) return null;
  const hour = Number(text);
  return hour >= 0 && hour <= 24 ? hour : null;
}

export function readSecondMapSkyParams(search: string): SecondMapSkyParams {
  const params = new URLSearchParams(search);
  return {
    localHour: parseLocalHour(params.get(SECOND_MAP_SKY_PARAMS.time)),
    off: params.get(SECOND_MAP_SKY_PARAMS.sky)?.trim() === "off",
  };
}

/**
 * 엔진에 넘길 하늘 모드. ?second-map-sky=off는 끔, ?second-map-time=이 있으면 그 지역 시각에 멈춤(utcForHour가 서버 시각으로
 * 바꾼다 — 자리를 모르면 null이라 무시), 동작 줄이기면 지금 시각(쟀으면 서버 시각, 아니면 기기 시각)에 멈춤, 나머지는 서버 시계.
 */
export function secondMapSkyMode(
  params: SecondMapSkyParams,
  clock: SkyClock,
  options: { reducedMotion: boolean; utcForHour: (hour: number) => number | null; now?: () => number },
): PlanetSkyMode {
  if (params.off) return { kind: "off" };
  if (params.localHour !== null) {
    const utcMs = options.utcForHour(params.localHour);
    if (utcMs !== null) return { kind: "fixed", utcMs };
  }
  if (options.reducedMotion) {
    const at = clock.serverNow() ?? (options.now ?? Date.now)();
    return { kind: "fixed", utcMs: Math.floor(at) };
  }
  return { kind: "clock", serverNow: clock.serverNow, source: clock.source };
}

/** HUD 지역 시각 "HH:MM"(시각이 없으면 "–") */
export function formatLocalTime(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "–";
  const minutes = Math.floor((((hours % 24) + 24) % 24) * 60 + 1e-9);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
