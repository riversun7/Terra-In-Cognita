// 2차맵 하나의 자료 잇기 — 2차맵 화면(SecondaryMapScreen.tsx)에서 나눴다(docs/adr/2026-11-08-seamless-second-map.md WP-3 로딩 없는 2차맵 이동).
// 엔진과 자료 흐름 모음(mapFeedPool.ts)은 화면이 한 번 만들어 계속 쓰고, 이 모음은 지금 2차맵마다 새로 켠다: 그 2차맵 흐름을 엔진에 붙이기·
// 건물 겉모습·채집 덧그림·지도자 이름표·이웃 지형 받기·이웃 흐름(안개·유닛). 옆 2차맵으로 넘으면 화면이 엔진을 rebase하고 이 모음을 멈춘 뒤
// 새 2차맵으로 다시 켠다 — 같은 작업 안에서(다음 프레임 전에) 한다. 흐름은 닫지 않고 받는 쪽만 바꾼다(다시 구독하지 않는다).
// - 넘기 신호: 기준 유닛이 붙여 둔 이웃 흐름에 새로 나타나면 onArrived(그 2차맵). 또 기준 유닛이 변 바로 옆에 있다가 지금 2차맵에서
//   사라지면 그 변의 이웃(볼 수 없던 이웃은 구독이 거절돼 있어 나타남을 못 본다 — neighbourTap.ts crossedNeighbour, unitMerge.ts onCarryGone).
// - 옆 2차맵 유닛·건물: 붙여 둔 이웃 흐름의 유닛 움직임·건물 바닥을 지금 2차맵 틀로 옮겨 지금 2차맵 것과 함께 엔진에 넣는다
//   (unitMerge.ts·buildingMerge.ts). 옆 2차맵 건물 겉모습은 한 번 받아 기억해 둔다(buildingLooks.ts — 넘은 직후에도 바로 붙는다).
// - 이웃 안개 = 그 2차맵 탐사 칸(흐름의 vision) ∪ 변 가까이 선 내 유닛 시야를 옆 틀로 옮긴 칸(neighbourSight.ts — 1초마다, 경계에서 잘리지 않게).
// 바뀜(2026-11-11, 사용자 지적 "미세한 화면전환의 흔적 근처에서 미리 불러와 완전히 자연스럽게"):
// - 넘을 때 넘겨받는 것(handover): 받아 둔 지형, 이어 보일 유닛(기준 유닛의 보이던 자리 — 새 틀로 옮긴 것). 새 자료가 올 때까지 남은 그림으로
//   두고 그 자리에서 잇는다(유닛이 비거나 한 칸 튀지 않는다).
// 바뀜(2026-11-12, 옆 2차맵 미리 띄우기 — ADR seamless-second-map "바뀜 (2026-11-12)"): 서버는 내 유닛이 변 가까이 오면 그 이웃을 미리 띄우고,
// 내 유닛 시야가 경계를 넘으면 그 몫을 볼 수 있게 한다(구독을 받는다). 그래서 거절된(unknown_map·not_visible) 이웃 흐름은 내 유닛 시야가 그
// 이웃에 닿거나 기준 유닛이 그 변으로 가는 동안 NEIGHBOUR_RETRY_MS마다 다시 구독해 본다(넘기 전에 지형·유닛·안개를 받는다).
// - 미리 받기: 이웃을 받기 시작하는 거리를 멀리 볼수록 넓히고(nearMarginM), 기준 유닛의 경로가 변에서 끝나면(변을 넘으러 간다) 그쪽 이웃 지형과
//   흐름을 바로 받는다(운영자 100배처럼 변까지 몇 초일 때). 운영자 모드도 이웃 흐름을 전체 보기로 붙인다(전에는 붙이지 않아 넘는 순간 유닛이 비었다).
import {
  type BuildingFootprint,
  type SecondMapEngine,
  type TerrainInput,
  invertPlacement,
} from "@terra/engine";
import { cachedLooks, prefetchLooks, startBuildingLooks, withLooks } from "./buildingLooks.ts";
import { createBuildingMerger } from "./buildingMerge.ts";
import type { CommandReport, FeedSink, FeedStatus, MapFeed } from "./feedTypes.ts";
import { attachGatherOverlay } from "./gather/gatherOverlay.ts";
import { type GatherState, gatherSink } from "./gather/gatherState.ts";
import { type LeaderTagState, attachLeaderTags } from "./leaderTags.ts";
import type { MapChannel, MapFeedPool } from "./mapFeedPool.ts";
import { probeEvent } from "./mapProbe.ts";
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
import { type CarriedUnit, createUnitMerger } from "./unitMerge.ts";
import { startUnitModels, wantsUnitModels } from "./unitModels.ts";
import { attachUnitNames } from "./unitNames.ts";
import { directionThroughPlacement, pathEnd, pointThroughPlacement } from "./unitBlend.ts";
import { type NeighbourLoader, createNeighbourLoader } from "./secondMapNeighbourLoader.ts";
import {
  nearMarginM,
  neighbourSpots,
  neighbourTerrainUrl,
  viewMap,
  wantsAllNeighbours,
} from "./secondMapNeighbours.ts";

/** 자료 흐름 전(표시 종류 없음) */
const NO_KINDS: ReadonlyMap<number, string> = new Map();
/** 경계 너머 시야를 다시 셈하는 간격(ms) */
const SIGHT_TICK_MS = 1_000;
/** 기준 유닛이 가는 쪽(경로 끝이 변)을 보는 간격(ms, 미리 받기) */
const HEADING_TICK_MS = 250;
/** 거절된 이웃 구독을 다시 해 보는 간격(ms) — 서버 구독 상한(분당 60번) 안: 이웃 3장이면 분당 36번 */
const NEIGHBOUR_RETRY_MS = 5_000;
/** 서버가 띄우거나 볼 수 있게 되면 바뀌는 거절(다시 해 본다) */
const REFUSED_FOR_NOW: ReadonlySet<string> = new Set(["unknown_map", "not_visible"]);
/** 함께 붙이는 이웃 흐름 수(지금 2차맵 + 3 = 서버 한 연결 상한 4) */
export const MAX_NEIGHBOUR_CHANNELS = 3;

/** 옆 2차맵으로 넘을 때 다음 모음에 넘기는 것 */
export interface MapHandover {
  /** 가진 지형(지금 2차맵 + 받은 이웃) — 다음 모음은 이 가운데 제 이웃을 다시 받지 않는다 */
  readonly terrains: ReadonlyMap<number, TerrainInput>;
  /** 넘기 전 지금 2차맵의 지형 주소(판 표지 — 새 2차맵 지형 주소를 만든다). 모르면 null */
  readonly mainUrl: string | null;
  /** 이어 보일 유닛(기준 유닛, 새 2차맵 틀로 옮긴 것). 없으면 null */
  readonly carried: CarriedUnit | null;
}

export interface MapSessionOptions {
  readonly engine: SecondMapEngine;
  readonly host: HTMLElement;
  readonly mapKey: number;
  /** 화면의 자료 흐름 모음(넘어도 그대로) */
  readonly pool: MapFeedPool;
  readonly unitCapacity: number;
  readonly gather: GatherState;
  readonly nearby: NearbyState;
  readonly leaderTags: LeaderTagState;
  /** 카메라 범위 등이 엔진 앞에 끼우는 받는 쪽(useCameraArea) */
  readonly tap: (sink: FeedSink) => FeedSink;
  readonly serverNow: () => number;
  /** 옆 2차맵에서 넘어왔으면 앞 모음이 넘긴 것 */
  readonly handover: MapHandover | null;
  /** 카메라가 따라가는 기준 유닛 */
  readonly anchor: () => number | null;
  /** 내 사이보그 유닛(이름표가 늘 보인다 — unitNames.ts). 없으면 null */
  readonly ownUnit?: () => number | null;
  /** 기준 유닛이 이웃 2차맵으로 넘어갔다 */
  readonly onArrived: (mapKey: number) => void;
  /** 받아 둔 이웃 지형이 엔진에 섰다(지형을 기다리던 넘기를 다시 해 본다) */
  readonly onNeighbourReady?: () => void;
  /** 지도자 이름표를 눌렀다. false면 고르지 않았다(남의 유닛 작은 창 — 엔진 고른 표시도 그대로 둔다) */
  readonly onPickLeader: (unitId: number) => boolean;
  readonly onStatus: (status: FeedStatus) => void;
  readonly onCommand: (report: CommandReport) => void;
}

export interface MapSession {
  readonly feed: MapFeed;
  /** 카메라가 바뀐 프레임마다(엔진 onView): 이웃 받기 */
  onView(camera: { readonly targetX: number; readonly targetZ: number; readonly distance: number }): void;
  /** 카메라 목표점이 있는 2차맵(지금 "0,0", 이웃이면 방향) — 화면 시험 표지 */
  viewMap(): string;
  /** 옆 2차맵 next로 넘을 때 다음 모음에 넘길 것(엔진 rebase 전에 부른다 — 기준 유닛의 보이던 자리를 지금 틀에서 읽는다). 멈추지는 않는다 */
  handover(next: number): MapHandover;
  /** 그 옆 2차맵을 미리 받는다(지형·흐름) — 가는 길의 다음 2차맵, 지형을 기다리는 넘기. 이 2차맵의 이웃이 아니면 false */
  prefetch(mapKey: number): boolean;
  /** 멈춘다(받는 쪽을 뗀다. 흐름은 닫지 않는다 — 화면이 모음을 닫는다) */
  stop(): void;
}

export function startMapSession(options: MapSessionOptions): MapSession {
  const { engine, host, mapKey, gather, nearby, pool, handover } = options;
  let mapSizeM = 0;
  let mainTerrain: TerrainInput | null = null;
  let mainUrl: string | null = null;
  let viewMapNow = "0,0";
  let stopped = false;
  const spots = neighbourSpots(mapKey);
  const spotOf = (key: number) => spots.find((item) => item.key === key);
  /** 이웃 → 서버 탐사 칸(받은 것. 거절·전체 보기면 null), 마지막으로 엔진에 넣은 안개(같으면 다시 넣지 않는다) */
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
      const spot = spotOf(key);
      if (spot) spread.push(...toMainFrame(spot.placement, edgeExploredPoints(bits)));
    }
    const bits = unionBits(mainServer, mainSightBits(spread)) ?? mainServer;
    const signature = bits.join(",");
    if (signature === mainShown) return;
    mainShown = signature;
    mainSink.setExplored(bits);
  };
  /** 이웃 지형 받기(아래에서 만든다 — 안개 셈이 받은 이웃을 읽는다) */
  let loader: NeighbourLoader | null = null;
  /** 받은 이웃마다 안개 = 서버 탐사 칸 ∪ 내 유닛 시야(옆 틀) ∪ 지금 2차맵 경계 탐사 칸(옆 틀, 경계 이음) — 바뀐 것만 엔진에 */
  const refreshFog = (): void => {
    if (stopped) return;
    const points = [...myPoints(), ...edgeExploredPoints(mainServer ?? null)];
    pushMainFog();
    for (const key of loader?.terrains().keys() ?? []) {
      const spot = spotOf(key);
      // 서버 답(탐사 칸·거절)을 받은 이웃만: 넘어온 직후 옛 2차맵(이웃이 됨)은 엔진이 그 탐사 칸을 들고 있다 — 시야만으로 덮어쓰지 않는다
      if (!spot || !serverBits.has(key)) continue;
      const bits = unionBits(serverBits.get(key) ?? null, neighbourSightBits(spot.placement, points));
      const signature = bits ? bits.join(",") : "";
      if (shownBits.get(key) === signature) continue;
      shownBits.set(key, signature);
      engine.setNeighbourExplored(String(key), bits);
    }
  };
  /** 넘기 신호는 받던 자료 묶음이 끝난 뒤에 알린다(받는 쪽을 묶음 가운데서 바꾸지 않게) — 다음 프레임보다는 먼저다 */
  const arrive = (key: number): void => {
    queueMicrotask(() => {
      if (!stopped) options.onArrived(key);
    });
  };
  // 옆 2차맵 유닛을 지금 2차맵 틀로 옮겨 함께 그린다(붙여 둔 이웃 흐름 — 서버가 보낸 것: 내 시야 안·내 유닛, 전체 보기면 모두)
  const merger = createUnitMerger({
    capacity: options.unitCapacity,
    unitAt: (id) => engine.unitState(id),
    now: options.serverNow,
    carry: options.anchor,
    // 기준 유닛이 변 바로 옆에서(또는 변에서 끝나는 길을 걷다가) 사라졌다 = 그 변의 이웃으로 넘어갔다(남은 그림으로 이어 보이고 화면이 넘는다).
    // 빠른 유닛(운영자 100배)은 화면에 보이던 자리가 변에 못 미쳐도 서버에서는 이미 넘었다 — 걷던 길의 끝으로도 본다
    // 그 이웃을 서버가 띄우지 않았다고 했으면(구독 답 unknown_map) 바로 넘지 않고 다시 구독해 본다: 목적지라 방금 띄웠으면(WP15) 열리고 그때
    // 넘는다. 여전히 없으면 유닛은 그 2차맵을 건너뛰는 중이다(WP11 593 나 — 변 끝에서 사라졌다가 다음 띄운 2차맵에 나타난다): 넘지 않는다 —
    // 열 수 없는 2차맵으로 화면을 넘기면 "아직 열려 있지 않습니다" 안내만 떴다. 나타나면 길 조회가 알린다
    onCarryGone: (_unitId, last, goal) => {
      const next =
        crossedNeighbour(mapKey, last, spots) ?? (goal ? crossedNeighbour(mapKey, goal, spots) : null);
      const neighbour = next === null ? undefined : attached.get(next);
      const phase = neighbour?.feed.status().phase ?? null;
      const unloaded = phase?.kind === "failed" && phase.code === "unknown_map";
      probeEvent(`gone ${mapKey} -> ${String(next)}${unloaded ? " (not loaded: asking again)" : ""}`);
      if (next === null) return false;
      if (unloaded && neighbour) {
        awaited = next;
        neighbour.feed.retry();
        return true;
      }
      arrive(next);
      return true;
    },
  });
  const neighbourLoader = createNeighbourLoader({
    mapKey,
    all: wantsAllNeighbours(window.location.search),
    setNeighbours: (list) => engine.setNeighbours(list),
    fetchTerrain: (url) => pool.loadTerrain(url),
    onNear: (keys) => {
      nearKeys = keys;
      syncChannels();
    },
    onChange: () => {
      refreshFog();
      if (!stopped) options.onNeighbourReady?.();
    },
    seed: handover?.terrains ?? null,
  });
  loader = neighbourLoader;

  const buildings = createBuildingMerger((list) => engine.setBuildings(list));

  // ---------- 이웃 흐름(안개·유닛·건물·넘기 신호) ----------
  /** 카메라 쪽 이웃, 기준 유닛이 가는 쪽 이웃, 따로 바란 이웃(prefetch) */
  let nearKeys: readonly number[] = [];
  let headingKeys: readonly number[] = [];
  let extraKeys: readonly number[] = [];
  const attached = new Map<number, MapChannel>();
  /** 기준 유닛이 넘어갔을 이웃인데 서버가 띄우지 않았다고 했던 것: 다시 구독한 답을 기다린다(열리면 넘는다) */
  let awaited: number | null = null;
  const attachNeighbour = (key: number): void => {
    const spot = spotOf(key);
    if (!spot || attached.has(key)) return;
    const channel = pool.open(key);
    if (!channel) return;
    attached.set(key, channel);
    const units = merger.neighbourSink(key, spot.placement);
    /** 그 2차맵 건물(그 틀의 바닥)을 기억해 둔 겉모습과 함께 지금 틀로 넣는다 */
    let buildingList: readonly BuildingFootprint[] = [];
    const pushBuildings = (): void =>
      buildings.setNeighbour(key, spot.placement, withLooks(buildingList, cachedLooks(key)));
    // 기준 유닛이 그 2차맵 목록에 있나(붙일 때 이미 있던 것은 넘기 신호가 아니다 — 방금 떠나온 2차맵에 아직 남은 줄)
    let present = false;
    let replaying = true;
    channel.attach({
      // 이웃 지형은 이웃 지형 받기가 그린다
      setTerrain: () => Promise.resolve(),
      setUnits: (list) => {
        units.setUnits(list);
        const anchor = options.anchor();
        const here = anchor !== null && list.some((unit) => unit.id === anchor);
        if (here && !present && !replaying) {
          probeEvent(`seen ${mapKey} -> ${key}`);
          arrive(key);
        }
        present = here;
      },
      setUnitPath: units.setUnitPath,
      // 옆 2차맵 건물도 그린다(넘는 순간 나타나지 않게). 겉모습은 한 번 받아 붙인다
      setBuildings: (list) => {
        buildingList = list;
        pushBuildings();
        if (list.length > 0)
          void prefetchLooks(key).then((fresh) => {
            if (fresh && !stopped && attached.get(key) === channel) pushBuildings();
          });
      },
      setExplored: (bits) => {
        serverBits.set(key, bits);
        refreshFog();
      },
      select: () => undefined,
      selected: () => null,
      // 구독이 거절되면(볼 수 없는 2차맵) 탐사 칸이 없는 것과 같다 — 온통 어둡게
      onStatus: (status) => {
        if (awaited === key && status.phase.kind === "live") {
          awaited = null;
          probeEvent(`opened ${mapKey} -> ${key}`);
          arrive(key);
        } else if (awaited === key && status.phase.kind === "failed") {
          // 여전히 없다: 건너뛰는 중 — 남은 그림을 거둔다
          awaited = null;
          merger.dropGhost();
        }
        if (status.phase.kind !== "failed" || serverBits.has(key)) return;
        serverBits.set(key, null);
        refreshFog();
      },
    });
    replaying = false;
  };
  /** 이웃마다 마지막으로 다시 구독해 본 시각 */
  const retriedAt = new Map<number, number>();
  /** 거절된 이웃 흐름을 다시 구독해 본다: 내 유닛 시야가 그 이웃에 닿거나(서버가 경계 너머 시야로 받는다) 기준 유닛이 그 변으로 간다 */
  const retryRefused = (): void => {
    if (stopped) return;
    const at = Date.now();
    const points = myPoints();
    for (const [key, neighbour] of attached) {
      const phase = neighbour.feed.status().phase;
      if (phase.kind !== "failed" || !REFUSED_FOR_NOW.has(phase.code) || awaited === key) continue;
      const spot = spotOf(key);
      if (!spot || at - (retriedAt.get(key) ?? 0) < NEIGHBOUR_RETRY_MS) continue;
      if (!headingKeys.includes(key) && neighbourSightBits(spot.placement, points) === null) continue;
      retriedAt.set(key, at);
      probeEvent(`retry ${mapKey} -> ${key} (${phase.code})`);
      neighbour.feed.retry();
    }
  };
  /** 붙일 이웃을 맞춘다: 가는 쪽 → 따로 바란 것 → 카메라 쪽 차례로 MAX_NEIGHBOUR_CHANNELS장까지. 빠진 흐름은 닫는다(구독 해제) */
  const syncChannels = (): void => {
    if (stopped) return;
    const want = [...new Set([...headingKeys, ...extraKeys, ...nearKeys])]
      .filter((key) => spotOf(key) !== undefined)
      .slice(0, MAX_NEIGHBOUR_CHANNELS);
    for (const [key, channel] of attached) {
      if (want.includes(key)) continue;
      channel.attach(null);
      attached.delete(key);
      merger.clearNeighbour(key);
      buildings.clearNeighbour(key);
    }
    pool.keep([mapKey, ...want]);
    for (const key of want) attachNeighbour(key);
  };

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
  // 유닛 3D 외형(unitModels.ts): 유닛에 외형·몸을 붙여 엔진이 가까운 유닛을 모델로 그리게 한다(엔진 바로 앞). 붙은 옆 2차맵 유닛도 같이 묻는다
  const unitModels = startUnitModels(engine, mapKey, {
    enabled: wantsUnitModels(window.location.search),
    neighbours: () => [...attached.keys()],
    onLabels: () => engine.requestFrame(),
  });
  // 유닛 이름표(unitNames.ts): 내 사이보그·고른 유닛은 늘, 다른 유닛은 가까이 볼 때만. 지도자는 지도자 이름표가 그린다
  const detachNames = attachUnitNames(engine, host, {
    labels: unitModels.labels,
    own: () => options.ownUnit?.() ?? null,
    isLeader: (unitId) => options.leaderTags.isLeader(unitId),
  });
  const modelSink = unitModels.sink;
  // 건물: 지금 2차맵 건물(겉모습을 붙인 것) + 옆 2차맵 건물을 함께 엔진에. 유닛은 외형을 붙이는 쪽을 거쳐 엔진에
  const engineSink: FeedSink = {
    setTerrain: (terrain) => modelSink.setTerrain(terrain),
    setUnits: (list) => modelSink.setUnits(list),
    setUnitPath: (id, path) => modelSink.setUnitPath(id, path),
    setBuildings: (list) => buildings.setMain(list),
    setExplored: (bits) => modelSink.setExplored(bits),
    select: (id) => modelSink.select(id),
    selected: () => modelSink.selected(),
  };
  const looks = startBuildingLooks(engineSink, mapKey, {
    onLooks: (rows) => nearby.setLooks(rows),
    // 유닛 발밑 나라 색 고리는 건물 깃발과 같은 국가 색 번호를 쓴다(질문 963 나)
    onFactions: (list) => unitModels.setFactions(list),
  });
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
  /** 지금 2차맵 지형을 알았다: 크기·근처 판 거리·이웃 받기 */
  const noteTerrain = (url: string, terrain: TerrainInput): void => {
    mainTerrain = terrain;
    mainUrl = url;
    mapSizeM = terrain.cellSizeM * 128;
    // 배치 칸 한 변(m) = 2차맵 한 변 ÷ 256(근처 판 거리 글자)
    nearby.setCellM(mapSizeM / 256);
    neighbourLoader.setMain(url, mapSizeM);
  };

  // ---------- 지금 2차맵 흐름 ----------
  // 살아 있는 흐름 가운데 이 2차맵과 그 이웃(많아야 MAX_NEIGHBOUR_CHANNELS장)만 남긴다 — 이 2차맵 흐름이 아직 없어도 열 자리가 있다
  const carriedKeys = pool
    .keys()
    .filter((key) => key !== mapKey && spotOf(key) !== undefined)
    .slice(0, MAX_NEIGHBOUR_CHANNELS);
  pool.keep([mapKey, ...carriedKeys]);
  const channel = pool.open(mapKey);
  if (!channel) throw new Error("map feed pool is full");
  const feed = channel.feed;
  feedNow = feed;
  // 자료 흐름: 경계 이음 안개 → 유닛 합치기 → 카메라 범위(탐사 비트) → 채집 덧그림(건물) → 건물 겉모습(buildingLooks.ts) → 엔진
  const chain = mainFogSink(merger.wrap(options.tap(gatherSink(looks.sink, gather))));
  // 넘어왔으면: 이어 보일 유닛을 먼저 넣고(남은 그림 — 새 자료가 그 자리에서 잇는다), 넘겨받은 지형으로 이웃 받기를 바로 켠다
  if (handover?.carried) merger.carryIn(handover.carried);
  if (handover && !channel.terrain()) {
    const seeded = handover.terrains.get(mapKey);
    const url = handover.mainUrl === null ? null : neighbourTerrainUrl(handover.mainUrl, mapKey);
    if (seeded && url) noteTerrain(url, seeded);
  }
  // 볼 수 없어 거절됐던 이웃이면(내 유닛이 이제 들어섰다) 다시 구독한다 — 상태 알림보다 먼저(거절 안내가 뜨지 않게)
  if (feed.status().phase.kind === "failed") feed.retry();
  channel.attach({
    ...chain,
    onStatus: options.onStatus,
    onCommand: options.onCommand,
    onTerrain: noteTerrain,
  });
  // 살아 있는 이웃 흐름은 바로 붙인다(방금 떠나온 2차맵 유닛·건물이 비지 않게). 카메라가 움직이면 카메라 쪽 것으로 맞춘다
  nearKeys = carriedKeys;
  syncChannels();

  const sightTimer = setInterval(() => {
    refreshFog();
    retryRefused();
  }, SIGHT_TICK_MS);
  // 기준 유닛의 경로가 변 바로 옆에서 끝나면(변을 넘으러 간다) 그쪽 이웃 지형·흐름을 카메라와 상관없이 미리 받는다
  const headingTimer = setInterval(() => {
    const anchor = options.anchor();
    const path = anchor === null ? null : merger.mainPath(anchor);
    const end = path ? pathEnd(path) : null;
    const next = end ? crossedNeighbour(mapKey, end, spots) : null;
    const keys = next === null ? [] : [next];
    if (keys.join(",") === headingKeys.join(",")) return;
    headingKeys = keys;
    neighbourLoader.want([...headingKeys, ...extraKeys]);
    syncChannels();
  }, HEADING_TICK_MS);

  return {
    feed,
    onView(camera) {
      if (mapSizeM <= 0) return;
      neighbourLoader.onView(camera.targetX, camera.targetZ, nearMarginM(mapSizeM, camera.distance));
      viewMapNow = viewMap(camera.targetX, camera.targetZ, mapSizeM);
    },
    viewMap: () => viewMapNow,
    handover(next) {
      const terrains = neighbourLoader.terrains();
      if (mainTerrain) terrains.set(mapKey, mainTerrain);
      const spot = spotOf(next);
      const out = spot ? merger.carryOut() : null;
      // 지금 틀 → 새 2차맵 틀(그 이웃 놓는 자리의 역)
      const back = spot ? invertPlacement(spot.placement) : null;
      const carried: CarriedUnit | null =
        out && back
          ? {
              ...out,
              at: pointThroughPlacement(out.at, back),
              heading: out.heading ? directionThroughPlacement(out.heading, back) : null,
            }
          : null;
      return { terrains, mainUrl, carried };
    },
    prefetch(key) {
      if (spotOf(key) === undefined) return false;
      if (stopped || extraKeys.includes(key)) return true;
      extraKeys = [key];
      neighbourLoader.want([...headingKeys, ...extraKeys]);
      syncChannels();
      return true;
    },
    stop() {
      // 넘기와 화면 정리가 두 번 부를 수 있다
      if (stopped) return;
      stopped = true;
      clearInterval(sightTimer);
      clearInterval(headingTimer);
      neighbourLoader.stop();
      merger.stop();
      // 받는 쪽을 뗀다(흐름은 계속 받아 기억한다 — 다음 모음이 다시 붙인다)
      channel.attach(null);
      for (const neighbour of attached.values()) neighbour.attach(null);
      attached.clear();
      detachGather();
      detachLeaders();
      detachNames();
      looks.stop();
      unitModels.stop();
    },
  };
}
