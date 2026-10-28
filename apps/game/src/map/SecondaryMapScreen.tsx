// 2차맵 시험 화면(S1) — 서버의 시험 2차맵을 구독해 지형·건물·유닛을 그린다. 지연 로딩 조각 하나로만 들어온다(App.tsx의 React.lazy).
// [임시] 앱 화면 흐름(홈·아래 탭)이 따로 설계되는 중이다. 그때 이 화면을 "지도" 탭으로 옮긴다: onClose·monitor만 받는다.
// 자료는 서버에서 온다(mapFeed.ts, ADR 2026-10-28-s1-second-map "전송"). 연결·시계 차이는 앱의 연결 하나를 함께 쓴다(serverLink).
// 고빈도 상태(유닛 위치)는 엔진 안 타입 배열에 있고, 이 화면은 1초마다 요약(stats)만 읽는다(PLAN 5.7).
// 이동 명령은 관리자만 보낸다. 보기 전용이면 안내만 하고 보내지 않는다(서버도 명령마다 확인한다).
import {
  type EngineStats,
  type EngineStatus,
  type SecondMapEngine,
  createSecondMapEngine,
} from "@terra/engine";
import { S1_TEST_MAP_KEY } from "@terra/protocol";
import { useEffect, useRef, useState } from "react";
import { refreshSession, useSession } from "../auth/session.ts";
import { isAdmin } from "../auth/sessionState.ts";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import {
  type CommandReport,
  type FeedStats,
  type FeedStatus,
  INITIAL_FEED_STATUS,
  type MapFeed,
} from "./feedTypes.ts";
import { startMapFeed } from "./mapFeed.ts";
import { resultText, terrainFailureText } from "./mapMessages.ts";
import { fetchTerrain } from "./terrainLoader.ts";
import "./map.css";

/** 성능 보고에 붙이는 화면 이름 */
const TELEMETRY_VIEW = "second-map";
/** 엔진·자료의 유닛 상한(엔진 기본값과 같다). 넘는 유닛은 그리지 않고 HUD 값(data-dropped)으로 센다 */
const UNIT_CAPACITY = 2_048;
/** 명령 안내를 지우기까지(ms) */
const COMMAND_NOTICE_MS = 6_000;

interface SecondaryMapScreenProps {
  onClose: () => void;
  /** 앱의 프레임 측정기 — 화면 전체 프레임 시간(엔진 그리기 포함) */
  monitor: FrameMonitor;
}

/** 아래 판의 명령 안내 */
type CommandNotice =
  | { kind: "view_only" }
  | { kind: "offline" }
  | { kind: "sent"; unitId: number }
  | { kind: "result"; report: CommandReport };

interface Notice {
  tone: "status" | "alert";
  lines: string[];
  /** [다시 시도]를 보인다 */
  retry: boolean;
}

interface HudSnapshot {
  stats: EngineStats;
  feed: FeedStats;
  camera: string;
  selectedAt: string;
}

/** 가운데 안내 — 엔진 상태와 자료 상태 중 지금 가장 중요한 것 하나 */
function screenNotice(engine: EngineStatus, feed: FeedStatus): Notice | null {
  const { phase, terrain, hasSnapshot } = feed;
  if (engine.kind === "unsupported") return { tone: "alert", lines: [m.map_unsupported()], retry: false };
  if (engine.kind === "error") return { tone: "alert", lines: [m.map_error()], retry: false };
  if (phase.kind === "failed") {
    return { tone: "alert", lines: [m.map_feed_failed(), resultText(phase.code)], retry: true };
  }
  if (terrain.kind === "failed") {
    return {
      tone: "alert",
      lines: [m.map_terrain_failed(), terrainFailureText(terrain.reason)],
      retry: terrain.reason !== "render",
    };
  }
  if (engine.kind === "context-lost") return { tone: "status", lines: [m.map_context_lost()], retry: false };
  if (phase.kind === "offline") return { tone: "status", lines: [m.status_disconnected()], retry: false };
  if (phase.kind === "connecting") return { tone: "status", lines: [m.map_feed_connecting()], retry: false };
  if (phase.kind === "retrying" && !hasSnapshot) {
    return { tone: "status", lines: [resultText(phase.code), m.map_feed_retry_soon()], retry: false };
  }
  if (!hasSnapshot) return { tone: "status", lines: [m.map_feed_receiving()], retry: false };
  if (terrain.kind === "none" || terrain.kind === "loading") {
    return { tone: "status", lines: [m.map_terrain_loading()], retry: false };
  }
  if (engine.kind === "loading") return { tone: "status", lines: [m.map_preparing()], retry: false };
  return null;
}

function commandText(notice: CommandNotice): string {
  switch (notice.kind) {
    case "view_only":
      return m.map_view_only();
    case "offline":
      return m.map_command_offline();
    case "sent":
      return m.map_command_sent({ id: notice.unitId });
    case "result": {
      const { outcome, unitId } = notice.report;
      if (outcome.ok) return m.map_command_ok({ id: unitId });
      return `${m.map_command_failed({ id: unitId })} ${resultText(outcome.code)}`;
    }
    default: {
      const unhandled: never = notice;
      return unhandled;
    }
  }
}

/** 시험(data-command)용 명령 상태: view_only·offline·sent·ok·결과 코드 */
function commandState(notice: CommandNotice | null): string | undefined {
  if (!notice) return undefined;
  if (notice.kind !== "result") return notice.kind;
  return notice.report.outcome.ok ? "ok" : notice.report.outcome.code;
}

const fixed = (value: number, digits: number): string => value.toFixed(digits);
const roundOrDash = (value: number | null): string | number => (value === null ? "–" : Math.round(value));

export default function SecondaryMapScreen({ onClose, monitor }: SecondaryMapScreenProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const engineRef = useRef<SecondMapEngine | null>(null);
  const feedRef = useRef<MapFeed | null>(null);
  const selectedRef = useRef<number | null>(null);
  const admin = isAdmin(useSession());
  const adminRef = useRef(admin);
  const [status, setStatus] = useState<EngineStatus>({ kind: "loading" });
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(INITIAL_FEED_STATUS);
  const [selected, setSelected] = useState<number | null>(null);
  const [command, setCommand] = useState<CommandNotice | null>(null);
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  const perf = usePerfStats(monitor);

  useEffect(() => {
    adminRef.current = admin;
  }, [admin]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    // 서버 시계 = 기기 시계 + 앱 연결이 잰 차이(다시 잴 때까지 앞의 값)
    const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();
    const engine = createSecondMapEngine(host, {
      serverNow,
      unitCapacity: UNIT_CAPACITY,
      onStatus: setStatus,
      onSelect: (id) => {
        selectedRef.current = id;
        setSelected(id);
      },
      // 고른 유닛이 있으면 누른 칸으로 보낸다(관리자만). 경로는 서버가 찾아 unit_paths로 보낸다
      onGroundTap: (cell) => {
        const unitId = selectedRef.current;
        const current = feedRef.current;
        if (unitId === null || !current) return;
        const attempt = current.moveUnit(unitId, cell);
        setCommand(attempt.kind === "sent" ? { kind: "sent", unitId } : { kind: attempt.kind });
      },
    });
    engineRef.current = engine;
    setTelemetryView(TELEMETRY_VIEW);
    const feed = startMapFeed({
      link: serverLink,
      mapKey: S1_TEST_MAP_KEY,
      sink: engine,
      loadTerrain: (url) => fetchTerrain(url),
      canCommand: () => adminRef.current,
      now: () => performance.now(),
      serverNow,
      unitCapacity: UNIT_CAPACITY,
      onStatus: setFeedStatus,
      onCommand: (report) => setCommand({ kind: "result", report }),
    });
    feedRef.current = feed;

    // 1초마다 요약만 읽는다. 카메라·고른 유닛 위치는 화면 시험(Playwright)이 결과를 확인하는 데 쓴다(data-*)
    const timer = setInterval(() => {
      const camera = engine.camera();
      // 고른 유닛이 새 스냅샷에서 사라졌으면 화면도 맞춘다(엔진은 목록을 바꾸면 고르기를 푼다)
      const id = engine.selected();
      if (id !== selectedRef.current) {
        selectedRef.current = id;
        setSelected(id);
      }
      const unit = id === null ? null : engine.unitState(id);
      setSnapshot({
        stats: engine.stats(),
        feed: feed.stats(),
        camera: [camera.targetX, camera.targetZ, camera.yaw, camera.pitch, camera.distance]
          .map((value) => value.toFixed(3))
          .join(","),
        selectedAt: unit ? `${unit.x.toFixed(2)},${unit.y.toFixed(2)}` : "",
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      // 해제를 먼저 보내고(엔진을 버린 뒤에는 자료를 넣지 않는다) 엔진을 버린다
      feed.stop();
      feedRef.current = null;
      engine.dispose();
      engineRef.current = null;
      setTelemetryView(null);
    };
  }, []);

  // 명령 안내는 잠시 보이고 지운다(보낸 뒤 결과를 기다리는 동안은 그대로)
  useEffect(() => {
    if (!command || command.kind === "sent") return () => undefined;
    const timer = setTimeout(() => setCommand(null), COMMAND_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [command]);

  // 로그인이 풀렸다고 하면 로그인 상태를 다시 확인한다(끝났으면 앱이 로그인 화면으로 바꾸며 이 화면을 닫는다)
  const signInLost =
    (feedStatus.phase.kind === "failed" && feedStatus.phase.code === "sign_in_required") ||
    (feedStatus.terrain.kind === "failed" && feedStatus.terrain.reason === "sign_in");
  useEffect(() => {
    if (signInLost) void refreshSession();
  }, [signInLost]);

  const deselect = (): void => {
    selectedRef.current = null;
    setSelected(null);
    setCommand(null);
    engineRef.current?.select(null);
  };

  const notice = screenNotice(status, feedStatus);
  const stats = snapshot?.stats ?? null;
  const feed = snapshot?.feed ?? null;
  const hint =
    selected === null
      ? m.map_hint()
      : admin
        ? m.map_selected({ id: selected })
        : m.map_selected_view({ id: selected });

  return (
    <section
      className="map-screen"
      aria-labelledby="map-title"
      data-status={status.kind}
      data-feed={feedStatus.phase.kind}
      data-terrain={feedStatus.terrain.kind}
      data-unit-mode={stats?.unitMode}
      data-frames={stats?.renderedFrames}
      data-engine-p95={stats?.renderP95Ms.toFixed(2)}
      data-units={stats?.units}
      data-moving={stats?.movingUnits}
      data-drawn-units={stats?.drawnUnits}
      data-terrain-ms={stats?.terrainBuildMs?.toFixed(0)}
      data-terrain-source={stats?.terrainSource ?? undefined}
      data-rev={feed?.rev ?? undefined}
      data-subscribes={feed?.subscribes}
      data-gaps={feed?.gaps}
      data-resyncs={feed?.serverResyncs}
      data-dropped={feed?.droppedUnits}
      data-snapshot-bytes={feed?.snapshotBytes}
      data-snapshot-ms={feed?.snapshotMs?.toFixed(0)}
      data-ready-ms={feed?.readyMs?.toFixed(0)}
      data-fetch-ms={feed?.terrainMs?.toFixed(0)}
      data-updates-per-sec={feed ? fixed(feed.unitUpdatesPerSec, 1) : undefined}
      data-bytes-per-sec={feed ? fixed(feed.bytesPerSec, 0) : undefined}
      data-lag-ms={feed?.pathLagMs?.toFixed(0)}
      data-command={commandState(command)}
      data-command-ms={command?.kind === "result" ? command.report.elapsedMs.toFixed(0) : undefined}
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
      </header>
      {notice ? (
        <div className="map-panel map-notice" role={notice.tone}>
          {notice.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {notice.retry ? (
            <button type="button" className="button-small" onClick={() => feedRef.current?.retry()}>
              {m.retry()}
            </button>
          ) : null}
        </div>
      ) : null}
      <footer className="map-hud map-hud-bottom">
        <div className="map-panel map-hint" role="status">
          <p>{hint}</p>
          {command ? <p className="map-command">{commandText(command)}</p> : null}
        </div>
        {selected === null ? null : (
          <div className="map-actions">
            <button type="button" className="button-small" onClick={deselect}>
              {m.map_deselect()}
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}
