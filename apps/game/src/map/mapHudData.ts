// 2차맵 화면의 시험·측정 표지(data-*) 가운데 엔진 요약·자료 요약·낮밤 빛에서 나오는 것 — 화면 시험(Playwright)과 측정이 읽는다(PLAN 5.7: 1초 요약).
// SecondaryMapScreen.tsx에서 나눴다(순수 함수).
import type { EngineStats } from "@terra/engine";
import type { FeedStats } from "./feedTypes.ts";

const fixed = (value: number, digits: number): string => value.toFixed(digits);

/** 엔진·자료·빛 요약 → data-* 속성(없는 값은 undefined — 속성이 붙지 않는다) */
export function hudDataAttributes(
  stats: EngineStats | null,
  feed: FeedStats | null,
): Record<`data-${string}`, string | number | undefined> {
  const light = stats?.light ?? null;
  return {
    "data-unit-mode": stats?.unitMode,
    "data-pixel-ratio": stats?.pixelRatio,
    "data-buffer": stats ? `${stats.drawingBufferWidth}x${stats.drawingBufferHeight}` : undefined,
    "data-frames": stats?.renderedFrames,
    "data-engine-p95": stats?.renderP95Ms.toFixed(2),
    "data-units": stats?.units,
    "data-moving": stats?.movingUnits,
    "data-drawn-units": stats?.drawnUnits,
    "data-terrain-ms": stats?.terrainBuildMs?.toFixed(0),
    "data-terrain-source": stats?.terrainSource ?? undefined,
    "data-rev": feed?.rev ?? undefined,
    "data-explored": feed?.explored ?? undefined,
    "data-subscribes": feed?.subscribes,
    "data-gaps": feed?.gaps,
    "data-resyncs": feed?.serverResyncs,
    "data-dropped": feed?.droppedUnits,
    "data-snapshot-bytes": feed?.snapshotBytes,
    "data-snapshot-ms": feed?.snapshotMs?.toFixed(0),
    "data-ready-ms": feed?.readyMs?.toFixed(0),
    "data-fetch-ms": feed?.terrainMs?.toFixed(0),
    "data-updates-per-sec": feed ? fixed(feed.unitUpdatesPerSec, 1) : undefined,
    "data-bytes-per-sec": feed ? fixed(feed.bytesPerSec, 0) : undefined,
    "data-lag-ms": feed?.pathLagMs?.toFixed(0),
    "data-light-clock": light?.clock,
    "data-light-day": light ? fixed(light.day, 3) : undefined,
    "data-light-source": light?.source,
    "data-light-flat": light ? fixed(light.flat, 3) : undefined,
    "data-light-hour": light?.localHours == null ? undefined : fixed(light.localHours, 2),
    "data-sun-elevation": light?.sunElevationDeg == null ? undefined : fixed(light.sunElevationDeg, 1),
    "data-moon-elevation": light?.moonElevationDeg == null ? undefined : fixed(light.moonElevationDeg, 1),
    "data-light-changes": light?.changes,
    "data-neighbours": stats?.neighbours,
    "data-props": stats?.props,
    // 가시거리 자동 조절 단계(0부터)와 그 거리(m) — @terra/engine render/viewDistance.ts
    "data-view-level": stats?.viewLevel,
    "data-view-reach": stats ? Math.round(stats.viewReachM) : undefined,
  };
}
