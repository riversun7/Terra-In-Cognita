// 2차맵 화면(S1) — 서버의 2차맵을 구독해 지형·건물·유닛을 그린다. 지연 로딩 조각 하나로만 들어온다(App.tsx의 React.lazy).
// 열 맵(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1 D-6017): 주소 ?key=, 없으면 내 사이보그가 있는 맵(MapTargetGate.tsx),
// 카메라는 지형이 서면 내 사이보그 자리에 맞춘다. 내 사이보그가 없는 맵이면 1차맵에서 고른 곳(?at=) 또는 그 2차맵 도시 시청(WP7, 515).
// 서버가 띄우지 않은 맵(unknown_map)·볼 수 없는 맵(not_visible)이면 다시 묻지 않고 까닭과 [1차맵에서 보기](1차맵 명령 흐름으로, 513)를 보인다.
// 572 다: ?at=가 있으면 내 사이보그가 있는 맵이어도 그곳을 보고, 구석 [내 사이보그]로 돌아간다. 2차맵 사이 이동(WP9): 내 사이보그가 가는 중이면
// 한 줄(2차맵 몇 번째·도착 예상), 내 사이보그를 따라 연 화면이면 옆 2차맵으로 넘어갈 때 짧은 안내 뒤 그 2차맵으로 바꾼다(D-139), 아니면 [따라가기].
// [임시] 앱 화면 흐름(홈·아래 탭)이 따로 설계되는 중이다. 그때 이 화면을 "지도" 탭으로 옮긴다: onClose·monitor만 받는다.
// 자료는 서버에서 온다(mapFeed.ts, ADR 2026-10-28-s1-second-map "전송"). 연결·시계 차이는 앱의 연결 하나를 함께 쓴다(serverLink).
// 고빈도 상태(유닛 위치)는 엔진 안 타입 배열에 있고, 이 화면은 1초마다 요약(stats)만 읽는다(PLAN 5.7).
// 이동 명령은 관리자만 보낸다. 보기 전용이면 안내만 하고 보내지 않는다(서버도 명령마다 확인한다).
// 픽셀 비율 재기: 주소에 ?pixel-ratio=<1~4>를 붙이면 엔진 상한을 바꾼다(시험용, pixelRatioParam.ts). HUD에 쓰는 값·그리기 버퍼가 보인다.
// 낮밤(secondMapSky.ts): 1차맵과 같은 서버 시계·달력으로 이 2차맵 자리의 빛을 바꾼다. 동작 줄이기면 연 시각에 멈춘다(바뀌면 setSky).
// 시험·사진 주소: ?second-map-time=<0~24> 지역 시각에 멈춤, ?second-map-sky=off 낮밤 끔. HUD에 지역 시각·항성·달 줄이 보인다.
// 경계 너머 보기(ADR 2026-10-31-second-map-from-planet WP-4): 카메라가 경계에 다가오면 이웃 2차맵 지형을 받아 둘레에 그린다
// (secondMapNeighbourLoader.ts). ?second-map-neighbours=all이면 처음부터 8장(개발자 3×3 이어 보기). 나침반은 그 2차맵의 북쪽을 가리킨다
// (2차맵은 면 격자 틀이라 북쪽이 2차맵마다 돌아가 있다, 사용자 결정 U1).
// 탐사한 곳이 없으면(유닛 없는 계정, S3 시야 안개) 온통 어두운 까닭을 알리고, dev·admin에게는 [시험 일꾼 받기]·[전체 보기]와
// 개발자 2차맵 시험(/dev/second-map)을 가리킨다.
import {
  type EngineStats,
  type EngineStatus,
  type SecondMapEngine,
  createSecondMapEngine,
  secondMapPlace,
  utcMsForLocalHour,
} from "@terra/engine";
import { useEffect, useRef, useState } from "react";
import { refreshSession, useSession } from "../auth/session.ts";
import { offerBuildPick, pendingBuildPick } from "../economy/buildPick.ts";
import { hasDevTools, isAdmin } from "../auth/sessionState.ts";
import { serverLink } from "../net/serverLink.ts";
import { navigate } from "../shell/routerStore.ts";
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
import { resultText } from "./mapMessages.ts";
import { formatPixelRatio, pixelRatioOption } from "./pixelRatioParam.ts";
import { createSkyClock, reducedMotionList } from "./planetSky.ts";
import { compassAngle, northOnMap } from "./secondMapCompass.ts";
import { createNeighbourLoader } from "./secondMapNeighbourLoader.ts";
import { viewMap, wantsAllNeighbours } from "./secondMapNeighbours.ts";
import { formatLocalTime, readSecondMapSkyParams, secondMapSkyMode } from "./secondMapSky.ts";
import { fetchTerrain } from "./terrainLoader.ts";
import type { MapFocus } from "./mapTarget.ts";
import { MapTargetGate } from "./MapTargetGate.tsx";
import { screenNotice } from "./secondMapNotice.ts";
import { CrossingNotice, CyborgActions, TravelLine } from "./SecondMapTravel.tsx";
import { useTravelFollow } from "./useCyborgTravel.ts";
import "./map.css";

/** 성능 보고에 붙이는 화면 이름 */
const TELEMETRY_VIEW = "second-map";
/** 엔진·자료의 유닛 상한(엔진 기본값과 같다). 넘는 유닛은 그리지 않고 HUD 값(data-dropped)으로 센다 */
const UNIT_CAPACITY = 2_048;
/** 명령 안내를 지우기까지(ms) */
const COMMAND_NOTICE_MS = 6_000;
/** 내 사이보그에 카메라를 맞출 때 지형이 섰는지 보는 간격(ms) */
const FOCUS_POLL_MS = 100;

interface SecondaryMapScreenProps {
  onClose: () => void;
  /** 앱의 프레임 측정기 — 화면 전체 프레임 시간(엔진 그리기 포함) */
  monitor: FrameMonitor;
  /** 주소 ?key= 2차맵 키(없으면 내 사이보그가 있는 맵) */
  mapKey?: string | undefined;
  /** 주소 ?at= 1차맵에서 고른 배치 칸(내 사이보그가 없는 맵의 카메라) */
  at?: string | undefined;
}

/** 열 맵을 정한 뒤(MapTargetGate) 그 맵을 그린다. 맵이 바뀌면 화면을 새로 만든다 */
export default function SecondaryMapScreen({ mapKey, at, ...props }: SecondaryMapScreenProps) {
  return (
    <MapTargetGate keyParam={mapKey} atParam={at} onClose={props.onClose}>
      {(target) => (
        <SecondMapView
          key={target.mapKey}
          {...props}
          mapKey={target.mapKey}
          focus={target.focus}
          cyborg={target.cyborg}
        />
      )}
    </MapTargetGate>
  );
}

interface SecondMapViewProps {
  onClose: () => void;
  monitor: FrameMonitor;
  mapKey: number;
  /** 카메라를 맞출 곳(1차맵에서 고른 곳·내 사이보그·도시 시청, 없으면 맵 가운데) */
  focus: MapFocus | null;
  /** 이 맵에 내 사이보그가 있으면 그 자리([내 사이보그] 단추·가는 중 줄) */
  cyborg: MapFocus | null;
}

/** 아래 판의 명령 안내 */
type CommandNotice =
  | { kind: "view_only" }
  | { kind: "offline" }
  | { kind: "sent"; unitId: number }
  | { kind: "result"; report: CommandReport };

interface HudSnapshot {
  stats: EngineStats;
  feed: FeedStats;
  camera: string;
  selectedAt: string;
  /** 카메라 목표점이 있는 2차맵(지금 "0,0", 이웃이면 방향) */
  viewMap: string;
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

/** 개발 시험 명령 한 번에 받는 시험 일꾼 수 */
const DEV_SPAWN_COUNT = 5;

function SecondMapView({ onClose, monitor, mapKey, focus, cyborg }: SecondMapViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const engineRef = useRef<SecondMapEngine | null>(null);
  const needleRef = useRef<HTMLSpanElement>(null);
  const feedRef = useRef<MapFeed | null>(null);
  const selectedRef = useRef<number | null>(null);
  const session = useSession();
  const admin = isAdmin(session);
  const devTools = hasDevTools(session);
  const adminRef = useRef(admin);
  // 관리자 전체 보기(시야로 거르지 않음, dev·admin). 바꾸면 다시 구독한다(S3 시야 전송)
  const [observe, setObserve] = useState(false);
  const observeRef = useRef(false);
  const [devNotice, setDevNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ kind: "loading" });
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(INITIAL_FEED_STATUS);
  const [selected, setSelected] = useState<number | null>(null);
  const [command, setCommand] = useState<CommandNotice | null>(null);
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  const perf = usePerfStats(monitor);
  // 2차맵 사이 이동(WP9): 내 사이보그가 가는 중인 길. 내 사이보그를 따라 연 화면이면 넘어갈 때 따라간다(D-139)
  const following = focus?.source === "cyborg";
  const { going, crossedTo } = useTravelFollow(cyborg?.unitId ?? null, mapKey, following);

  useEffect(() => {
    adminRef.current = admin;
  }, [admin]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    // 서버 시계 = 기기 시계 + 앱 연결이 잰 차이(다시 잴 때까지 앞의 값)
    const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();
    // 낮밤: 그 2차맵 자리(위도·경도)의 지역 시각. 하늘 시계는 시계를 재기 전엔 null(엔진은 낮으로 그린다)
    const skyParams = readSecondMapSkyParams(window.location.search);
    const place = secondMapPlace(mapKey);
    const skyClock = createSkyClock(serverLink);
    const reduced = reducedMotionList();
    const north = place ? northOnMap(place) : null;
    // 경계 너머 보기: 지금 2차맵 지형을 받으면 그 판 표지로 이웃을 받는다
    let mapSizeM = 0;
    let viewMapNow = "0,0";
    const neighbourLoader = createNeighbourLoader({
      mapKey,
      all: wantsAllNeighbours(window.location.search),
      setNeighbours: (list) => engineRef.current?.setNeighbours(list) ?? Promise.resolve(),
      fetchTerrain: (url) => fetchTerrain(url),
    });
    const skyMode = () =>
      secondMapSkyMode(skyParams, skyClock, {
        reducedMotion: reduced?.matches ?? false,
        utcForHour: (hour) => (place ? utcMsForLocalHour(place.lonDeg, hour) : null),
      });
    const engine = createSecondMapEngine(host, {
      serverNow,
      unitCapacity: UNIT_CAPACITY,
      mapKey,
      sky: skyMode(),
      ...pixelRatioOption(window.location.search),
      onStatus: setStatus,
      // 카메라가 바뀐 프레임마다: 나침반 바늘(DOM을 바로 돌린다, React 상태를 바꾸지 않는다), 이웃 받기
      onView: (camera) => {
        const needle = needleRef.current;
        if (needle && north)
          needle.style.transform = `rotate(${compassAngle(north, camera.yaw).toFixed(4)}rad)`;
        if (mapSizeM > 0) {
          neighbourLoader.onView(camera.targetX, camera.targetZ);
          viewMapNow = viewMap(camera.targetX, camera.targetZ, mapSizeM);
        }
      },
      onSelect: (id) => {
        selectedRef.current = id;
        setSelected(id);
      },
      // 고른 유닛이 있으면 누른 칸으로 보낸다(관리자만). 경로는 서버가 찾아 unit_paths로 보낸다
      onGroundTap: (cell) => {
        // 경제 화면 [지도에서 고르기](WP3 연결점, economy/buildPick.ts): 짓기 자리를 고르는 중이면 그 칸을 돌려주고 생산 칸으로 돌아간다
        if (offerBuildPick(mapKey, cell)) {
          navigate({ route: "economy_production" });
          return;
        }
        const unitId = selectedRef.current;
        const current = feedRef.current;
        if (unitId === null || !current) return;
        const attempt = current.moveUnit(unitId, cell);
        setCommand(attempt.kind === "sent" ? { kind: "sent", unitId } : { kind: attempt.kind });
      },
    });
    engineRef.current = engine;
    const onReducedMotion = (): void => engine.setSky(skyMode());
    reduced?.addEventListener("change", onReducedMotion);
    setTelemetryView(TELEMETRY_VIEW);
    const feed = startMapFeed({
      link: serverLink,
      mapKey,
      sink: engine,
      loadTerrain: async (url) => {
        const terrain = await fetchTerrain(url);
        mapSizeM = terrain.cellSizeM * 128;
        neighbourLoader.setMain(url, mapSizeM);
        return terrain;
      },
      canCommand: () => adminRef.current,
      observe: () => observeRef.current,
      onDevSpawn: (outcome) =>
        setDevNotice(
          outcome.ok ? m.map_vision_spawned() : `${m.map_vision_spawn_failed()} ${resultText(outcome.code)}`,
        ),
      now: () => performance.now(),
      serverNow,
      unitCapacity: UNIT_CAPACITY,
      onStatus: setFeedStatus,
      onCommand: (report) => setCommand({ kind: "result", report }),
    });
    feedRef.current = feed;

    // 카메라를 맞춘다(D-6017·515): 지형이 서면 한 번. 내 사이보그면 유닛을 받았을 때 그 지금 자리, 아니면 알려 준 칸
    const focusTimer = focus
      ? setInterval(() => {
          if (engine.stats().terrainBuildMs === null) return;
          const unit = focus.unitId === null ? null : engine.unitState(focus.unitId);
          engine.setView({ x: unit?.x ?? focus.cellX + 0.5, y: unit?.y ?? focus.cellY + 0.5 });
          clearInterval(focusTimer);
        }, FOCUS_POLL_MS)
      : undefined;

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
        viewMap: viewMapNow,
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      clearInterval(focusTimer);
      neighbourLoader.stop();
      reduced?.removeEventListener("change", onReducedMotion);
      // 해제를 먼저 보내고(엔진을 버린 뒤에는 자료를 넣지 않는다) 엔진을 버린다
      feed.stop();
      feedRef.current = null;
      engine.dispose();
      engineRef.current = null;
      setTelemetryView(null);
    };
    // 맵·카메라 대상은 화면 열쇠(맵 키)와 함께 정해진다(바뀌면 화면을 새로 만든다)
  }, [mapKey, focus]);

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

  // 시험 일꾼 안내도 잠시 보이고 지운다
  useEffect(() => {
    if (devNotice === null) return () => undefined;
    const timer = setTimeout(() => setDevNotice(null), COMMAND_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [devNotice]);

  const toggleObserve = (): void => {
    const next = !observeRef.current;
    observeRef.current = next;
    setObserve(next);
    feedRef.current?.refresh();
  };

  const spawnWorkers = (): void => {
    if (!feedRef.current?.devSpawn(DEV_SPAWN_COUNT)) setDevNotice(m.map_vision_spawn_failed());
  };

  /** [내 사이보그]: 카메라를 내 사이보그의 지금 자리로(엔진이 유닛을 모르면 들어올 때의 칸) */
  const goToCyborg = (): void => {
    const engine = engineRef.current;
    if (!engine || !cyborg) return;
    const unit = cyborg.unitId === null ? null : engine.unitState(cyborg.unitId);
    engine.setView({ x: unit?.x ?? cyborg.cellX + 0.5, y: unit?.y ?? cyborg.cellY + 0.5 });
  };

  const deselect = (): void => {
    selectedRef.current = null;
    setSelected(null);
    setCommand(null);
    engineRef.current?.select(null);
  };

  const notice = screenNotice(status, feedStatus);
  const stats = snapshot?.stats ?? null;
  const light = stats?.light ?? null;
  const feed = snapshot?.feed ?? null;
  // 탐사한 곳이 하나도 없으면(유닛 없는 계정) 안개로 온통 어둡다: 까닭과 할 일을 알린다(전체 보기면 안개가 없다)
  const dark = !notice && !observe && feed?.explored === 0;
  const hint =
    pendingBuildPick() !== null
      ? m.map_build_pick_hint()
      : selected === null
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
      data-pixel-ratio={stats?.pixelRatio}
      data-buffer={stats ? `${stats.drawingBufferWidth}x${stats.drawingBufferHeight}` : undefined}
      data-frames={stats?.renderedFrames}
      data-engine-p95={stats?.renderP95Ms.toFixed(2)}
      data-units={stats?.units}
      data-moving={stats?.movingUnits}
      data-drawn-units={stats?.drawnUnits}
      data-terrain-ms={stats?.terrainBuildMs?.toFixed(0)}
      data-terrain-source={stats?.terrainSource ?? undefined}
      data-rev={feed?.rev ?? undefined}
      data-explored={feed?.explored ?? undefined}
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
      data-light-clock={light?.clock}
      data-light-day={light ? fixed(light.day, 3) : undefined}
      data-light-source={light?.source}
      data-light-flat={light ? fixed(light.flat, 3) : undefined}
      data-light-hour={light?.localHours == null ? undefined : fixed(light.localHours, 2)}
      data-sun-elevation={light?.sunElevationDeg == null ? undefined : fixed(light.sunElevationDeg, 1)}
      data-moon-elevation={light?.moonElevationDeg == null ? undefined : fixed(light.moonElevationDeg, 1)}
      data-light-changes={light?.changes}
      data-neighbours={stats?.neighbours}
      data-props={stats?.props}
      data-view-map={snapshot?.viewMap}
      data-map-key={mapKey}
      data-focus={focus?.unitId ?? undefined}
      data-focus-source={focus?.source}
      data-focus-at={focus ? `${focus.cellX},${focus.cellY}` : undefined}
      data-cyborg={cyborg?.unitId ?? undefined}
      data-travel={going ? `${going.leg + 1}/${going.route.length}` : undefined}
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
          {/* 나침반: 바늘(북 글자 쪽)이 이 2차맵의 북쪽을 가리킨다(카메라를 돌리면 함께 돈다) */}
          <span className="map-compass" role="img" aria-label={m.map_compass_label()}>
            <span className="map-compass-needle" ref={needleRef}>
              <span className="map-compass-north" aria-hidden="true">
                {m.map_compass_north()}
              </span>
            </span>
          </span>
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
      </header>
      {notice ? (
        <div className="map-panel map-notice" role={notice.tone}>
          {notice.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {notice.retry || notice.planet ? (
            <div className="map-notice-actions">
              {notice.planet ? (
                <button
                  type="button"
                  className="button-small button-primary map-open-planet"
                  onClick={() =>
                    navigate({ route: "map_planet", search: { key: String(mapKey) } }, { replace: true })
                  }
                >
                  {m.map_open_planet_here()}
                </button>
              ) : null}
              {notice.retry ? (
                <button type="button" className="button-small" onClick={() => feedRef.current?.retry()}>
                  {m.retry()}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {dark ? (
        <div className="map-panel map-notice map-dark" role="status">
          <p>{m.map_dark_explain()}</p>
          {devTools ? (
            <>
              <p>{m.map_dark_dev({ spawn: m.map_vision_spawn(), observe: m.map_vision_observe() })}</p>
              <button
                type="button"
                className="button-small map-dark-lab"
                onClick={() => navigate({ route: "dev_second_map" })}
              >
                {m.map_dark_open_lab()}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <CrossingNotice show={crossedTo !== null && following} />
      <footer className="map-hud map-hud-bottom">
        <div className="map-panel map-hint" role="status">
          <p>{hint}</p>
          {command ? <p className="map-command">{commandText(command)}</p> : null}
          <TravelLine going={going} />
        </div>
        <CyborgActions onGoToCyborg={cyborg ? goToCyborg : null} followTo={following ? null : crossedTo} />
        {selected === null ? null : (
          <div className="map-actions">
            <button type="button" className="button-small" onClick={deselect}>
              {m.map_deselect()}
            </button>
          </div>
        )}
        {devTools ? (
          <div className="map-actions" data-observe={observe ? "on" : "off"}>
            {devNotice ? (
              <p className="map-panel map-command" role="status">
                {devNotice}
              </p>
            ) : null}
            <button type="button" className="button-small map-dev-spawn" onClick={spawnWorkers}>
              {m.map_vision_spawn()}
            </button>
            <button
              type="button"
              className="button-small map-dev-observe"
              aria-pressed={observe}
              onClick={toggleObserve}
            >
              {m.map_vision_observe()}
            </button>
          </div>
        ) : null}
      </footer>
    </section>
  );
}
