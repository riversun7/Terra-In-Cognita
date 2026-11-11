// 2차맵 하나의 자료 잇기 — 2차맵 화면(SecondaryMapScreen.tsx)에서 나눴다(docs/adr/2026-11-08-seamless-second-map.md WP-3 로딩 없는 2차맵 이동).
// 엔진은 화면이 한 번 만들어 계속 쓰고, 이 모음은 지금 2차맵마다 새로 켠다: 지도 자료 구독(mapFeed.ts)·건물 겉모습·채집 덧그림·지도자 이름표·
// 이웃 지형 받기·이웃 안개 구독. 옆 2차맵으로 넘으면 화면이 엔진을 rebase하고 이 모음을 멈춘 뒤 새 2차맵으로 다시 켠다(받아 둔 지형을 seed로 넘긴다).
// - 넘기 신호: 기준 유닛이 구독 중인 이웃 2차맵의 스냅샷·경로에 나타나면 onArrived(그 2차맵). 또 기준 유닛이 변 바로 옆에 있다가 지금 2차맵에서
//   사라지면 그 변의 이웃(볼 수 없던 이웃은 구독이 거절돼 있어 나타남을 못 본다 — neighbourTap.ts crossedNeighbour).
// - 옆 2차맵 유닛: 구독 중인 이웃의 유닛 움직임을 지금 2차맵 틀로 옮겨 지금 2차맵 유닛과 함께 엔진에 넣는다(unitMerge.ts).
// - 이웃 안개 = 그 2차맵 탐사 칸(구독 vision) ∪ 변 가까이 선 내 유닛 시야를 옆 틀로 옮긴 칸(neighbourSight.ts — 1초마다, 경계에서 잘리지 않게).
import type { SecondMapEngine, TerrainInput } from "@terra/engine";
import { serverLink } from "../net/serverLink.ts";
import { startBuildingLooks } from "./buildingLooks.ts";
import type { CommandReport, FeedSink, FeedStatus, MapFeed } from "./feedTypes.ts";
import { attachGatherOverlay } from "./gather/gatherOverlay.ts";
import { type GatherState, gatherSink } from "./gather/gatherState.ts";
import { type LeaderTagState, attachLeaderTags } from "./leaderTags.ts";
import { startMapFeed } from "./mapFeed.ts";
import { loadUnitGlance } from "./mapUnits.ts";
import type { NearbyState } from "./nearby/nearbyState.ts";
import {
  edgeExploredPoints,
  mainSightBits,
  neighbourSightBits,
  toMainFrame,
  unionBits,
} from "./neighbourSight.ts";
import { crossedNeighbour } from "./neighbourTap.ts";
import { startNeighbourVision } from "./neighbourVision.ts";
import { createUnitMerger } from "./unitMerge.ts";
import { startUnitModels, wantsUnitModels } from "./unitModels.ts";
import { createNeighbourLoader } from "./secondMapNeighbourLoader.ts";
import { neighbourSpots, viewMap, wantsAllNeighbours } from "./secondMapNeighbours.ts";
import { fetchTerrain } from "./terrainLoader.ts";

/** 자료 흐름 전(표시 종류 없음) */
const NO_KINDS: ReadonlyMap<number, string> = new Map();
/** 경계 너머 시야를 다시 셈하는 간격(ms) */
const SIGHT_TICK_MS = 1_000;
/** 기준 유닛이 사라졌는지 보는 간격(ms, 넘기 신호) */
const CROSS_TICK_MS = 250;

export interface MapSessionOptions {
  readonly engine: SecondMapEngine;
  readonly host: HTMLElement;
  readonly mapKey: number;
  readonly unitCapacity: number;
  readonly gather: GatherState;
  readonly nearby: NearbyState;
  readonly leaderTags: LeaderTagState;
  /** 카메라 범위 등이 엔진 앞에 끼우는 받는 쪽(useCameraArea) */
  readonly tap: (sink: FeedSink) => FeedSink;
  /** 운영자 모드(모든 유닛 명령·전체 보기 — 이웃 안개 구독도 하지 않는다) */
  readonly operator: () => boolean;
  readonly serverNow: () => number;
  /** 옆 2차맵에서 넘어왔으면 그때 가진 지형(옛 2차맵 포함) */
  readonly seed: ReadonlyMap<number, TerrainInput> | null;
  /** 카메라가 따라가는 기준 유닛 */
  readonly anchor: () => number | null;
  /** 기준 유닛이 이웃 2차맵에 나타났다 */
  readonly onArrived: (mapKey: number) => void;
  /** 지도자 이름표를 눌렀다. false면 고르지 않았다(남의 유닛 작은 창 — 엔진 고른 표시도 그대로 둔다) */
  readonly onPickLeader: (unitId: number) => boolean;
  readonly onStatus: (status: FeedStatus) => void;
  readonly onCommand: (report: CommandReport) => void;
}

export interface MapSession {
  readonly feed: MapFeed;
  /** 카메라가 바뀐 프레임마다(엔진 onView): 이웃 받기 */
  onView(camera: { readonly targetX: number; readonly targetZ: number }): void;
  /** 카메라 목표점이 있는 2차맵(지금 "0,0", 이웃이면 방향) — 화면 시험 표지 */
  viewMap(): string;
  /** 가진 지형(지금 2차맵 + 받은 이웃) — 옆 2차맵으로 넘을 때 다음 모음의 seed */
  carry(): Map<number, TerrainInput>;
  stop(): void;
}

export function startMapSession(options: MapSessionOptions): MapSession {
  const { engine, host, mapKey, gather, nearby } = options;
  let mapSizeM = 0;
  let mainTerrain: TerrainInput | null = null;
  let viewMapNow = "0,0";
  // 이웃 안개(WP-3): 카메라 쪽 이웃 2차맵을 구독해 탐사 칸을 이웃 지형에 칠한다(운영자 전체 보기면 구독하지 않는다 — 안개가 없다).
  // 기준 유닛이 그 이웃에 나타나면 넘어간다
  const spots = neighbourSpots(mapKey);
  /** 이웃 → 서버 탐사 칸(받은 것), 마지막으로 엔진에 넣은 안개(같으면 다시 넣지 않는다) */
  const serverBits = new Map<number, Uint8Array | null>();
  const shownBits = new Map<number, string>();
  let feedNow: MapFeed | null = null;
  /** 내 유닛의 지금 자리(배치 칸, 시야 전송의 내 유닛 표시) */
  const myPoints = (): { x: number; y: number }[] => {
    const points: { x: number; y: number }[] = [];
    if (!feedNow) return points;
    for (const id of feedNow.unitIds()) {
      if (!feedNow.isOwn(id)) continue;
      const unit = engine.unitState(id);
      if (unit) points.push({ x: unit.x, y: unit.y });
    }
    return points;
  };
  /** 지금 2차맵 서버 탐사 칸(받기 전 undefined, 전체 보기면 null)과 그 안개를 넣을 받는 쪽(자료 흐름의 다음 — 카메라 범위·엔진) */
  let mainServer: Uint8Array | null | undefined;
  let mainShown = "";
  let mainSink: FeedSink | null = null;
  /** 지금 2차맵 안개 = 서버 탐사 칸 ∪ 내 유닛 시야 ∪ 이웃들의 경계 탐사 칸을 이 틀로 넓힌 것(경계 이음) */
  const pushMainFog = (): void => {
    if (!mainSink || mainServer === undefined) return;
    if (mainServer === null) {
      if (mainShown !== "off") mainSink.setExplored(null);
      mainShown = "off";
      return;
    }
    // 내 유닛 시야(서버도 같은 규칙으로 밝힌다 — 기다리지 않고 같은 원으로) + 이웃들의 경계 탐사 칸
    const spread: { x: number; y: number }[] = myPoints();
    for (const [key, bits] of serverBits) {
      const spot = spots.find((item) => item.key === key);
      if (spot) spread.push(...toMainFrame(spot.placement, edgeExploredPoints(bits)));
    }
    const bits = unionBits(mainServer, mainSightBits(spread)) ?? mainServer;
    const signature = bits.join(",");
    if (signature === mainShown) return;
    mainShown = signature;
    mainSink.setExplored(bits);
  };
  /** 받은 이웃마다 안개 = 서버 탐사 칸 ∪ 내 유닛 시야(옆 틀) ∪ 지금 2차맵 경계 탐사 칸(옆 틀, 경계 이음) — 바뀐 것만 엔진에 */
  const refreshFog = (): void => {
    const points = [...myPoints(), ...edgeExploredPoints(mainServer ?? null)];
    pushMainFog();
    for (const key of neighbourLoader.terrains().keys()) {
      const spot = spots.find((item) => item.key === key);
      // 서버 답(탐사 칸·거절)을 받은 이웃만: 넘어온 직후 옛 2차맵(이웃이 됨)은 엔진이 그 탐사 칸을 들고 있다 — 시야만으로 덮어쓰지 않는다
      if (!spot || !serverBits.has(key)) continue;
      const bits = unionBits(serverBits.get(key) ?? null, neighbourSightBits(spot.placement, points));
      const signature = bits ? bits.join(",") : "";
      if (shownBits.get(key) === signature) continue;
      shownBits.set(key, signature);
      engine.setNeighbourExplored(String(key), bits);
    }
  };
  // 옆 2차맵 유닛을 지금 2차맵 틀로 옮겨 함께 그린다(구독 중인 이웃만 — 서버가 보낸 것: 내 시야 안·내 유닛)
  const merger = createUnitMerger();
  const neighbourVision = startNeighbourVision({
    link: serverLink,
    onUnitSet: (key, units, changed) => {
      const spot = spots.find((item) => item.key === key);
      if (!spot || units.size === 0) merger.clearNeighbour(key);
      else merger.setNeighbour(key, spot.placement, units, changed);
    },
    onExplored: (key, bits) => {
      serverBits.set(key, bits);
      refreshFog();
    },
    onUnits: (key, ids) => {
      const anchor = options.anchor();
      if (anchor !== null && ids.includes(anchor)) options.onArrived(key);
    },
  });
  const neighbourLoader = createNeighbourLoader({
    mapKey,
    all: wantsAllNeighbours(window.location.search),
    setNeighbours: (list) => engine.setNeighbours(list),
    fetchTerrain: (url) => fetchTerrain(url),
    onNear: (keys) => neighbourVision.want(options.operator() ? [] : keys),
    seed: options.seed,
  });
  // 지도자 이름표: 전송의 표시 종류(npc_leader)로 찾고 이름은 한눈 정보로. 누르면 지도에서 그 지도자를 누른 것과 같다. 채집 덧그림보다 먼저 붙인다
  // (누르기를 먼저 받고 위에 그린다 — 지도자는 적고 표시는 많다)
  const detachLeaders = attachLeaderTags(engine, host, options.leaderTags, {
    mapKey,
    kinds: () => feedNow?.unitKinds() ?? NO_KINDS,
    loadGlance: (key, unitId, signal) => loadUnitGlance(key, unitId, signal).then((answer) => answer.glance),
    // 화면이 고르지 않으면(남의 지도자 — 작은 창만 연다) 엔진 고른 표시도 옮기지 않는다. 옮기면 1초 요약이 그 지도자를 고른 유닛으로 맞춰
    // 다음 땅 누르기가 "내 유닛만 움직일 수 있습니다"가 됐다(2026-11-09 고침에서 빠진 길 — docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-10)")
    onPick: (unitId) => {
      if (options.onPickLeader(unitId)) engine.select(unitId);
    },
  });
  const detachGather = attachGatherOverlay(engine, host, gather, {
    mapKey,
    serverNow: options.serverNow,
    nearby,
  });
  // 유닛 3D 외형(unitModels.ts): 걷는 유닛에 외형을 붙여 엔진이 가까운 유닛을 모델로 그리게 한다(건물 겉모습 다음, 엔진 바로 앞)
  const unitModels = startUnitModels(engine, mapKey, { enabled: wantsUnitModels(window.location.search) });
  const looks = startBuildingLooks(unitModels.sink, mapKey, { onLooks: (rows) => nearby.setLooks(rows) });
  /** 지금 2차맵 탐사 칸을 가로채 경계 이음을 더해 넣는다 */
  const mainFogSink = (next: FeedSink): FeedSink => {
    mainSink = next;
    return {
      ...next,
      setExplored: (bits) => {
        mainServer = bits;
        mainShown = "";
        pushMainFog();
        refreshFog();
      },
    };
  };
  const feed = startMapFeed({
    link: serverLink,
    mapKey,
    // 자료 흐름: 채집 덧그림(건물) → 카메라 범위(탐사 비트) → 건물 겉모습(buildingLooks.ts) → 엔진
    sink: mainFogSink(merger.wrap(options.tap(gatherSink(looks.sink, gather)))),
    loadTerrain: async (url) => {
      const terrain = await fetchTerrain(url);
      mainTerrain = terrain;
      mapSizeM = terrain.cellSizeM * 128;
      // 배치 칸 한 변(m) = 2차맵 한 변 ÷ 256(근처 판 거리 글자)
      nearby.setCellM(mapSizeM / 256);
      neighbourLoader.setMain(url, mapSizeM);
      return terrain;
    },
    canCommand: options.operator,
    observe: options.operator,
    now: () => performance.now(),
    serverNow: options.serverNow,
    unitCapacity: options.unitCapacity,
    onStatus: options.onStatus,
    onCommand: options.onCommand,
  });
  feedNow = feed;
  let stopped = false;
  const sightTimer = setInterval(refreshFog, SIGHT_TICK_MS);
  // 기준 유닛의 마지막 자리: 변 바로 옆에서 사라지면 그 변의 이웃으로 넘어갔다
  let anchorLast: { id: number; x: number; y: number } | null = null;
  const crossTimer = setInterval(() => {
    const anchor = options.anchor();
    const unit = anchor === null ? null : engine.unitState(anchor);
    if (anchor !== null && unit) {
      anchorLast = { id: anchor, x: unit.x, y: unit.y };
      return;
    }
    if (anchor === null || anchorLast?.id !== anchor) return;
    const next = crossedNeighbour(mapKey, anchorLast);
    anchorLast = null;
    if (next !== null) options.onArrived(next);
  }, CROSS_TICK_MS);

  return {
    feed,
    onView(camera) {
      if (mapSizeM <= 0) return;
      neighbourLoader.onView(camera.targetX, camera.targetZ);
      viewMapNow = viewMap(camera.targetX, camera.targetZ, mapSizeM);
    },
    viewMap: () => viewMapNow,
    carry() {
      const terrains = neighbourLoader.terrains();
      if (mainTerrain) terrains.set(mapKey, mainTerrain);
      return terrains;
    },
    stop() {
      // 넘기와 화면 정리가 두 번 부를 수 있다
      if (stopped) return;
      stopped = true;
      clearInterval(sightTimer);
      clearInterval(crossTimer);
      neighbourLoader.stop();
      neighbourVision.stop();
      // 해제를 먼저 보낸다(엔진은 화면이 버린다)
      feed.stop();
      detachGather();
      detachLeaders();
      looks.stop();
      unitModels.stop();
    },
  };
}
