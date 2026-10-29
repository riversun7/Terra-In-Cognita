// 1차맵 시험 화면(S2) — 행성 LOD 엔진(@terra/engine/planet)으로 행성을 그린다. 지연 로딩 조각 하나로만 들어온다(App.tsx의 React.lazy).
// [임시] 타일은 가짜 행성 원천(@terra/engine/mock의 createMockPlanet)에서 온다. 서버 타일(ADR 36 "서버 굽기·전송")이 오면
// 메인 세션이 원천만 바꾼다(같은 TileSource 모양). 앱 화면 흐름(홈·아래 탭)이 정해지면 이 화면을 그곳으로 옮긴다: onClose·monitor만 받는다.
// 고빈도 상태는 엔진 안에 있고, 이 화면은 1초마다 요약(stats)만 읽는다(PLAN 5.7). 시험(Playwright)은 data-* 값을 읽는다.
// 틈 찾기: 주소에 ?planet-debug=cracks를 붙이면 엔진이 바탕 구·하늘을 자홍색으로 칠한다(시험용, 타일 사이 틈이 자홍색 점으로 보인다).
import { createMockPlanet } from "@terra/engine/mock";
import {
  type PickedCell,
  type PlanetEngine,
  type PlanetLayer,
  type PlanetStats,
  type PlanetStatus,
  createPlanetEngine,
} from "@terra/engine/planet";
import { useEffect, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { cellLines } from "./planetText.ts";
import "./map.css";
import "./planetMap.css";

/** 성능 보고에 붙이는 화면 이름 */
const TELEMETRY_VIEW = "planet-map";
/** 고도 과장(화면 설정): 처음 값과 범위 */
const DEFAULT_EXAGGERATION = 6;
const MIN_EXAGGERATION = 1;
const MAX_EXAGGERATION = 20;
const LEVELS = [1, 2, 3, 4, 5] as const;

interface PlanetMapScreenProps {
  onClose: () => void;
  /** 앱의 프레임 측정기 — 화면 전체 프레임 시간(엔진 그리기 포함) */
  monitor: FrameMonitor;
}

function notice(status: PlanetStatus): { tone: "status" | "alert"; text: string } | null {
  switch (status.kind) {
    case "loading":
      return { tone: "status", text: m.planet_preparing() };
    case "context-lost":
      return { tone: "status", text: m.map_context_lost() };
    case "unsupported":
      return { tone: "alert", text: m.map_unsupported() };
    case "error":
      return { tone: "alert", text: m.map_error() };
    case "ready":
      return null;
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}

const fixed = (value: number, digits: number): string => value.toFixed(digits);

export default function PlanetMapScreen({ onClose, monitor }: PlanetMapScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const engineRef = useRef<PlanetEngine | null>(null);
  const [status, setStatus] = useState<PlanetStatus>({ kind: "loading" });
  const [stats, setStats] = useState<PlanetStats | null>(null);
  const [layer, setLayer] = useState<PlanetLayer>("terrain");
  const [exaggeration, setExaggeration] = useState(DEFAULT_EXAGGERATION);
  const [picked, setPicked] = useState<{ cell: PickedCell | null; lines: string[] } | null>(null);
  const perf = usePerfStats(monitor);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    const mock = createMockPlanet();
    // [임시] 바이옴 이름은 가짜 행성 표(자료, ko·en)에서. 서버 범례가 오면 그것을 쓴다
    const english = getLocale() === "en";
    const biomeName = (id: number): string | null => {
      const biome = mock.biomes[id];
      return biome ? (english ? biome.name.en : biome.name.ko) : null;
    };
    const engine = createPlanetEngine(host, {
      planet: mock.planet,
      tileSource: mock.source,
      exaggeration: DEFAULT_EXAGGERATION,
      debugCracks: new URLSearchParams(window.location.search).get("planet-debug") === "cracks",
      onStatus: setStatus,
      onPick: (cell) =>
        setPicked({ cell, lines: cell ? cellLines(cell, biomeName) : [m.planet_cell_none()] }),
    });
    engineRef.current = engine;
    setTelemetryView(TELEMETRY_VIEW);
    const timer = setInterval(() => setStats(engine.stats()), 1000);
    return () => {
      clearInterval(timer);
      engine.dispose();
      mock.dispose();
      engineRef.current = null;
      setTelemetryView(null);
    };
  }, []);

  const chooseLayer = (next: PlanetLayer): void => {
    setLayer(next);
    engineRef.current?.setLayer(next);
  };
  const changeExaggeration = (value: number): void => {
    setExaggeration(value);
    engineRef.current?.setExaggeration(value);
  };

  const shown = notice(status);
  const level = stats?.primaryLevel ?? 0;
  const camera = stats?.camera;
  const cell = picked?.cell ?? null;
  const firstMs = stats?.firstDisplayMs ?? null;

  return (
    <section
      className="map-screen planet-screen"
      aria-labelledby="planet-title"
      data-status={status.kind}
      data-layer={layer}
      data-exaggeration={exaggeration}
      data-frames={stats?.renderedFrames}
      data-engine-p95={stats ? fixed(stats.renderP95Ms, 2) : undefined}
      data-tiles-drawn={stats?.tilesDrawn}
      data-tiles-selected={stats?.tilesSelected}
      data-tiles-loaded={stats?.tilesLoaded}
      data-tiles-pending={stats?.tilesPending}
      data-tile-budget={stats?.budgets.visibleTiles}
      data-tile-errors={stats?.tileErrors}
      data-hits={
        stats
          ? [
              stats.budgetHits.tiles,
              stats.budgetHits.fetches,
              stats.budgetHits.uploads,
              stats.budgetHits.memory,
            ].join(",")
          : undefined
      }
      data-draw-calls={stats?.drawCalls}
      data-triangles={stats?.triangles}
      data-gpu-bytes={stats?.gpuBytes}
      data-level={stats?.primaryLevel}
      data-map-level={stats?.mapLevel}
      data-incomplete={stats ? String(stats.incomplete) : undefined}
      data-first-ms={firstMs === null ? undefined : fixed(firstMs, 0)}
      data-context-lost={stats ? String(stats.contextLost) : undefined}
      data-camera={
        camera
          ? [
              camera.latDeg,
              camera.lonDeg,
              camera.distanceM,
              camera.altitudeM,
              camera.headingDeg,
              camera.tiltDeg,
            ]
              .map((value) => value.toFixed(3))
              .join(",")
          : undefined
      }
      data-picked={cell ? `${cell.face},${cell.mapLevel},${cell.i},${cell.j}` : undefined}
    >
      <div ref={hostRef} className="map-view" role="img" aria-label={m.planet_view_label()} />
      <header className="map-hud map-hud-top">
        <div className="map-panel map-heading">
          <button type="button" className="button-small" onClick={onClose}>
            {m.map_back()}
          </button>
          <h1 id="planet-title" className="map-title" ref={headingRef} tabIndex={-1}>
            {m.planet_title()}
          </h1>
        </div>
        <p className="map-panel map-perf">
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
            </>
          ) : null}
        </p>
      </header>
      {shown ? (
        <div className="map-panel map-notice" role={shown.tone}>
          <p>{shown.text}</p>
        </div>
      ) : null}
      <footer className="map-hud map-hud-bottom planet-bottom">
        <div className="map-panel planet-readout" role="status">
          {(picked?.lines ?? [m.planet_hint()]).map((line, index) => (
            // 같은 문장이 두 번 나올 수 있어 순서도 키에 넣는다
            <p key={`${index}-${line}`}>{line}</p>
          ))}
          {layer === "climate" ? <p className="planet-legend">{m.planet_climate_legend()}</p> : null}
          {stats && stats.tileErrors > 0 ? (
            <p className="planet-legend">{m.planet_tile_errors({ count: stats.tileErrors })}</p>
          ) : null}
        </div>
        <div className="map-panel planet-controls">
          <div className="planet-row">
            <p className="planet-level">
              <span>{m.planet_level({ level: level > 0 ? level : "–" })}</span>
              <span className="planet-level-dots" aria-hidden="true">
                {LEVELS.map((step) => (
                  <span key={step} className="planet-level-dot" data-on={step <= level ? "true" : "false"} />
                ))}
              </span>
            </p>
            <div className="planet-segment" role="group" aria-label={m.planet_layer()}>
              <button
                type="button"
                className="button-small"
                aria-pressed={layer === "terrain"}
                onClick={() => chooseLayer("terrain")}
              >
                {m.planet_layer_terrain()}
              </button>
              <button
                type="button"
                className="button-small"
                aria-pressed={layer === "climate"}
                onClick={() => chooseLayer("climate")}
              >
                {m.planet_layer_climate()}
              </button>
            </div>
          </div>
          <div className="planet-row planet-slider">
            <label htmlFor="planet-exaggeration">{m.planet_exaggeration({ value: exaggeration })}</label>
            <input
              id="planet-exaggeration"
              type="range"
              min={MIN_EXAGGERATION}
              max={MAX_EXAGGERATION}
              step={1}
              value={exaggeration}
              onChange={(event) => changeExaggeration(Number(event.currentTarget.value))}
            />
          </div>
        </div>
      </footer>
    </section>
  );
}
