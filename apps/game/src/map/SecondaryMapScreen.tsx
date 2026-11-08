// 2차맵 화면(S1) — 서버의 2차맵을 구독해 지형·건물·유닛을 그린다. 지연 로딩 조각 하나로만 들어온다(App.tsx의 React.lazy).
// 열 맵(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1 D-6017): 주소 ?key=, 없으면 내 사이보그가 있는 맵(MapTargetGate.tsx),
// 카메라는 지형이 서면 내 사이보그 자리에 맞춘다. 내 사이보그가 없는 맵이면 1차맵에서 고른 곳(?at=) 또는 그 2차맵 도시 시청(WP7, 515).
// 서버가 띄우지 않은 맵(unknown_map)·볼 수 없는 맵(not_visible)이면 다시 묻지 않고 까닭과 [1차맵에서 보기](1차맵 명령 흐름으로, 513)를 보인다.
// 572 다: ?at=가 있으면 내 사이보그가 있는 맵이어도 그곳을 보고, 구석 [내 사이보그]로 돌아간다. 2차맵 사이 이동(WP9): 내 사이보그가 가는 중이면
// 한 줄(2차맵 몇 번째·도착 예상), 내 사이보그를 따라 연 화면이면 옆 2차맵으로 넘어갈 때 짧은 안내 뒤 그 2차맵으로 바꾼다(D-139), 아니면 [따라가기].
// [임시] 앱 화면 흐름(홈·아래 탭)이 따로 설계되는 중이다. 그때 이 화면을 "지도" 탭으로 옮긴다: onClose·monitor만 받는다.
// 자료는 서버에서 온다(mapFeed.ts, ADR 2026-10-28-s1-second-map "전송"). 연결·시계 차이는 앱의 연결 하나를 함께 쓴다(serverLink).
// 고빈도 상태(유닛 위치)는 엔진 안 타입 배열에 있고, 이 화면은 1초마다 요약(stats)만 읽는다(PLAN 5.7).
// 유닛 조종(docs/adr/2026-11-07-unit-control.md): 플레이어는 내 유닛만 고르고 명령한다 — 내 유닛 목록(사이보그 먼저, UnitControlPanels.tsx)에서
// 고르면 카메라가 그 자리로 가고, 땅을 누르면 이동, [멈추기]는 세운다. 남의 유닛은 눌러도 정보만 보인다(보내지 않는다). dev·admin은
// [운영자 모드]를 켜면 아무 유닛이나 명령하고 안개 없이(전체 보기) 2차맵 어디든 본다(위 판에 "운영자"). 서버도 명령마다 소유·권한을 본다.
// 옆 2차맵으로(WP14, EdgeTravel.tsx): 고른 내 유닛(없으면 내 사이보그)을 변 너머 옆 2차맵으로 보낸다(서버 2차맵 사이 이동).
// 기획 답 630~637(ADR "바뀜"): 플레이어 카메라는 내 유닛·건물 둘레로 묶고(useCameraArea), 운영자 모드는 이 기기에서 기억한다(operatorMode.ts),
// 목록은 유닛 화면 차례 + 다른 곳 내 유닛 수, 남의 유닛은 시야 안이면 세력·종류(useUnitGlance).
// 픽셀 비율 재기: 주소에 ?pixel-ratio=<1~4>를 붙이면 엔진 상한을 바꾼다(시험용, pixelRatioParam.ts). HUD에 쓰는 값·그리기 버퍼가 보인다.
// 낮밤(secondMapSky.ts): 1차맵과 같은 서버 시계·달력으로 이 2차맵 자리의 빛을 바꾼다. 동작 줄이기면 연 시각에 멈춘다(바뀌면 setSky).
// 시험·사진 주소: ?second-map-time=<0~24> 지역 시각에 멈춤, ?second-map-sky=off 낮밤 끔. HUD에 지역 시각·항성·달 줄이 보인다.
// 경계 너머 보기(ADR 2026-10-31-second-map-from-planet WP-4): 카메라가 경계에 다가오면 이웃 2차맵 지형을 받아 둘레에 그린다
// (secondMapNeighbourLoader.ts). ?second-map-neighbours=all이면 처음부터 8장(개발자 3×3 이어 보기). 나침반은 그 2차맵의 북쪽을 가리킨다
// (2차맵은 면 격자 틀이라 북쪽이 2차맵마다 돌아가 있다, 사용자 결정 U1).
// 탐사한 곳이 없으면(유닛 없는 계정, S3 시야 안개) 온통 어두운 까닭을 알리고, dev·admin에게는 [시험 일꾼 받기]·[운영자 모드]와
// 개발자 2차맵 시험(/dev/second-map)을 가리킨다.
// 확대 단계(ADR 2026-11-07-planet-view 1·2절): 오른쪽 사다리(ZoomLadder, "2차맵 3/5") [+]·[−]. 가장 멀리에서 [−]나 한 번 더 줄이기
// (휠·두 손가락) = 이 2차맵 자리의 1차맵 5단계(D-6018, /map/planet?key=&stage=5).
// 지도 조작(사용자 지적 2026-11-08, docs/adr/2026-11-08-map-input.md): 채집 표시는 누르기를 지나보내 끌기가 걸리지 않고(엔진이 누르기만 화면 거리로
// 고른다), 사다리는 2차맵 확대 단계 1~5(엔진 onZoomStage).
// 자유 시점 없애기(docs/adr/2026-11-08-seamless-second-map.md WP-1): 카메라는 늘 기준 유닛(anchorUnit.ts — 고른 내 유닛, 기본 내 사이보그)을
// 따라가고 한 손가락 끌기는 돌리기다(UnitFollow.tsx). 늘 유닛 하나가 골라져 있다. 이 맵에 내 유닛이 없으면 들어갈 수 없다(안내 + [1차맵에서 보기]).
// 운영자 모드에서만 [자유 시점](빨간 운영자 단추)으로 따라가기를 끄고 끌어서 옮긴다.
// 근처 판(WP-2, nearby/): 자원·건물·유닛 탭, 기준 유닛에서 가까운 차례 20개씩. 지도에는 고른 탭 표시만(닫으면 없음). 옛 [내 유닛 N] 목록은 유닛 탭이다.
// NPC 국가 지도자("WP-NPC3", 기획 정리 748 나·742 나): 머리 위 이름표(leaderTags.ts — 전송의 표시 종류), 지도자나 이름표를 누르면 그 지도자를
// 고르고 아래 지도자 판(government/LeaderSheet.tsx) → 그 나라 수도 정부 판.
import {
  type EngineStats,
  type EngineStatus,
  type SecondMapEngine,
  createSecondMapEngine,
  secondMapPlace,
  utcMsForLocalHour,
} from "@terra/engine";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { refreshSession, useSession } from "../auth/session.ts";
import { offerBuildPick, pendingBuildPick } from "../economy/buildPick.ts";
import { hasDevTools } from "../auth/sessionState.ts";
import { serverLink } from "../net/serverLink.ts";
import { navigate } from "../shell/routerStore.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { type FeedStats, type FeedStatus, INITIAL_FEED_STATUS, type MapFeed } from "./feedTypes.ts";
import { startMapFeed } from "./mapFeed.ts";
import { resultText } from "./mapMessages.ts";
import { pixelRatioOption } from "./pixelRatioParam.ts";
import { createSkyClock, reducedMotionList } from "./planetSky.ts";
import { compassAngle, northOnMap } from "./secondMapCompass.ts";
import { createNeighbourLoader } from "./secondMapNeighbourLoader.ts";
import { startNeighbourVision } from "./neighbourVision.ts";
import { viewMap, wantsAllNeighbours } from "./secondMapNeighbours.ts";
import { readSecondMapSkyParams, secondMapSkyMode } from "./secondMapSky.ts";
import { MapPerfPanel } from "./MapPerfPanel.tsx";
import { fetchTerrain } from "./terrainLoader.ts";
import type { MapFocus } from "./mapTarget.ts";
import { MapTargetGate } from "./MapTargetGate.tsx";
import { screenNotice } from "./secondMapNotice.ts";
import { CrossingNotice, CyborgActions, TravelLine } from "./SecondMapTravel.tsx";
import { EdgeTravel } from "./EdgeTravel.tsx";
import { edgeUnitOf } from "./edgeTravelData.ts";
import { ZoomLadder } from "./ZoomLadder.tsx";
import { useAnchorFollow } from "./UnitFollow.tsx";
import { blockedWithoutUnits, chooseAnchor } from "./anchorUnit.ts";
import { useTravelFollow } from "./useCyborgTravel.ts";
import type { MapUnit } from "@terra/shared/mapUnits";
import {
  type CommandNotice,
  NO_SELECTION,
  type SelectionState,
  commandState,
  commandText,
  wideScreen,
} from "./commandNotice.ts";
import { canCommand, loadUnitGlance, selectionText, unitControlOf, unitName } from "./mapUnits.ts";
import { attachLeaderTags, createLeaderTagState } from "./leaderTags.ts";
import { useOperatorMode } from "./operatorMode.ts";
import { useCameraArea } from "./useCameraArea.ts";
import { useMapUnits } from "./useMapUnits.ts";
import { useUnitGlance } from "./useUnitGlance.ts";
import { OperatorActions, OperatorBadge, SelectedActions } from "./UnitControlPanels.tsx";
import { NearbyPanel, type NearbySources, NearbyToggle } from "./nearby/NearbyPanel.tsx";
import { createNearbyState } from "./nearby/nearbyState.ts";
import { GatherPanel } from "./gather/GatherPanel.tsx";
import { attachGatherOverlay } from "./gather/gatherOverlay.ts";
import { createGatherState, gatherSink } from "./gather/gatherState.ts";
import { GovernmentSheet } from "../government/GovernmentSheet.tsx";
import { LeaderSheet } from "../government/LeaderSheet.tsx";
import { startBuildingLooks } from "./buildingLooks.ts";
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
/** 이 2차맵 자리를 가운데로 1차맵 5단계를 연다(바꾸기: 뒤로 = 지도를 떠남, MapSwitch와 같다) */
function openPlanetStage(mapKey: number): void {
  navigate({ route: "map_planet", search: { key: String(mapKey), stage: "5" } }, { replace: true });
}

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

interface HudSnapshot {
  stats: EngineStats;
  feed: FeedStats;
  camera: string;
  selectedAt: string;
  /** 카메라 목표점이 있는 2차맵(지금 "0,0", 이웃이면 방향) */
  viewMap: string;
}

const fixed = (value: number, digits: number): string => value.toFixed(digits);

/** 자료 흐름 전(표시 종류 없음) */
const NO_KINDS: ReadonlyMap<number, string> = new Map();

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
  const devTools = hasDevTools(session);
  // 운영자 모드(dev·admin): 모든 유닛 명령 + 전체 보기(시야로 거르지 않음 — 안개 없이 어디든). 바꾸면 다시 구독한다(S3 시야 전송), 기억한다(631 다)
  const {
    operator,
    operatorRef,
    toggle: toggleOperator,
  } = useOperatorMode(devTools, () => feedRef.current?.refresh());
  // 내 유닛 목록(서버, 5초마다) — 엔진 콜백은 ref로 읽는다. 플레이어 카메라는 내 유닛·건물 둘레(630)
  const myUnits = useMapUnits(mapKey);
  const cameraTap = useCameraArea(engineRef, operator, myUnits.units, myUnits.view);
  const unitsRef = useRef<readonly MapUnit[] | null>(null);
  // 근처 판(덧그림과 같이 보는 상태, React 밖). 넓은 화면은 유닛 탭을 펼친 채 연다(옛 내 유닛 목록처럼)
  const [nearby] = useState(() =>
    createNearbyState(wideScreen() ? { tab: "units", expanded: true } : { tab: null, expanded: false }),
  );
  const nearbyTab = useSyncExternalStore(
    (listener) => nearby.subscribe(listener),
    () => nearby.tab,
  );
  const [liveMoving, setLiveMoving] = useState<ReadonlySet<number>>(() => new Set());
  const [selection, setSelection] = useState<SelectionState>(NO_SELECTION);
  const [devNotice, setDevNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<EngineStatus>({ kind: "loading" });
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(INITIAL_FEED_STATUS);
  const [selected, setSelected] = useState<number | null>(null);
  const [command, setCommand] = useState<CommandNotice | null>(null);
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  const perf = usePerfStats(monitor);
  // 기준 유닛(카메라가 따라가는 유닛, WP-1): 마지막으로 고른 유닛과 운영자 자유 시점
  const [lastPicked, setLastPicked] = useState<number | null>(null);
  const [freeView, setFreeView] = useState(false);
  // 2차맵 사이 이동(WP9): 내 사이보그가 가는 중인 길. 기준 유닛이 내 사이보그면(기본) 넘어갈 때 따라간다(D-139)
  const following = cyborg?.unitId != null && (lastPicked ?? cyborg.unitId) === cyborg.unitId;
  const { going, crossedTo } = useTravelFollow(cyborg?.unitId ?? null, mapKey, following);
  // 원자재 오브젝트 채집·건물 들어가기(docs/adr/2026-11-07-gather-objects.md): 덧그림과 아래 판이 같이 보는 상태(React 밖)
  const [gather] = useState(createGatherState);
  // NPC 국가 지도자 이름표(덧그림)와 지도자 판이 같이 보는 상태("WP-NPC3")
  const [leaderTags] = useState(createLeaderTagState);
  // 고른 유닛 따라가기(내 유닛·운영자 모드)와 2차맵 확대 단계(사다리, 엔진이 바뀔 때 알린다)
  const [zoomStage, setZoomStage] = useState(0);
  const selectedMine =
    selected === null ? undefined : myUnits.units?.find((unit) => unit.unitId === selected);
  const anchor = chooseAnchor({
    operator,
    freeView,
    selected,
    selectedFollowable:
      selected !== null &&
      unitControlOf({ operator, mine: selectedMine, ownByFeed: selection.own }).kind !== "other",
    lastPicked,
    units: myUnits.units,
    cyborgUnitId: cyborg?.unitId ?? null,
  });
  const { refollow, anchorRef } = useAnchorFollow(engineRef, anchor);
  useEffect(() => {
    nearby.setAnchor(anchor);
  }, [nearby, anchor]);
  // 근처 판이 읽는 엔진·자료(늘 같은 객체 — 부를 때 ref를 읽는다)
  const [nearbySources] = useState<NearbySources>(() => ({
    anchorAt: () => {
      const id = anchorRef.current;
      const unit = id === null ? null : (engineRef.current?.unitState(id) ?? null);
      return unit ? { x: unit.x, y: unit.y } : null;
    },
    unitAt: (id) => {
      const unit = engineRef.current?.unitState(id) ?? null;
      return unit ? { x: unit.x, y: unit.y } : null;
    },
    visibleUnits: () => feedRef.current?.unitIds() ?? [],
    serverNow: () => Date.now() + serverLink.clockOffsetMs(),
  }));
  // 늘 유닛 하나가 골라져 있다: 고른 것이 없으면 기준 유닛을 고른다(화면 상태는 1초 요약이 엔진에서 읽는다)
  useEffect(() => {
    if (selected !== null || anchor === null) return;
    selectedRef.current = anchor;
    engineRef.current?.select(anchor);
  }, [selected, anchor]);

  useEffect(() => {
    unitsRef.current = myUnits.units;
  }, [myUnits.units]);

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
    // 이웃 안개(WP-3): 카메라 쪽 이웃 2차맵을 구독해 탐사 칸을 이웃 지형에 칠한다(운영자 전체 보기면 구독하지 않는다 — 안개가 없다)
    const neighbourVision = startNeighbourVision({
      link: serverLink,
      onExplored: (key, bits) => engineRef.current?.setNeighbourExplored(String(key), bits),
    });
    const neighbourLoader = createNeighbourLoader({
      mapKey,
      all: wantsAllNeighbours(window.location.search),
      setNeighbours: (list) => engineRef.current?.setNeighbours(list) ?? Promise.resolve(),
      fetchTerrain: (url) => fetchTerrain(url),
      onNear: (keys) => neighbourVision.want(operatorRef.current ? [] : keys),
    });
    const skyMode = () =>
      secondMapSkyMode(skyParams, skyClock, {
        reducedMotion: reduced?.matches ?? false,
        utcForHour: (hour) => (place ? utcMsForLocalHour(place.lonDeg, hour) : null),
      });
    let lastMovingKey = "";
    // 고른 유닛의 지금 상태(엔진·자료가 아직 없으면 없음으로)
    const selectionOf = (id: number | null): SelectionState => {
      if (id === null) return NO_SELECTION;
      return {
        own: feedRef.current?.isOwn(id) ?? false,
        moving: engineRef.current?.unitState(id)?.moving ?? false,
      };
    };
    // 지도에서 누른 유닛 — 유닛을 누를 때와 지도자 이름표를 누를 때 같다. 다룰 수 있는 유닛이면 기준 유닛이 된다(chooseAnchor)
    const selectFromMap = (id: number | null): void => {
      if (id !== null && (operatorRef.current || feedRef.current?.isOwn(id) === true)) setLastPicked(id);
      selectedRef.current = id;
      setSelected(id);
      setSelection(selectionOf(id));
    };
    const engine = createSecondMapEngine(host, {
      serverNow,
      // 가장 멀리에서 한 번 더 줄이면 1차맵 5단계(D-6018)
      onZoomEdge: (edge) => {
        if (edge === "out") openPlanetStage(mapKey);
      },
      onZoomStage: setZoomStage,
      onFollowBreak: refollow,
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
      onSelect: selectFromMap,
      // 고른 유닛이 내 유닛(운영자 모드면 아무 유닛)이면 누른 칸으로 보낸다. 경로는 서버가 찾아 unit_paths로 보낸다
      onGroundTap: (cell) => {
        // 경제 화면 [지도에서 고르기](WP3 연결점, economy/buildPick.ts): 짓기 자리를 고르는 중이면 그 칸을 돌려주고 생산 칸으로 돌아간다
        if (offerBuildPick(mapKey, cell)) {
          navigate({ route: "economy_production" });
          return;
        }
        // 채집(gather/): 둘레 오브젝트·건물을 누르면 아래 작은 판(채집·들어가기·정보)을 연다
        if (gather.tapCell(cell)) return;
        const unitId = selectedRef.current ?? anchorRef.current;
        const current = feedRef.current;
        if (unitId === null || !current) return;
        const mine = unitsRef.current?.find((unit) => unit.unitId === unitId);
        const control = unitControlOf({
          operator: operatorRef.current,
          mine,
          ownByFeed: current.isOwn(unitId),
        });
        if (control.kind === "hold") {
          setCommand({ kind: "hold", hold: control.hold, label: mine ? unitName(mine) : String(unitId) });
          return;
        }
        if (!canCommand(control)) {
          setCommand({ kind: "view_only" });
          return;
        }
        const attempt = current.moveUnit(unitId, cell);
        setCommand(
          attempt.kind === "sent" ? { kind: "sent", unitId, action: "move" } : { kind: attempt.kind },
        );
      },
    });
    engineRef.current = engine;
    refollow();
    // 지도자 이름표: 전송의 표시 종류(npc_leader)로 찾고 이름은 한눈 정보로. 누르면 그 지도자를 고른다. 채집 덧그림보다 먼저 붙인다
    // (누르기를 먼저 받고 위에 그린다 — 지도자는 적고 표시는 많다)
    const detachLeaders = attachLeaderTags(engine, host, leaderTags, {
      mapKey,
      kinds: () => feedRef.current?.unitKinds() ?? NO_KINDS,
      loadGlance: (key, unitId, signal) =>
        loadUnitGlance(key, unitId, signal).then((answer) => answer.glance),
      onPick: (unitId) => {
        engine.select(unitId);
        selectFromMap(unitId);
      },
    });
    const detachGather = attachGatherOverlay(engine, host, gather, { mapKey, serverNow, nearby });
    const looks = startBuildingLooks(engine, mapKey, { onLooks: (rows) => nearby.setLooks(rows) });
    const onReducedMotion = (): void => engine.setSky(skyMode());
    reduced?.addEventListener("change", onReducedMotion);
    setTelemetryView(TELEMETRY_VIEW);
    const feed = startMapFeed({
      link: serverLink,
      mapKey,
      // 자료 흐름: 채집 덧그림(건물) → 카메라 범위(탐사 비트) → 건물 겉모습(buildingLooks.ts) → 엔진
      sink: cameraTap.current(gatherSink(looks.sink, gather)),
      loadTerrain: async (url) => {
        const terrain = await fetchTerrain(url);
        mapSizeM = terrain.cellSizeM * 128;
        // 배치 칸 한 변(m) = 2차맵 한 변 ÷ 256(근처 판 거리 글자)
        nearby.setCellM(mapSizeM / 256);
        neighbourLoader.setMain(url, mapSizeM);
        return terrain;
      },
      canCommand: () => operatorRef.current,
      observe: () => operatorRef.current,
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
      const moving = unit?.moving ?? false;
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
        viewMap: viewMapNow,
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      clearInterval(focusTimer);
      neighbourLoader.stop();
      neighbourVision.stop();
      reduced?.removeEventListener("change", onReducedMotion);
      // 해제를 먼저 보내고(엔진을 버린 뒤에는 자료를 넣지 않는다) 엔진을 버린다
      feed.stop();
      feedRef.current = null;
      detachGather();
      detachLeaders();
      looks.stop();
      engine.dispose();
      engineRef.current = null;
      setTelemetryView(null);
    };
    // 맵·카메라 대상은 화면 열쇠(맵 키)와 함께 정해진다(바뀌면 화면을 새로 만든다). 채집 상태와 두 ref는 늘 같은 객체다
  }, [mapKey, focus, gather, nearby, leaderTags, operatorRef, cameraTap, refollow, anchorRef]);

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

  /** 목록에서 고르기: 그 유닛을 고르고 카메라가 따라간다(엔진이 아직 모르는 유닛이면 목록의 칸으로). 좁은 화면이면 목록을 접어 땅을 누를 수 있게 한다 */
  const pickUnit = (unit: MapUnit): void => {
    const engine = engineRef.current;
    selectedRef.current = unit.unitId;
    setSelected(unit.unitId);
    setCommand(null);
    engine?.select(unit.unitId);
    const state = engine?.unitState(unit.unitId) ?? null;
    setLastPicked(unit.unitId);
    if (!state) engine?.setView({ x: unit.cellX + 0.5, y: unit.cellY + 0.5 });
    setSelection({ own: true, moving: state?.moving ?? unit.moving });
    if (!wideScreen()) nearby.setExpanded(false);
  };

  /** 근처 판의 다른 유닛 줄: 그 유닛을 고른다(정보만 — 카메라는 기준 유닛에 그대로) */
  const inspectUnit = (unitId: number): void => {
    const engine = engineRef.current;
    selectedRef.current = unitId;
    setSelected(unitId);
    setCommand(null);
    engine?.select(unitId);
    setSelection({
      own: feedRef.current?.isOwn(unitId) ?? false,
      moving: engine?.unitState(unitId)?.moving ?? false,
    });
    if (!wideScreen()) nearby.setExpanded(false);
  };

  /** [멈추기]: 고른 유닛을 지금 자리에 세운다(stop_unit) */
  const stopSelected = (): void => {
    const unitId = selectedRef.current;
    const current = feedRef.current;
    if (unitId === null || !current) return;
    const attempt = current.stopUnit(unitId);
    setCommand(attempt.kind === "sent" ? { kind: "sent", unitId, action: "stop" } : { kind: attempt.kind });
  };

  const spawnWorkers = (): void => {
    if (!feedRef.current?.devSpawn(DEV_SPAWN_COUNT)) setDevNotice(m.map_vision_spawn_failed());
  };

  /** [내 사이보그]: 내 사이보그를 고른다(기준 유닛 — 카메라가 따라간다). 엔진이 아직 모르면 들어올 때의 칸으로 한 번 옮긴다 */
  const goToCyborg = (): void => {
    const engine = engineRef.current;
    if (!engine || !cyborg || cyborg.unitId === null) return;
    selectedRef.current = cyborg.unitId;
    setSelected(cyborg.unitId);
    setLastPicked(cyborg.unitId);
    engine.select(cyborg.unitId);
    if (!engine.unitState(cyborg.unitId)) engine.setView({ x: cyborg.cellX + 0.5, y: cyborg.cellY + 0.5 });
  };

  /** [내 유닛으로]: 남의 유닛을 살펴보다가 기준 유닛 고르기로 돌아간다(늘 유닛 하나가 골라져 있다) */
  const backToAnchor = (): void => {
    const id = anchorRef.current;
    selectedRef.current = id;
    setSelected(id);
    setSelection(NO_SELECTION);
    setCommand(null);
    engineRef.current?.select(id);
  };

  /** 운영자 모드를 끄면 자유 시점도 끈다(자유 시점은 운영자만) */
  const toggleOperatorMode = (): void => {
    if (operator) setFreeView(false);
    toggleOperator();
  };

  const notice = screenNotice(status, feedStatus);
  const stats = snapshot?.stats ?? null;
  const light = stats?.light ?? null;
  const feed = snapshot?.feed ?? null;

  // 이 맵에 내 유닛이 없으면 들어갈 수 없다(WP-1 Q3 — 카메라가 따라갈 유닛이 없다). 운영자 모드는 들어간다
  const blocked = !notice && blockedWithoutUnits({ operator, units: myUnits.units });
  // 탐사한 곳이 하나도 없으면(유닛 없는 계정) 안개로 온통 어둡다: 까닭과 할 일을 알린다(전체 보기면 안개가 없다, 들어갈 수 없으면 그 안내만)
  const dark = !notice && !operator && !blocked && feed?.explored === 0;
  // 고른 유닛(늘 하나 — 엔진이 아직 고르기 전이면 기준 유닛)
  const shown = selected ?? anchor;
  // 고른 유닛을 어떻게 다루나(운영자·내 유닛·못 함·남의 유닛) — 목록의 줄 또는 시야 전송의 내 유닛 표시로
  const mine = shown === null ? undefined : myUnits.units?.find((unit) => unit.unitId === shown);
  const control =
    shown === null ? null : unitControlOf({ operator, mine, ownByFeed: shown === anchor || selection.own });
  const glance = useUnitGlance(mapKey, shown, control?.kind === "other");
  const hint =
    pendingBuildPick() !== null
      ? m.map_build_pick_hint()
      : shown === null || control === null
        ? m.map_hint()
        : selectionText(
            control,
            mine ? unitName(mine) : m.map_unit_number({ id: shown }),
            shown,
            selection.moving,
            glance,
          );

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
      data-selected={selected ?? undefined}
      data-control={control?.kind}
      data-follow={anchor !== null ? "on" : undefined}
      data-anchor={anchor ?? undefined}
      data-free-view={operator && freeView ? "on" : undefined}
      data-blocked={blocked ? "no-units" : undefined}
      data-operator={operator ? "on" : "off"}
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
          {operator ? <OperatorBadge /> : null}
          {/* 나침반: 바늘(북 글자 쪽)이 이 2차맵의 북쪽을 가리킨다(카메라를 돌리면 함께 돈다) */}
          <span className="map-compass" role="img" aria-label={m.map_compass_label()}>
            <span className="map-compass-needle" ref={needleRef}>
              <span className="map-compass-north" aria-hidden="true">
                {m.map_compass_north()}
              </span>
            </span>
          </span>
        </div>
        <ZoomLadder
          rung={{ kind: "local", stage: zoomStage }}
          onZoomIn={() => engineRef.current?.zoomStep(1)}
          onZoomOut={() => {
            if (engineRef.current && !engineRef.current.zoomStep(-1)) openPlanetStage(mapKey);
          }}
        />
        <MapPerfPanel perf={perf} stats={stats} feed={feed} />
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
      {blocked ? (
        <div className="map-panel map-notice map-blocked" role="status">
          <p>{m.map_blocked_no_units()}</p>
          <div className="map-notice-actions">
            <button
              type="button"
              className="button-small button-primary map-open-planet"
              onClick={() =>
                navigate({ route: "map_planet", search: { key: String(mapKey) } }, { replace: true })
              }
            >
              {m.map_open_planet_here()}
            </button>
          </div>
        </div>
      ) : null}
      {dark ? (
        <div className="map-panel map-notice map-dark" role="status">
          <p>{m.map_dark_explain()}</p>
          {devTools ? (
            <>
              <p>{m.map_dark_dev({ spawn: m.map_vision_spawn(), observe: m.map_operator_mode() })}</p>
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
        <NearbyPanel
          nearby={nearby}
          gather={gather}
          sources={nearbySources}
          myUnits={myUnits.units}
          unitsFailed={myUnits.failed}
          elsewhere={myUnits.elsewhere}
          moving={liveMoving}
          selected={shown}
          onPickUnit={pickUnit}
          onInspectUnit={inspectUnit}
        />
        <GatherPanel state={gather} mapKey={mapKey} selected={anchor} cyborgUnitId={cyborg?.unitId ?? null} />
        {/* 누른 건물이 행정 건물이면 정부 판(docs/adr/2026-11-07-play-flow.md "WP-NPC") */}
        <GovernmentSheet state={gather} />
        {/* 고른 유닛이 NPC 국가 지도자면 지도자 판 → 수도 정부 판("WP-NPC3") */}
        <LeaderSheet tags={leaderTags} selected={shown} mapKey={mapKey} />
        <div className="map-panel map-hint" role="status">
          <p>{hint}</p>
          {command ? <p className="map-command">{commandText(command)}</p> : null}
          <TravelLine going={going} />
        </div>
        <CyborgActions onGoToCyborg={cyborg ? goToCyborg : null} followTo={following ? null : crossedTo} />
        {/* 옆 2차맵으로(WP14): 고른 내 유닛(없으면 내 사이보그)을 변 너머 옆 2차맵으로 보낸다 */}
        <EdgeTravel
          mapKey={mapKey}
          unit={edgeUnitOf({ selected: anchor, units: myUnits.units, cyborgUnitId: cyborg?.unitId ?? null })}
          engineRef={engineRef}
          hostRef={hostRef}
          screenFollows={following ? (cyborg?.unitId ?? null) : null}
        />
        {nearbyTab === null ? (
          <div className="map-actions">
            <NearbyToggle nearby={nearby} />
          </div>
        ) : null}
        {shown === null ? null : (
          <SelectedActions
            onStop={control !== null && canCommand(control) && selection.moving ? stopSelected : null}
            onBack={shown !== anchor && anchor !== null ? backToAnchor : null}
          />
        )}
        {devTools ? (
          <OperatorActions
            operator={operator}
            notice={devNotice}
            freeView={freeView}
            onSpawn={spawnWorkers}
            onToggle={toggleOperatorMode}
            onFreeView={() => setFreeView((on) => !on)}
          />
        ) : null}
      </footer>
    </section>
  );
}
