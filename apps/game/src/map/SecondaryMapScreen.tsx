// 2차맵 화면(S1) — 서버의 2차맵을 구독해 지형·건물·유닛을 그린다. 지연 로딩 조각 하나로만 들어온다(App.tsx의 React.lazy).
// 열 맵(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름", 기획 60 §4.1 D-6017): 주소 ?key=, 없으면 내 사이보그가 있는 맵(MapTargetGate.tsx).
// 서버가 띄우지 않은 맵(unknown_map)·볼 수 없는 맵(not_visible)이면 다시 묻지 않고 까닭과 [1차맵에서 보기](513). 내 사이보그가 가는 중이면 한 줄(WP9).
// [임시] 앱 화면 흐름(홈·아래 탭)이 따로 설계되는 중이다. 그때 이 화면을 "지도" 탭으로 옮긴다: onClose·monitor만 받는다.
// 자료는 서버에서 온다(mapFeed.ts, ADR 2026-10-28-s1-second-map "전송"). 연결·시계 차이는 앱의 연결 하나를 함께 쓴다(serverLink).
// 고빈도 상태(유닛 위치)는 엔진 안 타입 배열에 있고, 이 화면은 1초마다 요약(stats)만 읽는다(PLAN 5.7).
// 유닛 조종(docs/adr/2026-11-07-unit-control.md): 플레이어는 내 유닛만 명령한다(땅 = 이동, [멈추기]). 남의 유닛을 누르면 고르지 않고 작은 창
// (PeekCard — 명령 유닛은 그대로, 다른 곳을 누르면 닫히고 땅이면 같은 누르기로 내 유닛이 간다, "바뀜 (2026-11-09)"). dev·admin은
// [운영자 모드]로 안개 없이(전체 보기) 보고, 남의 유닛은 작은 창의 [이 유닛 조종]으로만 명령 유닛으로 삼는다(누르기만으로는 바뀌지 않는다 —
// 사용자 지적 2026-11-10, "바뀜 (2026-11-10)"). 서버도 명령마다 소유·권한을 본다.
// 옆 2차맵으로는 걸어서 간다(사용자 지적 2026-11-09 "옆2차맵으로 이동 없애라 그냥 걸어가는거지"): 그려 둔 이웃 땅을 누르면 고른 내 유닛이 변까지
// 걸어가 넘는다(neighbourTravel.ts, WP-3). 옛 [옆 2차맵으로] 판(WP14 EdgeTravel)은 지웠다(docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)").
// 기획 답 630~637(ADR "바뀜"): 플레이어 카메라는 내 유닛·건물 둘레로 묶고(useCameraArea), 운영자 모드는 이 기기에서 기억한다(operatorMode.ts),
// 목록은 유닛 화면 차례 + 다른 곳 내 유닛 수, 남의 유닛은 시야 안이면 세력·종류(useUnitGlance).
// 픽셀 비율 재기: 주소에 ?pixel-ratio=<1~4>를 붙이면 엔진 상한을 바꾼다(시험용, pixelRatioParam.ts). HUD에 쓰는 값·그리기 버퍼가 보인다.
// 낮밤(secondMapSky.ts): 1차맵과 같은 서버 시계·달력으로 이 2차맵 자리의 빛을 바꾼다. 동작 줄이기면 연 시각에 멈춘다(바뀌면 setSky).
// 시험·사진 주소: ?second-map-time=<0~24> 지역 시각에 멈춤, ?second-map-sky=off 낮밤 끔. HUD에 지역 시각·항성·달 줄이 보인다.
// 경계 너머 보기(ADR 2026-10-31-second-map-from-planet WP-4): 카메라가 경계에 다가오면 이웃 2차맵 지형을 받아 둘레에 그린다
// (secondMapNeighbourLoader.ts). ?second-map-neighbours=all이면 처음부터 8장(개발자 3×3 이어 보기). 나침반은 그 2차맵의 북쪽을 가리킨다
// (2차맵은 면 격자 틀이라 북쪽이 2차맵마다 돌아가 있다, 사용자 결정 U1).
// 확대 단계(ADR 2026-11-07-planet-view 1·2절): 오른쪽 사다리(ZoomLadder, "2차맵 3/6") [+]·[−]. 가장 멀리에서 [−]나 한 번 더 줄이기
// (휠·두 손가락) = 이 2차맵 자리의 1차맵 5단계(D-6018, /map/planet?key=&stage=5).
// 지도 조작(사용자 지적 2026-11-08, docs/adr/2026-11-08-map-input.md): 채집 표시는 누르기를 지나보내 끌기가 걸리지 않고(엔진이 누르기만 화면 거리로
// 고른다), 사다리는 2차맵 확대 단계 1~6(엔진 onZoomStage, 962 나로 하나 더).
// 자유 시점 없애기(docs/adr/2026-11-08-seamless-second-map.md WP-1): 카메라는 늘 기준 유닛(anchorUnit.ts — 고른 내 유닛, 기본 내 사이보그)을
// 따라가고 한 손가락 끌기는 돌리기다(UnitFollow.tsx). 늘 유닛 하나가 골라져 있다. 이 맵에 내 유닛이 없으면 들어갈 수 없다(안내 + [1차맵에서 보기]).
// 운영자 모드에서만 [자유 시점](빨간 운영자 단추)으로 따라가기를 끄고 끌어서 옮긴다.
// 근처 판(WP-2, nearby/): 자원·건물·유닛 탭, 기준 유닛에서 가까운 차례 20개씩. 지도에는 고른 탭 표시만(닫으면 없음). 옛 [내 유닛 N] 목록은 유닛 탭이다.
// 로딩 없는 2차맵 이동(WP-3): 엔진과 자료 흐름 모음(mapFeedPool.ts)은 화면에 하나(useMapEngine.ts), 덧그림·이웃은 맵마다(mapSession.ts). 기준 유닛이
// 붙여 둔 이웃 흐름에 나타나면(또는 변 옆에서 사라지면, 사이보그 길 조회가 넘었다고 하면) 엔진 rebase 뒤 같은 작업 안에서 모음만 바꾸고 주소를
// 고친다(crossRef). 이웃 안개는 그 이웃 흐름의 탐사 칸. 걸어서 넘을 때 확대는 그대로다 — 6/6(최대 확대)은 화면을 열 때만("바뀜 (2026-11-11)").
// NPC 국가 지도자("WP-NPC3", 기획 정리 748 나·742 나): 머리 위 이름표(leaderTags.ts — 전송의 표시 종류), 지도자나 이름표를 누르면 그 지도자를
// 고르고 아래 지도자 판(government/LeaderSheet.tsx) → 그 나라 수도 정부 판.
// 사용자 지적 2026-11-09(docs/adr/2026-11-08-seamless-second-map.md "바뀜 3"): [내 사이보그] 자리에 [내 유닛 N] → 내 유닛 목록(사이보그가 첫 줄),
// 아래 판 자리에는 판 하나만(누른 건물·오브젝트 판 > 내 유닛 목록 > 근처 판, bottomSheetOf — 행정 건물의 정부 몫은 건물 판 안),
// 명령 유닛 하나(commandUnit)와 그 이름(unitLabel)을 안내 줄·건물 판이 함께 쓴다.
// 사용자 지적 2026-11-12(docs/adr/2026-10-29-app-shell.md "바뀜 (2026-11-12)"): 흩어진 단추를 정리했다 — 아래 탭(MapBottomNav: [1차맵]·[유닛]·[도시]·
// [주변])이 옛 오른쪽 위 [1차맵]·[내 유닛 N]·[근처]를 맡고, [도시]는 이 2차맵 도시·건물 목록 큰 판(city/CitySheet.tsx). 운영 단추([운영자 모드]·
// [자유 시점])와 성능 판 켜기는 머리의 [운영] 메뉴 하나(OperatorMenu.tsx, 운영진만). 지도 위 건물 표시는 누른 건물 하나만(gatherOverlay.ts).
import { type EngineStatus, LOCAL_ZOOM_STAGES, type SecondMapEngine } from "@terra/engine";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { refreshSession, useSession } from "../auth/session.ts";
import { pendingBuildPick } from "../economy/buildPick.ts";
import { hasDevTools, isStaff } from "../auth/sessionState.ts";
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
import { CyborgActions, TravelLine } from "./SecondMapTravel.tsx";
import { MapBottomNav, type MapNavTab } from "./MapBottomNav.tsx";
import { BagSheet } from "./BagSheet.tsx";
import { OperatorMenuButton, OperatorMenuPanel, PerfToggle, useOperatorMenu } from "./OperatorMenu.tsx";
import { CitySheet } from "./city/CitySheet.tsx";
import { useBuildingLook } from "./useBuildingLook.ts";
import { ZoomLadder } from "./ZoomLadder.tsx";
import { useAnchorFollow } from "./UnitFollow.tsx";
import { blockedWithoutUnits, chooseAnchor, commandUnit, showStop, unitTapOf } from "./anchorUnit.ts";
import { useBottomSheet } from "./useBottomSheet.ts";
import { openMap, useTravelFollow } from "./useCyborgTravel.ts";
import { type MapFeedPool, createMapFeedPool } from "./mapFeedPool.ts";
import { probeEvent } from "./mapProbe.ts";
import { type MapHandover, type MapSession, startMapSession } from "./mapSession.ts";
import { fetchTerrain } from "./terrainLoader.ts";
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
import { canCommand, selectionText, unitControlOf, unitLabel } from "./mapUnits.ts";
import { createLeaderTagState } from "./leaderTags.ts";
import { useOperatorMode } from "./operatorMode.ts";
import { useCameraArea } from "./useCameraArea.ts";
import { NO_MAP_UNITS, useMapUnits } from "./useMapUnits.ts";
import { useUnitGlance } from "./useUnitGlance.ts";
import {
  MyUnitsPanel,
  OperatorBadge,
  OperatorItems,
  PeekCard,
  SelectedActions,
} from "./UnitControlPanels.tsx";
import { BoatActions } from "./boats/BoatActions.tsx";
import { NearbyPanel, type NearbySources } from "./nearby/NearbyPanel.tsx";
import { createNearbyState } from "./nearby/nearbyState.ts";
import { GatherPanel } from "./gather/GatherPanel.tsx";
import { createGatherState } from "./gather/gatherState.ts";
import { GovernmentSheet } from "../government/GovernmentSheet.tsx";
import { LeaderSheet } from "../government/LeaderSheet.tsx";
import "./map.css";
import "./unitNames.css";

/** 명령 안내를 지우기까지(ms) */
const COMMAND_NOTICE_MS = 6_000;
/** 넘을 2차맵 지형이 아직 서지 않았을 때 기다리는 시간(ms). 넘으면 화면을 새로 연다(앞 방식) */
const CROSS_WAIT_MS = 4_000;

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
  /** 자료 흐름 모음(구독한 2차맵들 — 넘어도 그대로)과 지금 2차맵 모음을 켜는 함수(아래 효과가 넣는다) */
  const poolRef = useRef<MapFeedPool | null>(null);
  const startRef = useRef<((key: number, handover: MapHandover | null) => void) | null>(null);
  /** 지형을 기다리는 넘기(받아서 서면 다시 해 본다) */
  const pendingCrossRef = useRef<{ next: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  /** 마지막으로 화면 안에서 넘은 때(기기 시계 ms) — 그보다 먼저 물은 길 조회 답은 넘기 신호로 쓰지 않는다 */
  const crossedAtRef = useRef(0);
  // 넘은 뒤 새 2차맵 자료가 다 오기 전까지는 "받는 중" 안내를 띄우지 않는다(지형·유닛은 이미 보인다)
  const [switching, setSwitching] = useState(false);
  /** 떠나온 2차맵(넘은 직후 새 내 유닛 목록이 오기 전에 앞 목록을 이름·개수에 쓴다) */
  const [crossedFrom, setCrossedFrom] = useState<number | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const engineRef = useRef<SecondMapEngine | null>(null);
  const needleRef = useRef<HTMLSpanElement>(null);
  const feedRef = useRef<MapFeed | null>(null);
  const selectedRef = useRef<number | null>(null);
  const session = useSession();
  const devTools = hasDevTools(session);
  // 운영 메뉴(운영진 gm·admin·dev — 성능 판, 운영자 줄은 dev·admin만)
  const staff = isStaff(session);
  const opsMenu = useOperatorMenu();
  // 운영자 모드(dev·admin): 모든 유닛 명령 + 전체 보기(시야로 거르지 않음 — 안개 없이 어디든). 바꾸면 다시 구독한다(S3 시야 전송), 기억한다(631 다)
  const {
    operator,
    operatorRef,
    toggle: toggleOperator,
  } = useOperatorMode(devTools, () => poolRef.current?.refresh());
  // 내 유닛 목록(서버, 5초마다) — 엔진 콜백은 ref로 읽는다. 플레이어 카메라는 내 유닛·건물 둘레(630)
  // 카메라 범위는 지금 2차맵 답만 쓴다(넘은 직후 옛 2차맵 좌표가 새 틀에 걸리지 않게 — 새 답이 올 때까지 엔진이 옮겨 둔 범위를 그대로 둔다).
  // 이름·개수는 새 답이 올 때까지 떠나온 2차맵 답을 그대로 보인다(안내 줄·[내 유닛 N]이 넘는 순간 깜빡이지 않게)
  const unitsAnswer = useMapUnits(mapKey);
  const freshUnits = unitsAnswer.mapKey === mapKey;
  const staleUnits = !freshUnits && crossedFrom !== null && unitsAnswer.mapKey === crossedFrom;
  const myUnits = freshUnits || staleUnits ? unitsAnswer : NO_MAP_UNITS;
  const cameraTap = useCameraArea(
    engineRef,
    operator,
    freshUnits ? myUnits.units : null,
    freshUnits ? myUnits.view : null,
    staleUnits,
  );
  const unitsRef = useRef<readonly MapUnit[] | null>(null);
  // 근처 판(덧그림과 같이 보는 상태, React 밖). 넓은 화면은 유닛 탭을 펼친 채 연다(옛 내 유닛 목록처럼)
  const [nearby] = useState(() =>
    createNearbyState(wideScreen() ? { tab: "units", expanded: true } : { tab: null, expanded: false }),
  );
  const nearbyTab = useSyncExternalStore(
    (listener) => nearby.subscribe(listener),
    () => nearby.tab,
  );
  // 배치 칸 한 변(m) — 도시 화면에서 건물을 볼 때 보이는 폭을 정한다(부를 때 읽는다)
  const nearbyCellM = useCallback(() => nearby.cellM, [nearby]);
  const [liveMoving, setLiveMoving] = useState<ReadonlySet<number>>(() => new Set());
  const [selection, setSelection] = useState<SelectionState>(NO_SELECTION);
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
  // 내 사이보그 유닛(유닛 이름표가 늘 보인다 — unitNames.ts). 모음은 부를 때 읽는다
  const ownUnitRef = useRef<number | null>(null);
  const ownUnitId = cyborg?.unitId ?? null;
  useEffect(() => {
    ownUnitRef.current = ownUnitId;
    engineRef.current?.requestFrame();
  }, [ownUnitId, engineRef]);
  // 아래 판 자리 하나: 건물·오브젝트 판 > 내 유닛 목록([내 유닛 N], 문제2) > 근처 판(문제4)
  // 남의 유닛 정보 판(peek)도 이 자리 — 땅을 누르면 닫는다(엔진 콜백은 늘 같은 closePeek를 쓴다)
  const {
    sheet,
    peek,
    openUnits,
    closeUnits,
    openCity,
    closeCity,
    openBag,
    closeBag,
    openNearby,
    openPeek,
    closePeek,
  } = useBottomSheet(gather, nearby);
  // 고른 유닛 따라가기(내 유닛·운영자 모드)와 2차맵 확대 단계(사다리, 엔진이 바뀔 때 알린다)
  const [zoomStage, setZoomStage] = useState(0);
  // 지도에서 누른 유닛 — 유닛을 누를 때와 지도자 이름표를 누를 때 같다. 내 유닛이면 고르고 기준 유닛이 된다(chooseAnchor).
  // 남의 유닛이면(운영자 모드도) 고르지 않는다(false — 엔진도 고른 표시를 그대로 둔다): 명령 유닛은 그대로, 그 유닛의 작은 창만 연다
  // (사용자 지적 2026-11-09 "이동하려는데 다른 유닛이 선택되는문제", 2026-11-10). ref·상태 바꾸기·늘 같은 판 함수만 쓴다
  const isOwnUnit = (id: number): boolean =>
    feedRef.current?.isOwn(id) === true || unitsRef.current?.some((unit) => unit.unitId === id) === true;
  /** 그 유닛을 명령 유닛으로 삼는다(화면·엔진 고르기, 기준 유닛) */
  const selectUnit = (id: number | null, moving?: boolean): void => {
    closePeek();
    if (id !== null) setLastPicked(id);
    selectedRef.current = id;
    setSelected(id);
    setCommand(null);
    setSelection(
      id === null
        ? NO_SELECTION
        : { own: isOwnUnit(id), moving: engineRef.current?.unitState(id)?.moving ?? moving ?? false },
    );
  };
  /** 남의 유닛 작은 창을 연다(명령 유닛은 그대로) */
  const peekUnit = (id: number): void =>
    openPeek({ unitId: id, moving: engineRef.current?.unitState(id)?.moving ?? false });
  const selectFromMapRef = useRef((id: number | null): boolean => {
    if (id !== null && unitTapOf({ own: isOwnUnit(id), commanding: id === selectedRef.current }) === "peek") {
      peekUnit(id);
      return false;
    }
    selectUnit(id);
    return true;
  });
  // 주소를 넘은 2차맵으로 바꾸는 바깥 함수(최신 값)
  const onSwitchedRef = useRef(onSwitched);
  useEffect(() => {
    onSwitchedRef.current = onSwitched;
  }, [onSwitched]);
  /**
   * 옆 2차맵으로 넘기(로딩 없는 2차맵 이동, WP-3): 엔진이 이웃 지형을 지금 2차맵으로 올리고(rebase) 앞 모음을 멈춘 뒤 새 2차맵 모음을 켠다 —
   * 같은 작업 안에서(다음 프레임 전에) 끝내 유닛이 비는 프레임이 없다. 자료 흐름은 닫지 않고 받는 쪽만 바꾼다(mapFeedPool.ts). 확대·고른 유닛은
   * 그대로다(걸어서 넘는 것은 "들어가기"가 아니다 — 사용자 지적 2026-11-11 "다음 맵으로 이동시 확대배율이 유지되게").
   * 이웃 지형이 아직 서지 않았으면 그 지형을 받게 하고 기다린다(서면 다시). CROSS_WAIT_MS를 넘기면 주소를 바꿔 화면을 새로 연다(앞 방식)
   */
  const crossRef = useRef((next: number): void => {
    const engine = engineRef.current;
    const live = sessionRef.current;
    const start = startRef.current;
    const from = mapKeyRef.current;
    if (!engine || !live || !start || next === from) return;
    const kept = engine.selected();
    // 기준 유닛의 보이던 자리는 지금 틀에서 읽어 둔다(rebase가 유닛을 비운다)
    const pass = live.handover(next);
    if (!engine.rebase(String(next), String(from))) {
      // 이웃이 아니면(띄우지 않은 2차맵을 건너뛰어 두 장 너머에 나타났다) 기다릴 지형이 없다: 그 2차맵을 새로 연다
      if (!live.prefetch(next)) {
        probeEvent(`reopen ${next} (not a neighbour)`);
        openMap(next);
        return;
      }
      probeEvent(`wait ${from} -> ${next}`);
      if (pendingCrossRef.current?.next === next) return;
      if (pendingCrossRef.current) clearTimeout(pendingCrossRef.current.timer);
      const timer = setTimeout(() => {
        if (pendingCrossRef.current?.next !== next) return;
        pendingCrossRef.current = null;
        probeEvent(`reopen ${next}`);
        openMap(next);
      }, CROSS_WAIT_MS);
      pendingCrossRef.current = { next, timer };
      return;
    }
    if (pendingCrossRef.current) clearTimeout(pendingCrossRef.current.timer);
    pendingCrossRef.current = null;
    probeEvent(`cross ${from} -> ${next} carried=${pass.carried !== null}`);
    live.stop();
    mapKeyRef.current = next;
    crossedAtRef.current = Date.now();
    start(next, pass);
    // 새 목록에서 같은 유닛을 다시 고른다(엔진은 목록을 바꾸면 고르기를 푼다)
    const again = kept ?? selectedRef.current;
    if (again !== null) engine.select(again);
    setCrossedFrom(from);
    setSwitching(true);
    setMapKey(next);
    onSwitchedRef.current(next);
  });
  const crossTo = useCallback((next: number) => crossRef.current(next), []);
  const { going, crossedTo } = useTravelFollow(
    cyborg?.unitId ?? null,
    mapKey,
    following,
    crossTo,
    crossedAtRef,
  );
  // 가는 길의 다음 2차맵은 미리 받아 둔다(지형·흐름 — 변에 닿기 전에)
  const nextOnRoute = following && going !== null ? (going.route[going.leg + 1] ?? null) : null;
  useEffect(() => {
    if (nextOnRoute !== null) sessionRef.current?.prefetch(nextOnRoute);
  }, [nextOnRoute]);
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
  // 도시 화면 줄 → 카메라를 그 건물로(판이 열린 동안), 건물 판 열기
  const lookAtBuilding = useBuildingLook(engineRef, gather, refollow, nearbyCellM);
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
      sessionRef,
      selectFromMapRef,
      selectedRef,
      anchorRef,
      feedRef,
      unitsRef,
      operatorRef,
    },
    { setZoomStage, setStatus, setCommand, setSelected, setSelection, setLiveMoving, setSnapshot },
    { focus, gather, refollow, closePeek },
  );

  // 자료 흐름 모음(mapFeedPool.ts)과 지금 2차맵 모음(mapSession.ts): 화면을 열 때 들어온 2차맵으로 켠다. 옆 2차맵으로 넘으면 crossRef가
  // 같은 작업 안에서 앞 모음을 멈추고 새 모음을 켠다(이 효과는 다시 돌지 않는다 — 흐름·엔진은 그대로)
  useEffect(() => {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host) return () => undefined;
    const pool = createMapFeedPool({
      link: serverLink,
      fetchTerrain: (url) => fetchTerrain(url),
      canCommand: () => operatorRef.current,
      observe: () => operatorRef.current,
      now: () => performance.now(),
      serverNow,
      unitCapacity: UNIT_CAPACITY,
    });
    poolRef.current = pool;
    const start = (key: number, handover: MapHandover | null): void => {
      const mapSession = startMapSession({
        engine,
        host,
        mapKey: key,
        pool,
        unitCapacity: UNIT_CAPACITY,
        gather,
        nearby,
        leaderTags,
        tap: (sink) => cameraTap.current(sink),
        serverNow,
        handover,
        anchor: () => anchorRef.current,
        ownUnit: () => ownUnitRef.current,
        onArrived: (next) => crossRef.current(next),
        onNeighbourReady: () => {
          const pending = pendingCrossRef.current;
          if (pending) crossRef.current(pending.next);
        },
        onPickLeader: (unitId) => selectFromMapRef.current(unitId),
        onStatus: setFeedStatus,
        onCommand: (report) => setCommand({ kind: "result", report }),
      });
      sessionRef.current = mapSession;
      feedRef.current = mapSession.feed;
    };
    startRef.current = start;
    mapKeyRef.current = entryKey;
    start(entryKey, null);
    return () => {
      if (pendingCrossRef.current) clearTimeout(pendingCrossRef.current.timer);
      pendingCrossRef.current = null;
      startRef.current = null;
      sessionRef.current?.stop();
      sessionRef.current = null;
      feedRef.current = null;
      // 해제를 보낸다(엔진은 화면이 버린다)
      pool.stop();
      poolRef.current = null;
    };
  }, [entryKey, gather, nearby, leaderTags, operatorRef, cameraTap, anchorRef]);

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

  /** 목록에서 고르기: 그 유닛을 고르고 카메라가 따라간다(엔진이 아직 모르는 유닛이면 목록의 칸으로). 좁은 화면이면 목록을 접어 땅을 누를 수 있게 한다 */
  const pickUnit = (unit: MapUnit): void => {
    const engine = engineRef.current;
    engine?.select(unit.unitId);
    if (!engine?.unitState(unit.unitId)) engine?.setView({ x: unit.cellX + 0.5, y: unit.cellY + 0.5 });
    selectUnit(unit.unitId, unit.moving);
    if (!wideScreen()) {
      nearby.setExpanded(false);
      closeUnits();
    }
  };

  /** 작은 창의 [이 유닛 조종](운영자 모드): 그 남의 유닛을 명령 유닛으로 삼는다 — 이 단추만 명령 유닛을 남의 유닛으로 바꾼다 */
  const controlUnit = (unitId: number): void => {
    engineRef.current?.select(unitId);
    selectUnit(unitId);
  };

  /** [멈추기]: 고른 유닛을 지금 자리에 세운다(stop_unit) */
  const stopSelected = (): void => {
    const unitId = selectedRef.current;
    const current = feedRef.current;
    if (unitId === null || !current) return;
    const attempt = current.stopUnit(unitId);
    setCommand(attempt.kind === "sent" ? { kind: "sent", unitId, action: "stop" } : { kind: attempt.kind });
  };

  /** 운영자 모드를 끄면 자유 시점도 끄고, 조종하던 남의 유닛은 놓는다(고르기를 풀면 기준 유닛 = 내 유닛을 다시 고른다) */
  const toggleOperatorMode = (): void => {
    if (operator) {
      setFreeView(false);
      closePeek();
      if (selected !== null && !isOwnUnit(selected)) {
        engineRef.current?.select(null);
        selectedRef.current = null;
        setSelected(null);
        setSelection(NO_SELECTION);
        // 다시 켰을 때 그 유닛이 누르지 않았는데 기준 유닛으로 돌아오지 않게 마지막 고르기도 잊는다
        setLastPicked(null);
      }
    }
    toggleOperator();
  };

  // 아래 탭: 열린 탭(판 자리 하나 — 근처 판은 탭을 골라 둔 동안만 열린 것으로 친다), 다시 누르면 닫는다
  const navActive: MapNavTab | null =
    sheet === "units" || sheet === "city" || sheet === "bag"
      ? sheet
      : sheet === "nearby" && nearbyTab !== null
        ? "nearby"
        : null;
  const onNavTab = (tab: MapNavTab): void => {
    if (tab === "units") {
      if (navActive === "units") closeUnits();
      else openUnits();
    } else if (tab === "city") {
      if (navActive === "city") closeCity();
      else openCity();
    } else if (tab === "bag") {
      if (navActive === "bag") closeBag();
      else openBag();
    } else if (navActive === "nearby") nearby.setTab(null);
    else openNearby();
  };

  // 옆 2차맵으로 넘은 뒤 새 자료가 다 올 때까지는 "받는 중" 안내를 띄우지 않는다(지형은 이웃에서 올린 것이 이미 보인다). 실패 안내는 그대로
  const settled = feedStatus.hasSnapshot && feedStatus.terrain.kind === "ready" && status.kind !== "loading";
  const rawNotice = screenNotice(status, feedStatus);
  const notice = switching && !settled && rawNotice?.tone === "status" ? null : rawNotice;
  const stats = snapshot?.stats ?? null;
  const feed = snapshot?.feed ?? null;

  // 이 맵에 내 유닛이 없으면 들어갈 수 없다(WP-1 Q3 — 카메라가 따라갈 유닛이 없다). 운영자 모드는 들어간다
  const blocked = !notice && blockedWithoutUnits({ operator, units: myUnits.units });
  // 고른 유닛(늘 하나 — 엔진이 아직 고르기 전이면 기준 유닛)
  const shown = selected ?? anchor;
  // 고른 유닛을 어떻게 다루나(운영자·내 유닛·못 함·남의 유닛) — 목록의 줄 또는 시야 전송의 내 유닛 표시로
  const mine = shown === null ? undefined : myUnits.units?.find((unit) => unit.unitId === shown);
  const control =
    shown === null ? null : unitControlOf({ operator, mine, ownByFeed: shown === anchor || selection.own });
  // 한눈 정보(636 나): 정보 판의 남의 유닛, 없으면 고른 유닛이 남의 유닛일 때(운영자 모드를 끈 직후 등)
  const glanceUnit = peek?.unitId ?? (control?.kind === "other" ? shown : null);
  const glance = useUnitGlance(mapKey, glanceUnit, glanceUnit !== null);
  const labelOf = (unitId: number): string => unitLabel(unitId, myUnits.units);
  // 이동 경로·목적지 표시(엔진 setRouteUnit): 내가 다룰 수 있는 고른 유닛만(사용자 요청 2026-11-09)
  const routeUnit = control !== null && canCommand(control) ? shown : null;
  useEffect(() => {
    engineRef.current?.setRouteUnit(routeUnit);
  }, [routeUnit, engineRef]);
  const hint =
    pendingBuildPick() !== null
      ? m.map_build_pick_hint()
      : shown === null || control === null
        ? m.map_hint()
        : selectionText(
            control,
            labelOf(shown),
            shown,
            selection.moving,
            glanceUnit === shown ? glance : null,
          );
  // 명령을 받을 유닛 하나(건물 판 "보낼 유닛"·채집) — 안내 줄의 고른 유닛을 다룰 수 있으면 그 유닛(문제3)
  const actor = commandUnit({
    shown,
    shownCommandable: control !== null && control.kind !== "other",
    anchor,
    cyborgUnitId: cyborg?.unitId ?? null,
  });

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
      data-nav="bottom"
      data-sheet={sheet}
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
          {staff ? <OperatorMenuButton control={opsMenu} /> : null}
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
          rung={{ kind: "local", stage: zoomStage, stages: LOCAL_ZOOM_STAGES }}
          onZoomIn={() => engineRef.current?.zoomStep(1)}
          onZoomOut={() => {
            if (engineRef.current && !engineRef.current.zoomStep(-1)) openPlanetStage(mapKey);
          }}
        />
        {staff ? (
          <OperatorMenuPanel control={opsMenu}>
            <PerfToggle />
            {devTools ? (
              <OperatorItems
                operator={operator}
                freeView={freeView}
                onToggle={toggleOperatorMode}
                onFreeView={() => setFreeView((on) => !on)}
              />
            ) : null}
          </OperatorMenuPanel>
        ) : null}
        <MapPerfPanel perf={perf} stats={stats} feed={feed} />
      </header>
      <SecondMapNotices
        notice={notice}
        blocked={blocked}
        mapKey={mapKey}
        onRetry={() => feedRef.current?.retry()}
      />
      <footer className="map-hud map-hud-bottom">
        {sheet === "units" ? (
          <MyUnitsPanel
            units={myUnits.units}
            failed={myUnits.failed}
            elsewhere={myUnits.elsewhere}
            moving={liveMoving}
            now={myUnits.at}
            selected={shown}
            onPick={pickUnit}
            onClose={closeUnits}
          />
        ) : null}
        {sheet === "bag" ? <BagSheet unitId={shown} mine={mine !== undefined} onClose={closeBag} /> : null}
        {sheet === "nearby" ? (
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
            onInspectUnit={(unitId) => void selectFromMapRef.current(unitId)}
          />
        ) : null}
        {sheet === "peek" && peek ? (
          <PeekCard
            unitId={peek.unitId}
            moving={peek.moving}
            glance={glance}
            ground={shown === null ? "none" : operator ? "operator" : "own"}
            hasActions={leaderTags.isLeader(peek.unitId)}
            onControl={operator ? () => controlUnit(peek.unitId) : null}
            onClose={closePeek}
          >
            <LeaderSheet tags={leaderTags} selected={peek.unitId} mapKey={mapKey} embedded />
          </PeekCard>
        ) : null}
        {/* 누른 건물이 행정 건물이면 정부 몫을 그 건물 판 안에(docs/adr/2026-11-07-play-flow.md "WP-NPC", 건물 하나에 판 하나) */}
        <GatherPanel
          state={gather}
          mapKey={mapKey}
          actor={actor}
          actorAboard={myUnits.units?.some((unit) => unit.unitId === actor && unit.aboard != null) === true}
          unitLabel={labelOf}
          buildingExtra={<GovernmentSheet state={gather} embedded />}
        />
        {/* 고른 유닛이 NPC 국가 지도자면 지도자 판 → 수도 정부 판("WP-NPC3"). 다른 판이 열린 동안은 숨긴다 */}
        {sheet === "nearby" ? <LeaderSheet tags={leaderTags} selected={shown} mapKey={mapKey} /> : null}
        <div className="map-panel map-hint" role="status">
          <p>{hint}</p>
          {command ? <p className="map-command">{commandText(command)}</p> : null}
          <TravelLine going={going} />
        </div>
        <CyborgActions followTo={following ? null : crossedTo} />
        {/* 배 단추(docs/adr/2026-11-13-boats.md): 고른 내 유닛이 배·탄 유닛·가까운 내 배가 있는 유닛일 때 */}
        <BoatActions unit={shown === null ? undefined : mine} units={myUnits.units} />
        {shown === null ? null : (
          <SelectedActions
            onStop={
              showStop({
                commandable: control !== null && canCommand(control),
                moving: selection.moving,
                travelling: going !== null && going.unitId === selected,
              })
                ? stopSelected
                : null
            }
          />
        )}
      </footer>
      {sheet === "city" ? (
        <CitySheet
          gather={gather}
          nearby={nearby}
          mapKey={mapKey}
          anchorAt={nearbySources.anchorAt}
          onOpen={lookAtBuilding}
          onClose={closeCity}
        />
      ) : null}
      <MapBottomNav
        active={navActive}
        mapKey={mapKey}
        unitCount={myUnits.units?.length ?? null}
        onTab={onNavTab}
      />
    </section>
  );
}
