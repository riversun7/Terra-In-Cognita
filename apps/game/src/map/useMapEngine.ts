// 2차맵 화면의 엔진 — 화면에 하나 만들어 2차맵을 넘어도 계속 쓴다(로딩 없는 2차맵 이동, docs/adr/2026-11-08-seamless-second-map.md WP-3).
// SecondaryMapScreen.tsx에서 나눴다. 엔진 콜백(누르기·카메라·확대)·낮밤·처음 카메라 맞추기·1초 요약(HUD 표지)을 맡는다. 2차맵에 묶인 자료(구독·덧그림·
// 이웃)는 mapSession.ts가 맵마다 켠다. 지금 2차맵은 mapKeyRef로 읽는다(넘으면 바뀐다).
import {
  type EngineStats,
  type EngineStatus,
  type SecondMapEngine,
  createSecondMapEngine,
  secondMapPlace,
  utcMsForLocalHour,
} from "@terra/engine";
import type { MapUnit } from "@terra/shared/mapUnits";
import { type Dispatch, type RefObject, type SetStateAction, useEffect } from "react";
import { offerBuildPick } from "../economy/buildPick.ts";
import { serverLink } from "../net/serverLink.ts";
import { navigate } from "../shell/routerStore.ts";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { heldMoving } from "./anchorUnit.ts";
import type { CommandNotice, SelectionState } from "./commandNotice.ts";
import type { FeedStats, MapFeed } from "./feedTypes.ts";
import type { GatherState } from "./gather/gatherState.ts";
import type { MapSession } from "./mapSession.ts";
import type { MapFocus } from "./mapTarget.ts";
import { canCommand, tapCommandOf, unitName } from "./mapUnits.ts";
import { attachMapProbe, wantsMapProbe } from "./mapProbe.ts";
import { createNeighbourTravel } from "./neighbourTravel.ts";
import { pixelRatioOption } from "./pixelRatioParam.ts";
import { createSkyClock, reducedMotionList } from "./planetSky.ts";
import { compassAngle, northOnMap } from "./secondMapCompass.ts";
import { readSecondMapSkyParams, secondMapSkyMode } from "./secondMapSky.ts";

/** 성능 보고에 붙이는 화면 이름 */
const TELEMETRY_VIEW = "second-map";
/** 엔진·자료의 유닛 상한(엔진 기본값과 같다). 넘는 유닛은 그리지 않고 HUD 값(data-dropped)으로 센다 */
export const UNIT_CAPACITY = 2_048;
/** 내 사이보그에 카메라를 맞출 때 지형이 섰는지 보는 간격(ms) */
const FOCUS_POLL_MS = 100;
/** 서버 시계 = 기기 시계 + 앱 연결이 잰 차이(다시 잴 때까지 앞의 값) */
export const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

/**
 * 들어올 때 카메라 거리 = 가장 가까운 거리 × 이 값(1 = 최대 확대). 화면을 열 때만 쓴다(처음 열기·1차맵에서 돌아오기 — 엔진을 새로 만든다).
 * 걸어서 옆 2차맵으로 넘을 때는 확대를 그대로 둔다(사용자 지적 2026-11-11 "다음 맵으로 이동시 확대배율이 유지되게")
 */
const ENTRY_ZOOM = 1;

/** 이 2차맵 자리를 가운데로 1차맵 5단계를 연다(바꾸기: 뒤로 = 지도를 떠남, MapSwitch와 같다) */
export function openPlanetStage(mapKey: number): void {
  navigate({ route: "map_planet", search: { key: String(mapKey), stage: "5" } }, { replace: true });
}

/** 1초 요약(HUD·화면 시험 표지) */
export interface HudSnapshot {
  stats: EngineStats;
  feed: FeedStats;
  camera: string;
  selectedAt: string;
  /** 카메라 목표점이 있는 2차맵(지금 "0,0", 이웃이면 방향) */
  viewMap: string;
}

export interface MapEngineRefs {
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly engineRef: RefObject<SecondMapEngine | null>;
  readonly needleRef: RefObject<HTMLSpanElement | null>;
  readonly mapKeyRef: RefObject<number>;
  readonly sessionRef: RefObject<MapSession | null>;
  /** 지도에서 유닛을 눌렀다. false면 고르지 않았다(남의 유닛 정보 판 — 엔진 고른 표시 그대로) */
  readonly selectFromMapRef: RefObject<(id: number | null) => boolean>;
  readonly selectedRef: RefObject<number | null>;
  readonly anchorRef: RefObject<number | null>;
  readonly feedRef: RefObject<MapFeed | null>;
  readonly unitsRef: RefObject<readonly MapUnit[] | null>;
  readonly operatorRef: RefObject<boolean>;
}

export interface MapEngineSetters {
  readonly setZoomStage: Dispatch<SetStateAction<number>>;
  readonly setStatus: Dispatch<SetStateAction<EngineStatus>>;
  readonly setCommand: Dispatch<SetStateAction<CommandNotice | null>>;
  readonly setSelected: Dispatch<SetStateAction<number | null>>;
  readonly setSelection: Dispatch<SetStateAction<SelectionState>>;
  readonly setLiveMoving: Dispatch<SetStateAction<ReadonlySet<number>>>;
  readonly setSnapshot: Dispatch<SetStateAction<HudSnapshot | null>>;
}

/**
 * 엔진을 만들고 화면을 닫을 때 버린다. focus = 처음 카메라 대상, refollow = 기준 유닛 다시 따라가기(늘 같은 함수),
 * closePeek = 남의 유닛 정보 판 닫기(늘 같은 함수 — 땅을 누르면 닫고 같은 누르기를 그대로 처리한다)
 */
export function useMapEngine(
  refs: MapEngineRefs,
  setters: MapEngineSetters,
  options: {
    readonly focus: MapFocus | null;
    readonly gather: GatherState;
    readonly refollow: () => void;
    readonly closePeek: () => void;
  },
): void {
  const {
    hostRef,
    engineRef,
    needleRef,
    mapKeyRef,
    sessionRef,
    selectFromMapRef,
    selectedRef,
    anchorRef,
    feedRef,
    unitsRef,
    operatorRef,
  } = refs;
  const { setZoomStage, setStatus, setCommand, setSelected, setSelection, setLiveMoving, setSnapshot } =
    setters;
  const { focus, gather, refollow, closePeek } = options;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    // 낮밤: 그 2차맵 자리(위도·경도)의 지역 시각. 하늘 시계는 시계를 재기 전엔 null(엔진은 낮으로 그린다)
    const skyParams = readSecondMapSkyParams(window.location.search);
    const skyClock = createSkyClock(serverLink);
    const reduced = reducedMotionList();
    const skyMode = () => {
      const place = secondMapPlace(mapKeyRef.current);
      return secondMapSkyMode(skyParams, skyClock, {
        reducedMotion: reduced?.matches ?? false,
        utcForHour: (hour) => (place ? utcMsForLocalHour(place.lonDeg, hour) : null),
      });
    };
    // 나침반 북쪽: 2차맵마다 다르다(면 격자 틀) — 지금 2차맵 것을 한 번 셈해 둔다
    let northKey = -1;
    let north: { x: number; z: number } | null = null;
    const northNow = (): { x: number; z: number } | null => {
      if (northKey !== mapKeyRef.current) {
        northKey = mapKeyRef.current;
        const place = secondMapPlace(northKey);
        north = place ? northOnMap(place) : null;
      }
      return north;
    };
    let lastMovingKey = "";
    // 고른 유닛이 마지막으로 움직이던 때([멈추기] 깜빡임 막기 — anchorUnit.ts heldMoving)
    let movingUnit: number | null = null;
    let lastMovingAt: number | null = null;
    const engine = createSecondMapEngine(host, {
      serverNow,
      // 가장 멀리에서 한 번 더 줄이면 1차맵 5단계(D-6018)
      onZoomEdge: (edge) => {
        if (edge === "out") openPlanetStage(mapKeyRef.current);
      },
      onZoomStage: setZoomStage,
      // 들어오면 늘 가장 가까이(최대 확대, 사다리 5/5 — 사용자 지적 2026-11-09 "2차맵이나 1차맵은 진입시 항상 최대 확대 상태로 시작").
      // 가장 가까운 거리는 보기 범위(카메라 묶기)가 바뀌어도 5단계라 단계 표시가 4로 내려가지 않는다. 옆 2차맵으로 걸어 넘을 때는 그대로 둔다
      initialZoom: ENTRY_ZOOM,
      onFollowBreak: refollow,
      unitCapacity: UNIT_CAPACITY,
      // 낮밤 빛의 자리(처음 2차맵 — 옆 2차맵은 거의 같은 위도·경도다. 넘어도 빛을 다시 잡지 않는다: 넘는 순간 밝기가 바뀌지 않게)
      mapKey: mapKeyRef.current,
      sky: skyMode(),
      ...pixelRatioOption(window.location.search),
      onStatus: setStatus,
      // 카메라가 바뀐 프레임마다: 나침반 바늘(DOM을 바로 돌린다, React 상태를 바꾸지 않는다), 이웃 받기
      onView: (camera) => {
        const needle = needleRef.current;
        const northDir = northNow();
        if (needle && northDir)
          needle.style.transform = `rotate(${compassAngle(northDir, camera.yaw).toFixed(4)}rad)`;
        sessionRef.current?.onView(camera);
      },
      onSelect: (id) => selectFromMapRef.current(id),
      // 내 유닛만 넉넉한 반경으로 고른다. 남의 유닛은 몸 위를 눌렀을 때만 — 빗나간 누르기는 땅 누르기(이동)다
      // (docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-10)": 최대 확대에서 걷는 휴먼 둘레 땅을 눌러도 유닛이 걸려 이동이 어려웠다)
      wideUnitTap: (id) =>
        feedRef.current?.isOwn(id) === true || unitsRef.current?.some((unit) => unit.unitId === id) === true,
      // 아무것도 없는 곳(하늘 등)을 눌러도 작은 창은 닫힌다
      onTapMiss: closePeek,
      // 그려 둔 옆 2차맵 땅: 고른 내 유닛을 그곳으로 보낸다(2차맵 사이 이동)
      onNeighbourTap: (() => {
        const travel = createNeighbourTravel({
          mapKeyRef,
          selectedRef,
          anchorRef,
          feedRef,
          unitsRef,
          operatorRef,
          setCommand,
          markTarget: (cell) => engineRef.current?.setMoveTarget(cell),
          // 보낸 옆 2차맵은 바로 받아 둔다(지형·흐름)
          prefetch: (key) => sessionRef.current?.prefetch(key),
        });
        return (cell: { x: number; y: number }): void => {
          closePeek();
          travel(cell);
        };
      })(),
      // 고른 유닛이 내 유닛(운영자 모드면 아무 유닛)이면 누른 칸으로 보낸다. 경로는 서버가 찾아 unit_paths로 보낸다
      onGroundTap: (cell) => {
        // 남의 유닛 작은 창은 땅을 누르면 닫힌다 — 같은 누르기가 아래대로 명령 유닛을 보낸다(사용자 지적 2026-11-09 "다른곳을 눌러 저절로 닫히게")
        closePeek();
        // 경제 화면 [지도에서 고르기](WP3 연결점, economy/buildPick.ts): 짓기 자리를 고르는 중이면 그 칸을 돌려주고 생산 칸으로 돌아간다
        if (offerBuildPick(mapKeyRef.current, cell)) {
          navigate({ route: "economy_production" });
          return;
        }
        // 채집(gather/): 둘레 오브젝트·건물을 누르면 아래 작은 판(채집·들어가기·정보)을 연다
        if (gather.tapCell(cell)) return;
        // 보낼 유닛: 고른 유닛 — 남의 유닛이 골라져 있으면 무시하고 기준 유닛(내 유닛)을 보낸다(사용자 지적 2026-11-10, mapUnits.ts tapCommandOf)
        const current = feedRef.current;
        if (!current) return;
        const target = tapCommandOf({
          selected: selectedRef.current,
          anchor: anchorRef.current,
          operator: operatorRef.current,
          units: unitsRef.current,
          isOwn: (id) => current.isOwn(id),
        });
        if (!target) return;
        const { unitId, control, mine } = target;
        if (control.kind === "hold") {
          setCommand({ kind: "hold", hold: control.hold, label: mine ? unitName(mine) : String(unitId) });
          return;
        }
        if (!canCommand(control)) {
          setCommand({ kind: "view_only" });
          return;
        }
        const attempt = current.moveUnit(unitId, cell);
        // 누른 자리에 목적지 고리를 바로 둔다(경로가 오면 그 경로를 따라 점선, 거절되면 몇 초 뒤 엔진이 거둔다)
        if (attempt.kind === "sent") engineRef.current?.setMoveTarget(cell);
        setCommand(
          attempt.kind === "sent" ? { kind: "sent", unitId, action: "move" } : { kind: attempt.kind },
        );
      },
    });
    engineRef.current = engine;
    refollow();
    // [시험용] ?map-probe=1: 프레임마다 유닛 수·확대·기준 유닛 화면 자리를 적는다(넘는 순간 재기, mapProbe.ts)
    const detachProbe = wantsMapProbe(window.location.search)
      ? attachMapProbe(engine, { mapKey: () => mapKeyRef.current, anchor: () => anchorRef.current })
      : null;
    const onReducedMotion = (): void => engine.setSky(skyMode());
    reduced?.addEventListener("change", onReducedMotion);
    setTelemetryView(TELEMETRY_VIEW);

    // 카메라를 맞춘다(D-6017·515): 지형이 서면 한 번. 내 사이보그면 유닛을 받았을 때 그 지금 자리, 아니면 알려 준 칸.
    // 기준 유닛을 따라가는 중이면 옮기지 않는다(WP-1 — 운영자 자유 시점·기준 유닛이 아직 없을 때만)
    const focusTimer = focus
      ? setInterval(() => {
          if (engine.stats().terrainBuildMs === null) return;
          if (engine.stats().following !== null) {
            clearInterval(focusTimer);
            return;
          }
          const unit = focus.unitId === null ? null : engine.unitState(focus.unitId);
          engine.setView({ x: unit?.x ?? focus.cellX + 0.5, y: unit?.y ?? focus.cellY + 0.5 });
          clearInterval(focusTimer);
        }, FOCUS_POLL_MS)
      : undefined;

    // 1초마다 요약만 읽는다. 카메라·고른 유닛 위치는 화면 시험(Playwright)이 결과를 확인하는 데 쓴다(data-*)
    const timer = setInterval(() => {
      const feed = feedRef.current;
      if (!feed) return;
      const camera = engine.camera();
      // 고른 유닛이 새 스냅샷에서 사라졌으면 화면도 맞춘다(엔진은 목록을 바꾸면 고르기를 푼다). 고른 것이 없으면 기준 유닛을 고른다(WP-1)
      let id = engine.selected();
      const anchorNow = anchorRef.current;
      if (id === null && anchorNow !== null && engine.unitState(anchorNow)) {
        engine.select(anchorNow);
        id = anchorNow;
      }
      if (id !== selectedRef.current) {
        selectedRef.current = id;
        setSelected(id);
      }
      const unit = id === null ? null : engine.unitState(id);
      const own = id !== null && feed.isOwn(id);
      const now = Date.now();
      if (id !== movingUnit) {
        movingUnit = id;
        lastMovingAt = null;
      }
      if (unit?.moving === true) lastMovingAt = now;
      const moving = heldMoving(unit?.moving ?? false, lastMovingAt, now);
      setSelection((previous) =>
        previous.own === own && previous.moving === moving ? previous : { own, moving },
      );
      // 내 유닛 목록의 "이동 중"은 엔진의 지금 값(바뀔 때만 상태를 바꾼다)
      const list = unitsRef.current ?? [];
      const movingIds = list
        .filter((row) => engine.unitState(row.unitId)?.moving === true)
        .map((row) => row.unitId);
      const movingKey = movingIds.join(",");
      if (movingKey !== lastMovingKey) {
        lastMovingKey = movingKey;
        setLiveMoving(new Set(movingIds));
      }
      setSnapshot({
        stats: engine.stats(),
        feed: feed.stats(),
        camera: [camera.targetX, camera.targetZ, camera.yaw, camera.pitch, camera.distance]
          .map((value) => value.toFixed(3))
          .join(","),
        selectedAt: unit ? `${unit.x.toFixed(2)},${unit.y.toFixed(2)}` : "",
        viewMap: sessionRef.current?.viewMap() ?? "0,0",
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      clearInterval(focusTimer);
      reduced?.removeEventListener("change", onReducedMotion);
      detachProbe?.();
      // 모음(자료 구독)이 해제를 먼저 보낸다(아래 효과의 정리가 이 정리보다 뒤라 여기서 멈춘다 — 엔진을 버린 뒤에는 자료를 넣지 않는다)
      sessionRef.current?.stop();
      sessionRef.current = null;
      feedRef.current = null;
      engine.dispose();
      engineRef.current = null;
      setTelemetryView(null);
    };
    // 엔진은 화면에 하나다(처음 카메라 대상 focus와 함께). 채집 상태·ref·콜백(closePeek 포함)은 늘 같은 객체다
  }, [
    focus,
    gather,
    refollow,
    closePeek,
    hostRef,
    engineRef,
    needleRef,
    mapKeyRef,
    sessionRef,
    selectFromMapRef,
    selectedRef,
    anchorRef,
    feedRef,
    unitsRef,
    operatorRef,
    setZoomStage,
    setStatus,
    setCommand,
    setSelected,
    setSelection,
    setLiveMoving,
    setSnapshot,
  ]);
}
