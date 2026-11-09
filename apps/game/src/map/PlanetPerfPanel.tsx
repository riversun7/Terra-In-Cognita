// 1차맵 위 판의 성능 숫자(프레임·타일·GPU·엔진·상한 도달·첫 표시·픽셀, 재기 모드면 하늘) — PlanetMapScreen.tsx에서 나눴다(파일 크기).
// 운영진(gm·admin·dev)에게만 보인다(사용자 요청 2026-11-09 "일반 유저는 fps나 ms 표시 없애고 운영진만 보이게", useStaffView).
// 성능 보고(telemetry/reporter.ts)는 앱의 프레임 측정기에서 따로 보내므로 보이기와 상관없이 누구나 보낸다.
// 시험(Playwright)이 읽는 엔진 값은 화면 section의 data-*에 그대로 있다.
import type { PlanetStats } from "@terra/engine/planet";
import { useStaffView } from "../auth/session.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";
import { formatPixelRatio } from "./pixelRatioParam.ts";

const fixed = (value: number, digits: number): string => value.toFixed(digits);
const oneDecimal = (value: number | null | undefined): string =>
  value === null || value === undefined ? "–" : fixed(value, 1);

export function PlanetPerfPanel({
  monitor,
  stats,
  hidden,
}: {
  readonly monitor: FrameMonitor;
  readonly stats: PlanetStats | null;
  readonly hidden: boolean;
}) {
  const staff = useStaffView();
  // 운영진이 아니면 1초마다 바뀌는 프레임 값도 받지 않는다(이 부품만 다시 그린다)
  if (!staff) return null;
  return <StaffPerf monitor={monitor} stats={stats} hidden={hidden} />;
}

function StaffPerf({
  monitor,
  stats,
  hidden,
}: {
  readonly monitor: FrameMonitor;
  readonly stats: PlanetStats | null;
  readonly hidden: boolean;
}) {
  const perf = usePerfStats(monitor);
  const firstMs = stats?.firstDisplayMs ?? null;
  return (
    <p className="map-panel map-perf" hidden={hidden}>
      <span>
        {perf
          ? m.map_perf_frames({ fps: perf.fps, ms: perf.p95Ms })
          : m.map_perf_frames({ fps: "–", ms: "–" })}
        {perf?.memoryMb === undefined ? null : ` · ${m.map_perf_memory({ mb: perf.memoryMb })}`}
      </span>
      {stats ? (
        <>
          <span>
            {m.planet_perf_tiles({
              drawn: stats.tilesDrawn,
              budget: stats.budgets.visibleTiles,
              loaded: stats.tilesLoaded,
              pending: stats.tilesPending,
            })}
          </span>
          <span>
            {m.planet_perf_gpu({
              calls: stats.drawCalls,
              tris: fixed(stats.triangles / 1000, 1),
              mb: fixed(stats.gpuBytes / (1024 * 1024), 1),
              memory: fixed(stats.memoryBytes / (1024 * 1024), 1),
            })}
          </span>
          {/* 엔진 몫(고르기·올리기·그리기 명령, 최근 1초 p95). 위 줄의 프레임 시간은 화면 전체(브라우저 합성 포함)다 */}
          <span>{m.map_perf_engine({ ms: fixed(stats.renderP95Ms, 1) })}</span>
          <span>
            {m.planet_perf_hits({
              tiles: stats.budgetHits.tiles,
              fetches: stats.budgetHits.fetches,
              uploads: stats.budgetHits.uploads,
              memory: stats.budgetHits.memory,
            })}
          </span>
          <span>{m.planet_perf_first({ ms: firstMs === null ? "–" : fixed(firstMs, 0) })}</span>
          {/* 쓰는 픽셀 비율 = min(기기, 상한)과 그리기 버퍼(실제 픽셀) — 선명도·비용 재기용 */}
          <span>
            {m.map_perf_pixels({
              ratio: formatPixelRatio(stats.pixelRatio),
              width: stats.drawingBufferWidth,
              height: stats.drawingBufferHeight,
            })}
          </span>
          {/* 하늘 줄은 재기 모드(?planet-sky-bench=)에서만: 항성 바로 아래 위도·경도, 그리기 + 1화소 읽기 중앙값, 구름 면 굽기 최대, 달, 하늘 GPU 메모리 */}
          {stats.gpuBench ? (
            <span>
              {m.planet_perf_sky({
                lat: oneDecimal(stats.sky.subsolarLatDeg),
                lon: oneDecimal(stats.sky.subsolarLonDeg),
                gpu: fixed(stats.gpuBench.medianMs, 1),
                repeat: stats.gpuBench.repeat,
                bake: oneDecimal(stats.sky.cloudBakeMaxMs),
                moons: stats.sky.moonsDrawn,
                mb: fixed(stats.sky.gpuBytes / (1024 * 1024), 1),
              })}
            </span>
          ) : null}
        </>
      ) : null}
    </p>
  );
}
