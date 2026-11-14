// 1차맵 화면(S2) — 행성 LOD 엔진(@terra/engine/planet)으로 서버가 구운 행성을 그린다. 지연 로딩 조각 하나로만 들어온다
// (App.tsx의 React.lazy). 순서: 목록 정보 받기(굽는 중이면 기다리며 다시 묻기) + 내 사이보그 자리 → 행성 설명·서버 타일 원천 → 엔진.
// 지도 흐름(docs/adr/2026-11-07-play-flow.md "WP2"): 도시·국가 표시·영토 경계(CityOverlay, world.cities), 도시를 누르면 도시 판(이름·국가·
// 둘레 땅·[들어가기] → /map?key=&at=), [내 위치], 가장 가까이(5단계)에서 들어갈 수 있는 2차맵이 가운데면 [이 2차맵으로 들어가기](기획 60 §4.1).
// WP7: 도시는 서버가 아는 도시만 준다(안개, 514). 들어갈 때 고른 곳(도시 시청·화면 가운데 배치 칸)을 ?at=로 넘긴다(515). 볼 수 없는 맵의
// 도시는 [정찰 보내기] → 1차맵 명령 판(PlanetCommandPanel, 513) → [확정]이면 내 사이보그가 이웃 2차맵을 지나 걸어간다(WP9, 571 가).
// WP11: 가는 동안 내 자리 표시가 따라간다(useMyTravel — world.travels의 지금 자리, 건너뛰는 중이면 곧은 선 위 자리).
// 바뀜 2026-11-09(사용자 요청 "옆2차맵으로 이동 없애라 그냥 걸어가는거지. 대신 1차맵에서 해당지역으로 이동 같은 기능 추가"): 땅을 누르면
// 누른 칸 안내 아래 [이곳으로 이동] → 같은 1차맵 명령 판(대상 = 누른 자리의 2차맵·배치 칸, 이동이 먼저, commandTarget.ts). 바다·내 사이보그가
// 이미 있는 2차맵이면 버튼 대신 까닭 한 줄.
// 처음 볼 곳: ?planet-view= > ?key=(그 2차맵) > 내 사이보그 자리 > 엔진 기본.
// 타일은 서버 이진 그대로 엔진에 넘기고 메시 워커가 푼다(planetSource.ts, ADR 36 "서버 굽기·전송").
// 앱 화면 흐름(홈·아래 탭)이 정해지면 이 화면을 그곳으로 옮긴다: onClose·monitor만 받는다.
// 고빈도 상태는 엔진 안에 있고, 이 화면은 1초마다 요약(stats)만 읽는다(PLAN 5.7). 시험(Playwright)은 data-* 값을 읽는다.
// 틈 찾기: 주소에 ?planet-debug=cracks를 붙이면 엔진이 바탕 구·하늘을 자홍색으로 칠한다(시험용, 타일 사이 틈이 자홍색 점으로 보인다).
// 픽셀 비율 재기: ?pixel-ratio=<1~4>를 붙이면 엔진 상한을 바꾼다(시험용, pixelRatioParam.ts). HUD에 쓰는 값·그리기 버퍼가 보인다.
// 하늘(ADR 2026-10-29-primary-map-sky 9절): 서버 시계로 낮밤·달·구름(planetSky.ts). 동작 줄이기면 연 시각에 멈춘다(바뀌면 setSky).
// 시험·측정 주소: ?planet-time= 시각 멈춤, ?planet-sky=off, ?planet-sky-skip=night,moon,clouds, ?planet-sky-bench=<1|2|4>(HUD 하늘 줄),
// ?planet-view=<위도>,<경도>[,<거리 km>] 처음 볼 곳(planetViewParam.ts).
// 확대 단계(ADR 2026-11-07-planet-view): 오른쪽 사다리 [+]·[−](ZoomLadder, 엔진 zoomStep). 5단계 끝에서 더 키우면 가운데 2차맵으로
// 들어가고(D-6018), 1단계 끝에서 더 줄이면 항성계 보기(PlanetSystemView)로 바뀐다. 처음 단계는 늘 5(가장 가까이, 사용자 요청 2026-11-09),
// ?stage=<1~5>가 있으면 그 단계.
// 성능 판(PlanetPerfPanel)·고도 과장 막대는 운영진(gm·admin·dev)에게만 보인다(사용자 요청 2026-11-09). 성능 보고는 누구나 보낸다.
// 바뀜 2026-11-14(사용자 요청 "1차맵 UI 개편"): 고도 과장은 모두 ×12 고정, 막대는 운영 메뉴 안으로(운영진만, 이 화면을 닫으면 ×12로).
// 레이어 고르기는 접는 단추 하나(지금 레이어 이름 — 누르면 고르기·범례가 열린다, PlanetLayerPicker). 영토는 도시 원들의 합·국가 이름(CityOverlay).
// 레이어(사용자 요청 2026-11-12, ADR 2026-11-07-planet-view "바뀜 (2026-11-12)"): 지형·기후·고도·자원 분포·영토(PlanetLayerPicker).
// 자원 분포는 고른 원자재의 서버 지도를 받아 엔진에 넣고(planetResource.ts), 다른 레이어로 가면 버린다. 영토는 도시 덧그림을 진하게 하고
// 누른 곳의 국가를 안내 줄에 더한다(territoryPick.ts).
import {
  type PickedCell,
  type PlanetEngine,
  type PlanetLayer,
  type PlanetProjector,
  type PlanetStats,
  type PlanetStatus,
  PLANET_EXAGGERATION,
  WATER_BITS,
  createPlanetEngine,
  mapKeyAtLatLon,
  placementAtLatLon,
} from "@terra/engine/planet";
import type { WorldCitiesResponse, WorldMapCity, WorldPosition } from "@terra/shared/worldMap";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { refreshSession, useStaffView } from "../auth/session.ts";
import { serverLink } from "../net/serverLink.ts";
import { navigate } from "../shell/routerStore.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import {
  PlanetLoadError,
  createServerTileSource,
  loadPlanetManifest,
  planetDescriptionOf,
} from "./planetSource.ts";
import { pixelRatioOption } from "./pixelRatioParam.ts";
import {
  createSkyClock,
  planetSkyMode,
  planetTelemetryView,
  readPlanetSkyParams,
  reducedMotionList,
} from "./planetSky.ts";
import { planetViewOption } from "./planetViewParam.ts";
import { cellLines } from "./planetText.ts";
import { CityOverlay } from "./CityOverlay.tsx";
import { type LoadPhase, type TileProblem, screenNotice } from "./planetNotice.ts";
import { clusterView, focusView } from "./planetFocus.ts";
import { PlanetCityPanel } from "./PlanetCityPanel.tsx";
import { PlanetCommandPanel } from "./PlanetCommandPanel.tsx";
import { PlanetReadout } from "./PlanetReadout.tsx";
import { type CommandTarget, areaCheck, areaTarget, cityTarget, commandKey } from "./commandTarget.ts";
import { PlanetLayerPicker, PlanetLayerToggle } from "./PlanetLayerPicker.tsx";
import { PlanetPerfPanel } from "./PlanetPerfPanel.tsx";
import { OperatorMenuButton, OperatorMenuPanel, PerfToggle, useOperatorMenu } from "./OperatorMenu.tsx";
import { territoryLineOf, usePlanetLayers } from "./usePlanetLayers.ts";
import { PlanetSystemView } from "./PlanetSystemView.tsx";
import { ZoomLadder } from "./ZoomLadder.tsx";
import { formatAtParam } from "./mapTarget.ts";
import { type MyTravelEvent, liveMe, reachedMap, useMyTravel } from "./useMyTravel.ts";
import { enterableAt, loadMyPosition, loadWorldCities, parseMapKey } from "./worldMapData.ts";
import "./map.css";
import "./planetMap.css";

/** [임시] 시험 화면이 여는 행성 = 콘텐츠 팩 S2 시험 행성. 행성을 고르는 화면이 생기면 그쪽에서 받는다 */
const PLANET_ID = "s2_test_planet";
/** 1차맵 가장 가까운 확대 단계 — 여기서 가운데 2차맵에 들어갈 수 있다(기획 60 §4.1, D-6018) */
const FINEST_LEVEL = 5;
/** 성능 보고에 붙이는 화면 이름 */
const TELEMETRY_VIEW = "planet-map";
/** 고도 과장: 모두 ×12 고정(엔진 PLANET_EXAGGERATION, 사용자 결정 2026-11-14). 운영 메뉴 막대(운영진만)의 범위 */
const DEFAULT_EXAGGERATION = PLANET_EXAGGERATION;
const MIN_EXAGGERATION = 1;
const MAX_EXAGGERATION = 20;

/** 주소 ?stage=<1~5>(처음 확대 단계). 없거나 틀리면 undefined */
function stageParam(search: string): number | undefined {
  const value = Number(new URLSearchParams(search).get("stage"));
  return Number.isInteger(value) && value >= 1 && value <= FINEST_LEVEL ? value : undefined;
}

interface PlanetMapScreenProps {
  onClose: () => void;
  /** 앱의 프레임 측정기 — 화면 전체 프레임 시간(엔진 그리기 포함) */
  monitor: FrameMonitor;
  /** 주소 ?key= — 그 2차맵 자리를 가운데로 연다(2차맵 → 1차맵 전환) */
  mapKey?: string | undefined;
}

const fixed = (value: number, digits: number): string => value.toFixed(digits);

/** 다시 시도하면 화면 안쪽을 새로 만든다(목록 정보부터 다시 받고 엔진·상태를 모두 새로) */
export default function PlanetMapScreen(props: PlanetMapScreenProps) {
  const [attempt, setAttempt] = useState(0);
  return <PlanetMapView key={attempt} {...props} onRetry={() => setAttempt((count) => count + 1)} />;
}

/** 2차맵 들어가기: 2차맵 화면으로 바꾸기(replace — 뒤로 = 지도를 떠남, MapSwitch와 같다). at = 1차맵에서 고른 배치 칸(카메라) */
function enterMap(key: number, at: { readonly x: number; readonly y: number }): void {
  navigate({ route: "map", search: { key: String(key), at: formatAtParam(at.x, at.y) } }, { replace: true });
}

function PlanetMapView({
  onClose,
  monitor,
  onRetry,
  mapKey: keyParam,
}: PlanetMapScreenProps & { onRetry: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const engineRef = useRef<PlanetEngine | null>(null);
  // 엔진은 목록 정보를 받은 뒤에 만든다. 그 전에 고른 레이어·과장을 엔진에 넘기려고 지금 값을 따로 들고 있는다
  const exaggerationRef = useRef(DEFAULT_EXAGGERATION);
  const [load, setLoad] = useState<LoadPhase>({ kind: "manifest" });
  const [tileProblem, setTileProblem] = useState<TileProblem | null>(null);
  const [status, setStatus] = useState<PlanetStatus>({ kind: "loading" });
  const [stats, setStats] = useState<PlanetStats | null>(null);
  const [exaggeration, setExaggeration] = useState(DEFAULT_EXAGGERATION);
  // 누른 칸: 안내 줄과 땅 이름(바이옴 — 고른 지역 명령 판의 대상 이름)
  const [picked, setPicked] = useState<{
    cell: PickedCell | null;
    lines: string[];
    ground?: string | null;
  } | null>(null);
  // 운영진(gm·admin·dev)만 운영 메뉴(성능 표시·고도 과장 막대)를 본다. 성능 판은 PlanetPerfPanel이 스스로 가린다
  const staff = useStaffView();
  // 운영 메뉴(운영진만, 사용자 지적 2026-11-12): 성능 표시 켜고 끄기 — 2차맵과 같은 값
  const opsMenu = useOperatorMenu();
  // 지도 흐름: 도시·국가(world.cities), 내 자리, 고른 도시, 행성 면 레벨(가운데 2차맵 키)
  const overlayDraw = useRef<((projector: PlanetProjector) => void) | null>(null);
  const registerOverlay = useCallback((draw: ((projector: PlanetProjector) => void) | null) => {
    overlayDraw.current = draw;
  }, []);
  const [world, setWorld] = useState<WorldCitiesResponse | null>(null);
  const [me, setMe] = useState<WorldPosition | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  // 레이어(지형·기후·고도·자원 분포·영토) — 자원 지도 받기·영토 범례(usePlanetLayers.ts). 엔진을 만들 때·누를 때 읽는 지금 값은 ref로
  const layerRef = useRef<PlanetLayer>("terrain");
  const worldRef = useRef<WorldCitiesResponse | null>(null);
  useEffect(() => {
    worldRef.current = world;
  }, [world]);
  const layers = usePlanetLayers({
    planetId: PLANET_ID,
    engineRef,
    engineReady: load.kind === "ready",
    layerRef,
    world,
  });
  const { layer } = layers;
  // 레이어 판 여닫기(바뀜 2026-11-14): 접는 단추로 열고, 다시 누르기·Esc·땅 누르기로 닫는다
  const [layerMenu, setLayerMenu] = useState(false);
  const closeLayerMenu = useCallback(() => setLayerMenu(false), []);
  const layerSheetId = useId();
  // 1차맵 명령 판의 대상(도시 판 [정찰 보내기] 또는 누른 지역의 [이곳으로 이동]). 있으면 도시 판·누른 칸 안내 대신 명령 판
  const [command, setCommand] = useState<CommandTarget | null>(null);
  const [planet, setPlanet] = useState<{ faceLevel: number; radiusM: number } | null>(null);
  // 확대 단계(엔진이 바뀔 때 알린다)와 항성계 보기(1단계보다 더 줄였을 때)
  const [zoomStage, setZoomStage] = useState(0);
  const [systemView, setSystemView] = useState(false);
  // 끝 너머 밀기(엔진 onZoomEdge)는 엔진을 만들 때 넘기므로, 지금 화면 값(가운데 2차맵)으로 처리하는 함수를 따로 들고 있는다
  const zoomEdge = useRef<(edge: "in" | "out") => void>(() => undefined);
  // 위 판 줄(항성계 보기가 그 아래부터 내용을 놓는다)
  const headerRef = useRef<HTMLElement>(null);
  const requestFrame = useCallback(() => engineRef.current?.requestFrame(), []);
  // 2차맵 사이 이동(WP9·WP11): 길이 끝나거나 정찰이 돌아서면 도시 목록(볼 수 있음)·내 자리를 다시 받고, 그 도시 명령 판이면 도시 판으로
  // 돌아간다([들어가기])
  const commandMapRef = useRef<number | null>(null);
  const onTravelEvent = useCallback((event: MyTravelEvent) => {
    loadWorldCities().then(setWorld, () => undefined);
    loadMyPosition().then(
      (answer) => setMe(answer.position),
      () => undefined,
    );
    const reached = reachedMap(event);
    if (reached !== null && reached === commandMapRef.current) setCommand(null);
  }, []);
  const { travel, refresh: refreshTravel } = useMyTravel(me?.unitId ?? null, onTravelEvent);
  // 같은 값이면 같은 객체(덧그림이 바뀐 때만 다시 그린다)
  const shownMe = useMemo(() => liveMe(me, travel), [me, travel]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return () => undefined;
    const controller = new AbortController();
    let engine: PlanetEngine | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    // 하늘: 시계는 화면을 연 때부터 센다(5초 안에 못 재면 기기 시계). 주소 매개변수는 시험·측정용
    const search = window.location.search;
    const skyParams = readPlanetSkyParams(search);
    const debugCracks = new URLSearchParams(search).get("planet-debug") === "cracks";
    const skyClock = createSkyClock(serverLink);
    const reduced = reducedMotionList();
    const skyMode = () =>
      planetSkyMode(skyParams, skyClock, { reducedMotion: reduced?.matches ?? false, debugCracks });
    const onReducedMotion = (): void => engine?.setSky(skyMode());
    reduced?.addEventListener("change", onReducedMotion);
    setTelemetryView(planetTelemetryView(TELEMETRY_VIEW, skyParams));
    // 도시·국가는 엔진을 기다리지 않는다(오면 덧그림이 그린다). 내 자리는 처음 볼 곳이라 목록 정보와 함께 기다린다(실패하면 없이)
    loadWorldCities(controller.signal).then(
      (cities) => {
        if (!controller.signal.aborted) setWorld(cities);
      },
      () => undefined,
    );
    const position = loadMyPosition(controller.signal).then(
      (answer) => answer.position,
      () => null,
    );
    const manifestLoaded = loadPlanetManifest(PLANET_ID, {
      signal: controller.signal,
      onWaiting: (reason, retryInMs) => setLoad({ kind: reason, retryInMs }),
    });
    Promise.all([manifestLoaded, position]).then(
      ([manifest, mine]) => {
        if (controller.signal.aborted) return;
        setMe(mine);
        setPlanet({ faceLevel: manifest.faceLevel, radiusM: manifest.radiusM });
        // 처음 단계: ?stage=가 없으면 늘 가장 가까운 5단계(사용자 요청 2026-11-09 "진입시 항상 최대 확대 상태로 시작").
        // ?planet-view=에 거리가 있으면(시험·측정) 그 거리가 이긴다(엔진 initialView.distanceM)
        const firstStage = stageParam(search) ?? FINEST_LEVEL;
        const focus = focusView(parseMapKey(keyParam), mine);
        try {
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
              // 로그인 안내는 다음 타일이 오면 지운다(잠깐 401이었다). 판이 바뀐 안내는 다시 시도할 때까지 둔다
              onSuccess: () => setTileProblem((problem) => (problem === "sign_in" ? null : problem)),
            }),
            layer: layerRef.current,
            exaggeration: exaggerationRef.current,
            debugCracks,
            ...pixelRatioOption(search),
            ...(focus ? { initialView: focus } : {}),
            initialStage: firstStage,
            ...planetViewOption(search),
            sky: skyMode(),
            ...(skyParams.benchRepeat === null ? {} : { gpuBenchRepeat: skyParams.benchRepeat }),
            onStatus: setStatus,
            onPick: (cell) => {
              // 땅을 누르면 도시 판·명령 판·레이어 판을 닫고 그 칸을 본다
              setCityId(null);
              setCommand(null);
              setLayerMenu(false);
              const lines = cell ? cellLines(cell, (id) => names.get(id) ?? null) : [m.planet_cell_none()];
              const nation =
                cell && layerRef.current === "territory" ? territoryLineOf(worldRef.current, cell) : null;
              setPicked({
                cell,
                lines: nation ? [...lines, nation] : lines,
                ground: cell ? (names.get(cell.biome) ?? null) : null,
              });
            },
            onOverlay: (projector) => overlayDraw.current?.(projector),
            onZoomStage: setZoomStage,
            onZoomEdge: (edge) => zoomEdge.current(edge),
          });
          engine = created;
          engineRef.current = created;
          setLoad({ kind: "ready" });
          timer = setInterval(() => setStats(created.stats()), 1000);
        } catch (error) {
          // 엔진을 만들지 못했다(이 기기가 읽지 못한 자료 등): 만든 것을 버리고 [다시 시도]를 띄운다.
          // 잡지 않으면 처리 안 된 거절이 되어 화면이 "받는 중"에 멈춘다. 오류는 기기 오류 보고로 보낸다
          engine?.dispose();
          engine = null;
          engineRef.current = null;
          reportError(error);
          setLoad({ kind: "failed", reason: "invalid" });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({ kind: "failed", reason: error instanceof PlanetLoadError ? error.reason : "server" });
      },
    );
    return () => {
      controller.abort(new DOMException("planet screen closed", "AbortError"));
      reduced?.removeEventListener("change", onReducedMotion);
      clearInterval(timer);
      engine?.dispose();
      engineRef.current = null;
      setTelemetryView(null);
    };
    // 주소 ?key=는 처음 볼 곳만 정한다(바뀌면 화면 열쇠가 바뀌어 다시 만든다 — routeViews.tsx)
  }, [keyParam]);

  // 로그인이 풀렸다고 하면 로그인 상태를 다시 확인한다(끝났으면 앱이 로그인 화면으로 바꾸며 이 화면을 닫는다).
  // 아직 로그인한 채면(잠깐 401) 타일 로그인 안내를 지운다 — 엔진은 실패한 타일을 저절로 다시 받는다
  const signInLost = (load.kind === "failed" && load.reason === "sign_in") || tileProblem === "sign_in";
  useEffect(() => {
    if (!signInLost) return () => undefined;
    let current = true;
    void refreshSession().then((session) => {
      if (current && session.kind === "signed_in") {
        setTileProblem((problem) => (problem === "sign_in" ? null : problem));
      }
    });
    return () => {
      current = false;
    };
  }, [signInLost]);

  const changeExaggeration = (value: number): void => {
    exaggerationRef.current = value;
    setExaggeration(value);
    engineRef.current?.setExaggeration(value);
  };

  const zoomTo = (place: WorldMapCity): void => {
    engineRef.current?.lookAt(clusterView(place, stats?.camera.distanceM));
  };
  const goToMe = (): void => {
    if (!shownMe) return;
    engineRef.current?.lookAt({ latDeg: shownMe.latDeg, lonDeg: shownMe.lonDeg });
  };
  const cities = world?.status === "ready" ? world.cities : [];
  const city = cities.find((entry) => entry.id === cityId) ?? null;
  const commandMapKey = command?.mapKey ?? null;
  useEffect(() => {
    commandMapRef.current = commandMapKey;
  }, [commandMapKey]);
  // 가장 고운 단계에서 화면 가운데 2차맵에 들어갈 수 있으면 [이 2차맵으로 들어가기](기획 60 §4.1 "그곳 줌인 → 그 2차맵")
  const centerKey =
    stats && planet ? mapKeyAtLatLon(stats.camera.latDeg, stats.camera.lonDeg, planet.faceLevel) : null;
  const here = zoomStage === FINEST_LEVEL && centerKey !== null ? enterableAt(cities, centerKey) : null;
  // 화면 가운데 배치 칸(그 2차맵 카메라가 볼 곳, 515). 못 구하면 그 도시 시청
  const enterHere = (target: WorldMapCity): void => {
    const at =
      stats && planet ? placementAtLatLon(stats.camera.latDeg, stats.camera.lonDeg, planet.faceLevel) : null;
    enterMap(target.mapKey, at?.mapKey === target.mapKey ? at : { x: target.cellX, y: target.cellY });
  };
  // 확대 단계 끝: 가장 가까이에서 더 키우면 가운데 2차맵(없으면 안내), 가장 멀리에서 더 줄이면 항성계 보기
  const atEdge = (edge: "in" | "out"): void => {
    if (edge === "out") {
      setSystemView(true);
      setCityId(null);
    } else if (here) enterHere(here);
    else setPicked({ cell: null, lines: [m.zoom_no_local_map()] });
  };
  useEffect(() => {
    zoomEdge.current = atEdge;
  });
  const zoomIn = (): void => {
    if (systemView) setSystemView(false);
    else if (engineRef.current && !engineRef.current.zoomStep(1)) atEdge("in");
  };
  const zoomOut = (): void => {
    if (!systemView && engineRef.current && !engineRef.current.zoomStep(-1)) atEdge("out");
  };

  const shown = screenNotice(load, tileProblem, status);
  const camera = stats?.camera;
  const cell = picked?.cell ?? null;
  // 누른 지역으로 보내기(바뀜 2026-11-09): 누른 자리의 2차맵·배치 칸. 바다·내 사이보그 2차맵·보낼 유닛 없음이면 버튼을 감춘다
  const area = areaCheck(
    cell && planet ? placementAtLatLon(cell.latDeg, cell.lonDeg, planet.faceLevel) : null,
    cell !== null && (cell.water & WATER_BITS.ocean) !== 0,
    shownMe?.mapKey ?? null,
  );
  const moveToArea = (): void => {
    if (area.kind !== "ok" || !world) return;
    setCommand(areaTarget(area.place, cities, world.factions, picked?.ground ?? null));
  };
  const firstMs = stats?.firstDisplayMs ?? null;
  const sky = stats?.sky;

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
      data-material={layer === "resource" ? layers.material : undefined}
      data-resource={layer === "resource" ? layers.resourceLoad : undefined}
      data-resource-bytes={stats?.resourceMapBytes}
      data-engine-exaggeration={stats?.exaggeration}
      data-exaggeration={exaggeration}
      data-frames={stats?.renderedFrames}
      data-engine-p95={stats ? fixed(stats.renderP95Ms, 2) : undefined}
      data-tiles-drawn={stats?.tilesDrawn}
      data-levels={stats ? stats.tilesDrawnByLevel.join(",") : undefined}
      data-tiles-selected={stats?.tilesSelected}
      data-tiles-loaded={stats?.tilesLoaded}
      data-tiles-pending={stats?.tilesPending}
      data-tile-budget={stats?.budgets.visibleTiles}
      data-tile-errors={stats?.tileErrors}
      data-tiles-failed={stats?.tilesFailed}
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
      data-programs={stats?.shaderPrograms}
      data-gpu-bytes={stats?.gpuBytes}
      data-memory-bytes={stats?.memoryBytes}
      data-max-elevation={stats?.maxElevationM}
      data-level={stats?.primaryLevel}
      data-map-level={stats?.mapLevel}
      data-incomplete={stats ? String(stats.incomplete) : undefined}
      data-first-ms={firstMs === null ? undefined : fixed(firstMs, 0)}
      data-context-lost={stats ? String(stats.contextLost) : undefined}
      data-pixel-ratio={stats?.pixelRatio}
      data-buffer={stats ? `${stats.drawingBufferWidth}x${stats.drawingBufferHeight}` : undefined}
      data-sky={sky?.mode}
      data-sky-clock={sky?.clock}
      data-sky-blend={sky ? fixed(sky.blend, 2) : undefined}
      data-sun={
        sky && sky.subsolarLatDeg !== null && sky.subsolarLonDeg !== null
          ? `${fixed(sky.subsolarLatDeg, 3)},${fixed(sky.subsolarLonDeg, 3)}`
          : undefined
      }
      data-night={sky ? fixed(sky.nightStrength, 3) : undefined}
      data-sky-interval={sky?.clockIntervalMs ?? undefined}
      data-moons={sky?.moonsDrawn}
      data-cloud-opacity={sky ? fixed(sky.cloudOpacity, 3) : undefined}
      data-cloud-bakes={sky?.cloudBakes}
      data-cloud-bake-ms={sky?.cloudBakeMaxMs == null ? undefined : fixed(sky.cloudBakeMaxMs, 2)}
      data-sky-bytes={sky?.gpuBytes}
      data-gpu-ms={stats?.gpuBench ? fixed(stats.gpuBench.medianMs, 2) : undefined}
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
      data-cities={world ? cities.length : undefined}
      data-city={city?.id}
      data-commanding={command ? "true" : undefined}
      data-area={cell ? area.kind : undefined}
      data-me={shownMe ? shownMe.mapKey : undefined}
      data-me-at={shownMe ? `${fixed(shownMe.latDeg, 5)},${fixed(shownMe.lonDeg, 5)}` : undefined}
      data-me-travel={travel?.state === "going" ? (travel.hidden ? "hidden" : "going") : undefined}
      data-center-key={centerKey ?? undefined}
      data-zoom-stage={zoomStage > 0 ? zoomStage : undefined}
      data-system-view={systemView ? "true" : undefined}
    >
      <div ref={hostRef} className="map-view" role="img" aria-label={m.planet_view_label()} />
      {systemView ? <PlanetSystemView onBack={() => setSystemView(false)} headerRef={headerRef} /> : null}
      {world?.status === "ready" && !systemView ? (
        <CityOverlay
          cities={cities}
          factions={world.factions}
          milliPerRadian={world.milliPerRadian}
          me={shownMe}
          selected={cityId}
          onSelect={(next) => {
            setCityId(next.id);
            setCommand(null);
          }}
          onZoomTo={zoomTo}
          register={registerOverlay}
          requestFrame={requestFrame}
          emphasis={layer === "territory"}
        />
      ) : null}
      <header className="map-hud map-hud-top" ref={headerRef}>
        <div className="map-panel map-heading">
          <button type="button" className="button-small" onClick={onClose}>
            {m.map_back()}
          </button>
          <h1 id="planet-title" className="map-title" ref={headingRef} tabIndex={-1}>
            {m.planet_title()}
          </h1>
          {staff ? <OperatorMenuButton control={opsMenu} /> : null}
        </div>
        {load.kind === "ready" ? (
          <ZoomLadder
            rung={systemView ? { kind: "system" } : { kind: "planet", stage: zoomStage }}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            canZoomOut={!systemView}
          />
        ) : null}
        {staff ? (
          <OperatorMenuPanel control={opsMenu}>
            <PerfToggle />
            {/* 고도 과장 막대(운영진만, 사용자 요청 2026-11-09·2026-11-14 — 플레이어는 늘 ×12). 이 화면에서만, 다시 열면 ×12 */}
            <li className="map-operator-menu-row planet-slider">
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
            </li>
          </OperatorMenuPanel>
        ) : null}
        <PlanetPerfPanel monitor={monitor} stats={stats} hidden={systemView} />
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
      <footer className="map-hud map-hud-bottom planet-bottom" hidden={systemView}>
        {command && world ? (
          <PlanetCommandPanel
            key={commandKey(command)}
            target={command}
            factions={world.factions}
            me={me}
            travel={travel}
            onTravelChanged={refreshTravel}
            onClose={() => setCommand(null)}
          />
        ) : null}
        {city && world && !command ? (
          <PlanetCityPanel
            city={city}
            factions={world.factions}
            mine={world.myFactionId === city.factionId}
            onEnter={(target) => enterMap(target.mapKey, { x: target.cellX, y: target.cellY })}
            onScout={() => setCommand(cityTarget(city, world.factions))}
            canSend={me !== null && me.mapKey !== city.mapKey}
            onClose={() => setCityId(null)}
          />
        ) : null}
        <PlanetReadout
          lines={picked?.lines ?? null}
          hidden={city !== null || command !== null}
          climate={layer === "climate"}
          // 지금 실패한 타일만(다시 받아 오면 사라진다). 판이 바뀐 안내가 떠 있으면 그 안내가 대신한다
          tilesFailed={stats && tileProblem !== "not_found" ? stats.tilesFailed : 0}
          area={area}
          onMove={world ? moveToArea : null}
        />
        <div className="planet-controls">
          <PlanetLayerPicker
            id={layerSheetId}
            open={layerMenu}
            onClose={closeLayerMenu}
            layer={layer}
            onLayer={layers.chooseLayer}
            material={layers.material}
            onMaterial={layers.chooseMaterial}
            resourceLoad={layers.resourceLoad}
            onRetryResource={layers.retryResource}
            maxElevationM={stats ? stats.maxElevationM : null}
            nations={layers.nations}
          />
          {/* 늘 보이는 줄: 레이어 접는 단추 · [이 2차맵으로 들어가기] · [내 위치] */}
          <div className="planet-jump">
            <PlanetLayerToggle
              layer={layer}
              open={layerMenu}
              controls={layerSheetId}
              onToggle={() => setLayerMenu((open) => !open)}
            />
            {here ? (
              <button
                type="button"
                className="button-small button-primary planet-enter-here"
                onClick={() => enterHere(here)}
              >
                {m.world_enter_here()}
              </button>
            ) : null}
            {shownMe ? (
              <button type="button" className="button-small planet-go-me" onClick={goToMe}>
                {m.world_my_position()}
              </button>
            ) : null}
          </div>
        </div>
      </footer>
    </section>
  );
}
