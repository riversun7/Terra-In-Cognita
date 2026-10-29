// 1차맵 시험 화면(S2) — 행성 LOD 엔진(@terra/engine/planet)으로 서버가 구운 행성을 그린다. 지연 로딩 조각 하나로만 들어온다
// (App.tsx의 React.lazy). 순서: 목록 정보 받기(굽는 중이면 기다리며 다시 묻기) → 행성 설명·서버 타일 원천 → 엔진.
// 타일은 서버 이진 그대로 엔진에 넘기고 메시 워커가 푼다(planetSource.ts, ADR 36 "서버 굽기·전송").
// 앱 화면 흐름(홈·아래 탭)이 정해지면 이 화면을 그곳으로 옮긴다: onClose·monitor만 받는다.
// 고빈도 상태는 엔진 안에 있고, 이 화면은 1초마다 요약(stats)만 읽는다(PLAN 5.7). 시험(Playwright)은 data-* 값을 읽는다.
// 틈 찾기: 주소에 ?planet-debug=cracks를 붙이면 엔진이 바탕 구·하늘을 자홍색으로 칠한다(시험용, 타일 사이 틈이 자홍색 점으로 보인다).
import {
  type PickedCell,
  type PlanetEngine,
  type PlanetLayer,
  type PlanetStats,
  type PlanetStatus,
  createPlanetEngine,
} from "@terra/engine/planet";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "../auth/session.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import {
  type PlanetFailure,
  PlanetLoadError,
  createServerTileSource,
  loadPlanetManifest,
  planetDescriptionOf,
} from "./planetSource.ts";
import { cellLines, planetFailureText } from "./planetText.ts";
import "./map.css";
import "./planetMap.css";

/** [임시] 시험 화면이 여는 행성 = 콘텐츠 팩 S2 시험 행성. 행성을 고르는 화면이 생기면 그쪽에서 받는다 */
const PLANET_ID = "s2_test_planet";
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

/** 목록 정보 받기 단계 */
type LoadPhase =
  /** 목록 정보를 받는 중 */
  | { kind: "manifest" }
  /** 서버가 굽는 중(다시 묻기까지 ms) */
  | { kind: "generating"; retryInMs: number }
  /** 엔진을 만들었다(그 뒤 상태는 엔진 status) */
  | { kind: "ready" }
  | { kind: "failed"; reason: PlanetFailure };

/** 화면이 알아야 할 타일 실패(그 밖의 실패는 엔진이 저절로 다시 받는다) */
type TileProblem = Extract<PlanetFailure, "sign_in" | "not_found">;

interface Notice {
  tone: "status" | "alert";
  lines: string[];
  retry: boolean;
}

/** 가운데 안내 — 받기 단계·타일 실패·엔진 상태 중 지금 가장 중요한 것 하나 */
function screenNotice(load: LoadPhase, tiles: TileProblem | null, status: PlanetStatus): Notice | null {
  if (load.kind === "failed") {
    return { tone: "alert", lines: [m.planet_failed(), planetFailureText(load.reason)], retry: true };
  }
  if (status.kind === "unsupported") return { tone: "alert", lines: [m.map_unsupported()], retry: false };
  if (status.kind === "error") return { tone: "alert", lines: [m.map_error()], retry: false };
  if (tiles === "sign_in") return { tone: "alert", lines: [m.map_code_sign_in_required()], retry: false };
  if (tiles === "not_found") return { tone: "alert", lines: [m.planet_tiles_outdated()], retry: true };
  if (load.kind === "manifest") return { tone: "status", lines: [m.planet_manifest_loading()], retry: false };
  if (load.kind === "generating") {
    const seconds = Math.max(1, Math.round(load.retryInMs / 1000));
    return { tone: "status", lines: [m.planet_generating({ seconds })], retry: false };
  }
  switch (status.kind) {
    case "loading":
      return { tone: "status", lines: [m.planet_preparing()], retry: false };
    case "context-lost":
      return { tone: "status", lines: [m.map_context_lost()], retry: false };
    case "ready":
      return null;
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}

const fixed = (value: number, digits: number): string => value.toFixed(digits);

/** 다시 시도하면 화면 안쪽을 새로 만든다(목록 정보부터 다시 받고 엔진·상태를 모두 새로) */
export default function PlanetMapScreen(props: PlanetMapScreenProps) {
  const [attempt, setAttempt] = useState(0);
  return <PlanetMapView key={attempt} {...props} onRetry={() => setAttempt((count) => count + 1)} />;
}

function PlanetMapView({ onClose, monitor, onRetry }: PlanetMapScreenProps & { onRetry: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const engineRef = useRef<PlanetEngine | null>(null);
  // 엔진은 목록 정보를 받은 뒤에 만든다. 그 전에 고른 레이어·과장을 엔진에 넘기려고 지금 값을 따로 들고 있는다
  const layerRef = useRef<PlanetLayer>("terrain");
  const exaggerationRef = useRef(DEFAULT_EXAGGERATION);
  const [load, setLoad] = useState<LoadPhase>({ kind: "manifest" });
  const [tileProblem, setTileProblem] = useState<TileProblem | null>(null);
  const [status, setStatus] = useState<PlanetStatus>({ kind: "loading" });
  const [stats, setStats] = useState<PlanetStats | null>(null);
  const [layer, setLayer] = useState<PlanetLayer>("terrain");
  const [exaggeration, setExaggeration] = useState(DEFAULT_EXAGGERATION);
  const [picked, setPicked] = useState<{ cell: PickedCell | null; lines: string[] } | null>(null);
  const perf = usePerfStats(monitor);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    const controller = new AbortController();
    let engine: PlanetEngine | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    setTelemetryView(TELEMETRY_VIEW);
    loadPlanetManifest(PLANET_ID, {
      signal: controller.signal,
      onGenerating: (retryInMs) => setLoad({ kind: "generating", retryInMs }),
    }).then(
      (manifest) => {
        if (controller.signal.aborted) return;
        // 바이옴 이름은 서버 범례(자료, ko·en)에서
        const english = getLocale() === "en";
        const names = new Map(
          manifest.biomes.map((biome) => [biome.index, english ? biome.name.en : biome.name.ko]),
        );
        const created = createPlanetEngine(host, {
          planet: planetDescriptionOf(manifest),
          tileSource: createServerTileSource(manifest, {
            onFailure: (reason) => {
              if (reason === "sign_in" || reason === "not_found") setTileProblem(reason);
            },
          }),
          layer: layerRef.current,
          exaggeration: exaggerationRef.current,
          debugCracks: new URLSearchParams(window.location.search).get("planet-debug") === "cracks",
          onStatus: setStatus,
          onPick: (cell) =>
            setPicked({
              cell,
              lines: cell ? cellLines(cell, (id) => names.get(id) ?? null) : [m.planet_cell_none()],
            }),
        });
        engine = created;
        engineRef.current = created;
        setLoad({ kind: "ready" });
        timer = setInterval(() => setStats(created.stats()), 1000);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({ kind: "failed", reason: error instanceof PlanetLoadError ? error.reason : "server" });
      },
    );
    return () => {
      controller.abort(new DOMException("planet screen closed", "AbortError"));
      clearInterval(timer);
      engine?.dispose();
      engineRef.current = null;
      setTelemetryView(null);
    };
  }, []);

  // 로그인이 풀렸다고 하면 로그인 상태를 다시 확인한다(끝났으면 앱이 로그인 화면으로 바꾸며 이 화면을 닫는다)
  const signInLost = (load.kind === "failed" && load.reason === "sign_in") || tileProblem === "sign_in";
  useEffect(() => {
    if (signInLost) void refreshSession();
  }, [signInLost]);

  const chooseLayer = (next: PlanetLayer): void => {
    layerRef.current = next;
    setLayer(next);
    engineRef.current?.setLayer(next);
  };
  const changeExaggeration = (value: number): void => {
    exaggerationRef.current = value;
    setExaggeration(value);
    engineRef.current?.setExaggeration(value);
  };

  const shown = screenNotice(load, tileProblem, status);
  const level = stats?.primaryLevel ?? 0;
  const camera = stats?.camera;
  const cell = picked?.cell ?? null;
  const firstMs = stats?.firstDisplayMs ?? null;

  return (
    <section
      className="map-screen planet-screen"
      aria-labelledby="planet-title"
      data-planet={PLANET_ID}
      data-load={load.kind}
      data-failure={load.kind === "failed" ? load.reason : (tileProblem ?? undefined)}
      data-status={status.kind}
      data-layer={layer}
      data-engine-layer={stats?.layer}
      data-engine-exaggeration={stats?.exaggeration}
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
          {shown.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {shown.retry ? (
            <button type="button" className="button-small" onClick={onRetry}>
              {m.retry()}
            </button>
          ) : null}
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
