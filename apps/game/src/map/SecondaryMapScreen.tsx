// 2차맵 화면(S1) — 서버의 2차맵을 구독해 지형·건물·유닛을 그린다. 지연 로딩 조각 하나로만 들어온다(App.tsx의 React.lazy).
// 열 맵(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1 D-6017): 주소 ?key=, 없으면 내 사이보그가 있는 맵(MapTargetGate.tsx).
// 서버가 띄우지 않은 맵(unknown_map)·볼 수 없는 맵(not_visible)이면 다시 묻지 않고 까닭과 [1차맵에서 보기](513). 내 사이보그가 가는 중이면 한 줄(WP9).
// [임시] 앱 화면 흐름(홈·아래 탭)이 따로 설계되는 중이다. 그때 이 화면을 "지도" 탭으로 옮긴다: onClose·monitor만 받는다.
// 자료는 서버에서 온다(mapFeed.ts, ADR 2026-10-28-s1-second-map "전송"). 연결·시계 차이는 앱의 연결 하나를 함께 쓴다(serverLink).
// 고빈도 상태(유닛 위치)는 엔진 안 타입 배열에 있고, 이 화면은 1초마다 요약(stats)만 읽는다(PLAN 5.7).
// 유닛 조종(docs/adr/2026-11-07-unit-control.md): 플레이어는 내 유닛만 명령한다(땅 = 이동, [멈추기]). 남의 유닛은 눌러도 정보만. dev·admin은
// [운영자 모드]로 아무 유닛이나 명령하고 안개 없이(전체 보기) 본다(위 판에 "운영자"). 서버도 명령마다 소유·권한을 본다.
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
// 로딩 없는 2차맵 이동(WP-3): 엔진은 화면에 하나(useMapEngine.ts), 자료 구독·덧그림·이웃은 맵마다(mapSession.ts). 기준 유닛이 구독 중인 이웃에
// 나타나면(또는 사이보그 길 조회가 넘었다고 하면) 엔진 rebase 뒤 모음만 바꾸고 주소를 고친다(crossRef). 이웃 안개는 그 이웃 구독의 탐사 칸.
// NPC 국가 지도자("WP-NPC3", 기획 정리 748 나·742 나): 머리 위 이름표(leaderTags.ts — 전송의 표시 종류), 지도자나 이름표를 누르면 그 지도자를
// 고르고 아래 지도자 판(government/LeaderSheet.tsx) → 그 나라 수도 정부 판.
import type { EngineStatus, PlanetSkyMode, SecondMapEngine, TerrainInput } from "@terra/engine";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { refreshSession, useSession } from "../auth/session.ts";
import { pendingBuildPick } from "../economy/buildPick.ts";
import { hasDevTools } from "../auth/sessionState.ts";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { usePerfStats } from "../perf/usePerfStats.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { type FeedStatus, INITIAL_FEED_STATUS, type MapFeed } from "./feedTypes.ts";
import { MapPerfPanel } from "./MapPerfPanel.tsx";
import { SecondMapNotices } from "./SecondMapNotices.tsx";
import { hudDataAttributes } from "./mapHudData.ts";
import type { MapFocus } from "./mapTarget.ts";
import { MapTargetGate } from "./MapTargetGate.tsx";
import { screenNotice } from "./secondMapNotice.ts";
import { CrossingNotice, CyborgActions, TravelLine } from "./SecondMapTravel.tsx";
import { EdgeTravel } from "./EdgeTravel.tsx";
import { edgeUnitOf } from "./edgeTravelData.ts";
import { ZoomLadder } from "./ZoomLadder.tsx";
import { useAnchorFollow } from "./UnitFollow.tsx";
import { blockedWithoutUnits, chooseAnchor } from "./anchorUnit.ts";
import { openMap, useTravelFollow } from "./useCyborgTravel.ts";
import { type MapSession, startMapSession } from "./mapSession.ts";
import { type HudSnapshot, UNIT_CAPACITY, openPlanetStage, serverNow, useMapEngine } from "./useMapEngine.ts";
import type { MapUnit } from "@terra/shared/mapUnits";
import {
  type CommandNotice,
  NO_SELECTION,
  type SelectionState,
  commandState,
  commandText,
  wideScreen,
} from "./commandNotice.ts";
import { canCommand, selectionText, unitControlOf, unitName } from "./mapUnits.ts";
import { createLeaderTagState } from "./leaderTags.ts";
import { useOperatorMode } from "./operatorMode.ts";
import { useCameraArea } from "./useCameraArea.ts";
import { NO_MAP_UNITS, useMapUnits } from "./useMapUnits.ts";
import { useUnitGlance } from "./useUnitGlance.ts";
import { OperatorActions, OperatorBadge, SelectedActions } from "./UnitControlPanels.tsx";
import { NearbyPanel, type NearbySources, NearbyToggle } from "./nearby/NearbyPanel.tsx";
import { createNearbyState } from "./nearby/nearbyState.ts";
import { GatherPanel } from "./gather/GatherPanel.tsx";
import { createGatherState } from "./gather/gatherState.ts";
import { GovernmentSheet } from "../government/GovernmentSheet.tsx";
import { LeaderSheet } from "../government/LeaderSheet.tsx";
import "./map.css";

/** 명령 안내를 지우기까지(ms) */
const COMMAND_NOTICE_MS = 6_000;

interface SecondaryMapScreenProps {
  onClose: () => void;
  /** 앱의 프레임 측정기 — 화면 전체 프레임 시간(엔진 그리기 포함) */
  monitor: FrameMonitor;
  /** 주소 ?key= 2차맵 키(없으면 내 사이보그가 있는 맵) */
  mapKey?: string | undefined;
  /** 주소 ?at= 1차맵에서 고른 배치 칸(내 사이보그가 없는 맵의 카메라) */
  at?: string | undefined;
}

/** 주소 값 묶음(맵·?at=) — 화면을 새로 만들지 정하는 열쇠 */
const entryOf = (mapKey: string | undefined, at: string | undefined): string => `${mapKey ?? ""}|${at ?? ""}`;

/**
 * 열 맵을 정한 뒤(MapTargetGate) 그 맵을 그린다. 주소(?key=·?at=)가 바뀌면 화면을 새로 만든다 — 다만 화면 안에서 옆 2차맵으로 넘어 주소를 바꾼
 * 것이면(로딩 없는 2차맵 이동, docs/adr/2026-11-08-seamless-second-map.md WP-3) 그대로 둔다(엔진·지형을 다시 만들지 않는다)
 */
export default function SecondaryMapScreen({ mapKey, at, ...props }: SecondaryMapScreenProps) {
  const [entry, setEntry] = useState(() => ({ key: entryOf(mapKey, at), mapKey, at }));
  // 화면 안에서 넘어 바꾼 주소(그 주소면 새로 만들지 않는다)
  const [inPlace, setInPlace] = useState<string | null>(null);
  const now = entryOf(mapKey, at);
  if (now !== entry.key && now !== inPlace) {
    // 다른 곳에서 주소를 바꿨다: 새로 연다(그리는 중 상태 맞추기 — 앞 그리기 값에서 정한다)
    setEntry({ key: now, mapKey, at });
    setInPlace(null);
  }
  const onSwitched = useCallback((next: number) => {
    setInPlace(entryOf(String(next), undefined));
    openMap(next);
  }, []);
  return (
    <MapTargetGate key={entry.key} keyParam={entry.mapKey} atParam={entry.at} onClose={props.onClose}>
      {(target) => (
        <SecondMapView
          key={target.mapKey}
          {...props}
          mapKey={target.mapKey}
          focus={target.focus}
          cyborg={target.cyborg}
          onSwitched={onSwitched}
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
  /** 화면 안에서 옆 2차맵으로 넘었다(주소를 그 맵으로 바꾼다 — 화면은 다시 만들지 않는다) */
  onSwitched: (mapKey: number) => void;
}

/** 개발 시험 명령 한 번에 받는 시험 일꾼 수 */
const DEV_SPAWN_COUNT = 5;

function SecondMapView({
  onClose,
  monitor,
  mapKey: entryKey,
  focus,
  cyborg,
  onSwitched,
}: SecondMapViewProps) {
  // 지금 2차맵(처음 = 들어온 맵). 옆 2차맵으로 넘으면 화면을 다시 만들지 않고 바꾼다(WP-3)
  const [mapKey, setMapKey] = useState(entryKey);
  const mapKeyRef = useRef(entryKey);
  const sessionRef = useRef<MapSession | null>(null);
  /** 넘을 때 다음 모음에 넘기는 지형 */
  const carryRef = useRef<ReadonlyMap<number, TerrainInput> | null>(null);
  const skyModeRef = useRef<(() => PlanetSkyMode) | null>(null);
  // 넘은 뒤 새 2차맵 자료가 다 오기 전까지는 "받는 중" 안내를 띄우지 않는다(지형·유닛은 이미 보인다)
  const [switching, setSwitching] = useState(false);
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
  // 지금 2차맵 답만 쓴다(넘은 직후 옛 2차맵 목록·범위가 새 틀에 걸리지 않게)
  const unitsAnswer = useMapUnits(mapKey);
  const myUnits = unitsAnswer.mapKey === mapKey ? unitsAnswer : NO_MAP_UNITS;
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
  // 원자재 오브젝트 채집·건물 들어가기(docs/adr/2026-11-07-gather-objects.md): 덧그림과 아래 판이 같이 보는 상태(React 밖)
  const [gather] = useState(createGatherState);
  // NPC 국가 지도자 이름표(덧그림)와 지도자 판이 같이 보는 상태("WP-NPC3")
  const [leaderTags] = useState(createLeaderTagState);
  // 고른 유닛 따라가기(내 유닛·운영자 모드)와 2차맵 확대 단계(사다리, 엔진이 바뀔 때 알린다)
  const [zoomStage, setZoomStage] = useState(0);
  // 지도에서 누른 유닛 — 유닛을 누를 때와 지도자 이름표를 누를 때 같다. 다룰 수 있는 유닛이면 기준 유닛이 된다(chooseAnchor). ref·상태 바꾸기만 쓴다
  const selectFromMapRef = useRef((id: number | null): void => {
    if (id !== null && (operatorRef.current || feedRef.current?.isOwn(id) === true)) setLastPicked(id);
    selectedRef.current = id;
    setSelected(id);
    setSelection(
      id === null
        ? NO_SELECTION
        : {
            own: feedRef.current?.isOwn(id) ?? false,
            moving: engineRef.current?.unitState(id)?.moving ?? false,
          },
    );
  });
  // 주소를 넘은 2차맵으로 바꾸는 바깥 함수(최신 값)
  const onSwitchedRef = useRef(onSwitched);
  useEffect(() => {
    onSwitchedRef.current = onSwitched;
  }, [onSwitched]);
  /**
   * 옆 2차맵으로 넘기(로딩 없는 2차맵 이동, WP-3): 엔진이 이웃 지형을 지금 2차맵으로 올리고(rebase) 앞 자료 모음을 멈춘 뒤 새 2차맵 모음을 켠다.
   * 이웃 지형이 아직 없으면(받지 않음) 주소를 바꿔 화면을 새로 연다(앞 방식)
   */
  const crossRef = useRef((next: number): void => {
    const engine = engineRef.current;
    const live = sessionRef.current;
    const from = mapKeyRef.current;
    if (!engine || next === from) return;
    const carried = live?.carry() ?? null;
    if (!engine.rebase(String(next), String(from))) {
      openMap(next);
      return;
    }
    // 앞 2차맵 자료는 곧바로 멈춘다(새 틀의 엔진에 옛 2차맵 유닛을 넣지 않게)
    live?.stop();
    sessionRef.current = null;
    feedRef.current = null;
    carryRef.current = carried;
    mapKeyRef.current = next;
    setSwitching(true);
    setMapKey(next);
    onSwitchedRef.current(next);
  });
  const crossTo = useCallback((next: number) => crossRef.current(next), []);
  const { going, crossedTo } = useTravelFollow(cyborg?.unitId ?? null, mapKey, following, crossTo);
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
    // selectedRef는 바꾸지 않는다: 1초 요약이 엔진 고르기와 견줘 화면 상태를 맞춘다(명령은 selectedRef ?? 기준 유닛)
    engineRef.current?.select(anchor);
  }, [selected, anchor]);

  useEffect(() => {
    unitsRef.current = myUnits.units;
  }, [myUnits.units]);

  // 엔진: 화면에 하나(2차맵을 넘어도 그대로 — useMapEngine.ts). 2차맵에 묶인 자료는 아래 모음 효과가 맵마다 켠다
  useMapEngine(
    {
      hostRef,
      engineRef,
      needleRef,
      mapKeyRef,
      skyModeRef,
      sessionRef,
      selectFromMapRef,
      selectedRef,
      anchorRef,
      feedRef,
      unitsRef,
      operatorRef,
    },
    { setZoomStage, setStatus, setCommand, setSelected, setSelection, setLiveMoving, setSnapshot },
    { focus, gather, refollow },
  );

  // 지금 2차맵의 자료 모음(mapSession.ts): 맵이 바뀌면(옆 2차맵으로 넘음) 앞 모음을 멈추고 새로 켠다
  useEffect(() => {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host) return () => undefined;
    mapKeyRef.current = mapKey;
    const seed = carryRef.current;
    carryRef.current = null;
    // 낮밤 시각은 그 2차맵 경도로(옆 2차맵이면 거의 같다)
    const skyMode = skyModeRef.current;
    if (skyMode) engine.setSky(skyMode());
    const mapSession = startMapSession({
      engine,
      host,
      mapKey,
      unitCapacity: UNIT_CAPACITY,
      gather,
      nearby,
      leaderTags,
      tap: (sink) => cameraTap.current(sink),
      operator: () => operatorRef.current,
      serverNow,
      seed,
      anchor: () => anchorRef.current,
      onArrived: (key) => crossRef.current(key),
      onPickLeader: (unitId) => selectFromMapRef.current(unitId),
      onStatus: setFeedStatus,
      onCommand: (report) => setCommand({ kind: "result", report }),
      onDevNotice: setDevNotice,
    });
    sessionRef.current = mapSession;
    feedRef.current = mapSession.feed;
    return () => {
      mapSession.stop();
      if (sessionRef.current === mapSession) {
        sessionRef.current = null;
        feedRef.current = null;
      }
    };
  }, [mapKey, gather, nearby, leaderTags, operatorRef, cameraTap, anchorRef]);

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

  // 옆 2차맵으로 넘은 뒤 새 자료가 다 올 때까지는 "받는 중" 안내를 띄우지 않는다(지형은 이웃에서 올린 것이 이미 보인다). 실패 안내는 그대로
  const settled = feedStatus.hasSnapshot && feedStatus.terrain.kind === "ready" && status.kind !== "loading";
  const rawNotice = screenNotice(status, feedStatus);
  const notice = switching && !settled && rawNotice?.tone === "status" ? null : rawNotice;
  const stats = snapshot?.stats ?? null;
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
      {...hudDataAttributes(stats, feed)}
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
      data-view-map={snapshot?.viewMap}
      data-map-key={mapKey}
      data-switched={switching ? "in-place" : undefined}
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
      <SecondMapNotices
        notice={notice}
        blocked={blocked}
        dark={dark}
        devTools={devTools}
        mapKey={mapKey}
        onRetry={() => feedRef.current?.retry()}
      />
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
          now={myUnits.at}
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
