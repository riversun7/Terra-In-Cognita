// 2차맵 시험 화면(S1) — 지연 로딩 조각 하나로만 들어온다(App.tsx의 React.lazy). Three.js·엔진은 이 조각과 함께 내려온다.
// [임시] 앱 화면 흐름(홈·아래 탭)이 따로 설계되는 중이다. 그때 이 화면을 "지도" 탭으로 옮긴다: onClose·monitor·clockOffsetMs만 받는다.
// [임시] 지형·건물·유닛·경로는 가짜다(@terra/engine/mock). 서버 구독(ADR 2026-10-28-s1-second-map "전송")이 생기면 바꾼다.
// 고빈도 상태(유닛 위치)는 엔진 안 타입 배열에 있고, 이 화면은 1초마다 요약(stats)만 읽는다(PLAN 5.7).
import {
  type EngineStats,
  type EngineStatus,
  type SecondMapEngine,
  createSecondMapEngine,
} from "@terra/engine";
import { type MockDriver, createMockTerrain, createMockWorld, startMockDriver } from "@terra/engine/mock";
import { useEffect, useRef, useState } from "react";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import "./map.css";

/** [임시] 가짜 2차맵 시드(같은 시드면 같은 지형·배치) */
const MOCK_SEED = 20_261_028;
/** [임시] 손으로 보낸 유닛의 빠르기(배치 칸/초, 약 5.9m/초) */
const COMMAND_SPEED_CELLS_PER_SEC = 1;
/** 성능 보고에 붙이는 화면 이름 */
const TELEMETRY_VIEW = "second-map";

interface SecondaryMapScreenProps {
  onClose: () => void;
  /** 앱의 프레임 측정기 — 화면 전체 프레임 시간(엔진 그리기 포함) */
  monitor: FrameMonitor;
  /** 서버 시계 − 기기 시계(ms). 유닛 경로의 출발 시각은 서버 시계다 */
  clockOffsetMs: number;
}

function statusNotice(status: EngineStatus): { tone: "status" | "alert"; text: string } | null {
  switch (status.kind) {
    case "loading":
      return { tone: "status", text: m.map_preparing() };
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

export default function SecondaryMapScreen({ onClose, monitor, clockOffsetMs }: SecondaryMapScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const engineRef = useRef<SecondMapEngine | null>(null);
  const driverRef = useRef<MockDriver | null>(null);
  const offsetRef = useRef(clockOffsetMs);
  const selectedRef = useRef<number | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ kind: "loading" });
  const [selected, setSelected] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<{ stats: EngineStats; camera: string; selectedAt: string } | null>(
    null,
  );
  const perf = usePerfStats(monitor);

  useEffect(() => {
    offsetRef.current = clockOffsetMs;
  }, [clockOffsetMs]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    const serverNow = (): number => Date.now() + offsetRef.current;
    let disposed = false;
    const engine = createSecondMapEngine(host, {
      serverNow,
      onStatus: setStatus,
      onSelect: (id) => {
        selectedRef.current = id;
        setSelected(id);
      },
      // 고른 유닛이 있으면 누른 땅으로 곧게 보낸다([임시] 진짜 경로는 서버가 준다)
      onGroundTap: (cell) => {
        const id = selectedRef.current;
        const from = id === null ? null : engine.unitState(id);
        if (id === null || !from) return;
        driverRef.current?.claim(id);
        engine.setUnitPath(id, {
          points: [from.x, from.y, cell.x, cell.y],
          departAtMs: serverNow(),
          speedCellsPerSec: COMMAND_SPEED_CELLS_PER_SEC,
        });
      },
    });
    engineRef.current = engine;
    setTelemetryView(TELEMETRY_VIEW);

    const terrain = createMockTerrain(MOCK_SEED);
    const world = createMockWorld(terrain, MOCK_SEED);
    engine.setBuildings(world.buildings);
    engine.setUnits(world.units);
    engine.setTerrain(terrain).then(
      () => {
        if (!disposed) driverRef.current = startMockDriver(engine, world, serverNow, MOCK_SEED);
      },
      // 실패는 엔진이 상태(error)로 알린다
      () => undefined,
    );
    // 1초마다 요약만 읽는다. 카메라·고른 유닛 위치는 화면 시험(Playwright)이 조작 결과를 확인하는 데 쓴다(data-*)
    const timer = setInterval(() => {
      const camera = engine.camera();
      const id = selectedRef.current;
      const unit = id === null ? null : engine.unitState(id);
      setSnapshot({
        stats: engine.stats(),
        camera: [camera.targetX, camera.targetZ, camera.yaw, camera.pitch, camera.distance]
          .map((value) => value.toFixed(3))
          .join(","),
        selectedAt: unit ? `${unit.x.toFixed(2)},${unit.y.toFixed(2)}` : "",
      });
    }, 1000);

    return () => {
      disposed = true;
      clearInterval(timer);
      driverRef.current?.stop();
      driverRef.current = null;
      engine.dispose();
      engineRef.current = null;
      setTelemetryView(null);
    };
  }, []);

  const deselect = (): void => {
    selectedRef.current = null;
    setSelected(null);
    engineRef.current?.select(null);
  };

  const togglePause = (): void => {
    const driver = driverRef.current;
    if (!driver) return;
    if (driver.paused) driver.resume();
    else driver.pause();
    setPaused(driver.paused);
  };

  const notice = statusNotice(status);
  const stats = snapshot?.stats ?? null;

  return (
    <section
      className="map-screen"
      aria-labelledby="map-title"
      data-status={status.kind}
      data-unit-mode={stats?.unitMode}
      data-frames={stats?.renderedFrames}
      data-engine-p95={stats?.renderP95Ms.toFixed(2)}
      data-drawn-units={stats?.drawnUnits}
      data-terrain-ms={stats?.terrainBuildMs?.toFixed(0)}
      data-terrain-source={stats?.terrainSource ?? undefined}
      data-camera={snapshot?.camera}
      data-selected-at={snapshot?.selectedAt}
    >
      <div ref={hostRef} className="map-view" role="img" aria-label={m.map_view_label()} />
      <header className="map-hud map-hud-top">
        <div className="map-panel map-heading">
          <button type="button" className="button-small" onClick={onClose}>
            {m.map_back()}
          </button>
          <h1 id="map-title" className="map-title" ref={headingRef} tabIndex={-1}>
            {m.map_title()}
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
            <span>
              {m.map_perf_scene({ units: stats.units, calls: stats.drawCalls })} ·{" "}
              {stats.unitMode === "icon" ? m.map_mode_icon() : m.map_mode_model()}
            </span>
          ) : null}
          {/* 엔진 몫(갱신 + 그리기 명령, 최근 1초 p95). 위 줄의 프레임 시간은 화면 전체(브라우저 합성 포함)다 */}
          {stats ? <span>{m.map_perf_engine({ ms: stats.renderP95Ms.toFixed(1) })}</span> : null}
        </p>
      </header>
      {notice ? (
        <p className="map-panel map-notice" role={notice.tone}>
          {notice.text}
        </p>
      ) : null}
      <footer className="map-hud map-hud-bottom">
        <p className="map-panel map-hint" role="status">
          {selected === null ? m.map_hint() : m.map_selected({ id: selected })}
        </p>
        <div className="map-actions">
          {selected === null ? null : (
            <button type="button" className="button-small" onClick={deselect}>
              {m.map_deselect()}
            </button>
          )}
          <button
            type="button"
            className="button-small"
            aria-pressed={paused}
            onClick={togglePause}
            aria-disabled={status.kind !== "ready"}
          >
            {m.map_pause()}
          </button>
        </div>
      </footer>
    </section>
  );
}
