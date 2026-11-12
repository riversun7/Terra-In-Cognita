// 2차맵 위 판의 성능·자료 숫자(프레임·엔진·픽셀·낮밤·서버 자료) — SecondaryMapScreen.tsx에서 나눴다(파일 크기). 값은 화면이 1초마다 읽은 요약이다(PLAN 5.7).
// 운영진(gm·admin·dev)에게만 보인다(사용자 요청 2026-11-09, useStaffView). 성능 보고(telemetry)는 보이기와 상관없이 누구나 보낸다.
// 처음은 닫힘 — 운영 메뉴 [성능 표시]로 켜고 이 기기에서 기억한다(사용자 지적 2026-11-12 "Fast ms 같은 장보창도 토글로해라", perfPanelToggle.ts).
import type { EngineStats } from "@terra/engine";
import { useStaffView } from "../auth/session.ts";
import { m } from "../paraglide/messages.js";
import type { PerfStats } from "../perf/usePerfStats.ts";
import type { FeedStats } from "./feedTypes.ts";
import { usePerfPanel } from "./perfPanelToggle.ts";
import { formatPixelRatio } from "./pixelRatioParam.ts";
import { formatLocalTime } from "./secondMapSky.ts";

const fixed = (value: number, digits: number): string => value.toFixed(digits);
const roundOrDash = (value: number | null): string | number => (value === null ? "–" : Math.round(value));

export function MapPerfPanel({
  perf,
  stats,
  feed,
}: {
  readonly perf: PerfStats | null;
  readonly stats: EngineStats | null;
  readonly feed: FeedStats | null;
}) {
  const staff = useStaffView();
  const open = usePerfPanel();
  const light = stats?.light ?? null;
  if (!staff || !open) return null;
  return (
    <p className="map-panel map-perf">
      <span>
        {perf
          ? m.map_perf_frames({ fps: perf.fps, ms: perf.p95Ms })
          : m.map_perf_frames({ fps: "–", ms: "–" })}
        {perf?.memoryMb === undefined ? null : ` · ${m.map_perf_memory({ mb: perf.memoryMb })}`}
      </span>
      {stats ? (
        <span>
          {m.map_perf_scene({ units: stats.units, calls: stats.drawCalls })} ·{" "}
          {stats.unitMode === "icon" ? m.map_mode_icon() : m.map_mode_model()}
        </span>
      ) : null}
      {/* 엔진 몫(갱신 + 그리기 명령, 최근 1초 p95). 위 줄의 프레임 시간은 화면 전체(브라우저 합성 포함)다 */}
      {stats ? <span>{m.map_perf_engine({ ms: stats.renderP95Ms.toFixed(1) })}</span> : null}
      {/* 쓰는 픽셀 비율 = min(기기, 상한)과 그리기 버퍼(실제 픽셀) — 선명도·비용 재기용 */}
      {stats ? (
        <span>
          {m.map_perf_pixels({
            ratio: formatPixelRatio(stats.pixelRatio),
            width: stats.drawingBufferWidth,
            height: stats.drawingBufferHeight,
          })}
        </span>
      ) : null}
      {/* 가시거리: 프레임 시간 여유로 자동으로 고른 단계(1부터)와 그 거리, 세운 소품 모델 수(@terra/engine render/viewDistance.ts) */}
      {stats ? (
        <span>
          {m.map_perf_view({
            reach: Math.round(stats.viewReachM),
            level: stats.viewLevel + 1,
            props: stats.props,
          })}
        </span>
      ) : null}
      {/* 낮밤: 그 2차맵의 지역 시각, 항성 고도, 달 밝은 비율(낮밤을 끄거나 시각을 모르면 줄이 없다) */}
      {light && light.localHours !== null ? (
        <span>
          {m.map_perf_light({
            time: formatLocalTime(light.localHours),
            sun: roundOrDash(light.sunElevationDeg),
            moon: light.moonLit === null ? "–" : Math.round(light.moonLit * 100),
          })}
        </span>
      ) : null}
      {/* 서버 자료: 스냅샷 크기·연 때부터 준비까지·다시 구독 수, 최근 1초 갱신 양·움직임 지연(S1 측정) */}
      {feed ? (
        <span>
          {m.map_perf_feed({
            kb: fixed(feed.snapshotBytes / 1024, 1),
            ready: roundOrDash(feed.readyMs),
            resubs: feed.resubscribes,
          })}
        </span>
      ) : null}
      {feed ? (
        <span>
          {m.map_perf_updates({
            ups: Math.round(feed.unitUpdatesPerSec),
            kbps: fixed(feed.bytesPerSec / 1024, 1),
            lag: roundOrDash(feed.pathLagMs),
          })}
        </span>
      ) : null}
    </p>
  );
}
