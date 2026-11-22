// 2차맵 사이 이동 서비스 — docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동"·"WP11 이동 2", 기획 D-197(1차맵은 좌표·명령만, 유닛은 실제
// 2차맵을 지나간다)·D-6019·D-6021(대상 → 명령 → 파티 → 확인 → 확정)·질문 571 가·590 나·591 나·593 나.
// - 서버 권위: 지나는 2차맵 줄·넘는 자리·2차맵마다의 길을 서버가 정한다(route.ts). 기기는 목적 2차맵·칸·명령 종류만 보낸다.
// - 걷기: 지금 2차맵 안에서는 그 2차맵의 길 찾기(경로 워커, moveUnit)로 변 끝 칸까지 걷는다. 넘는 자리는 목적지로 곧은 선이 변을 지나는
//   자리(590 나). 그 움직임의 도착 시각에 확인해서 그대로면 옆 2차맵으로 넘긴다(transferOut → transferIn: 유닛 행은 새 2차맵 키로 같은 쓰기 묶음,
//   지나는 2차맵마다 실제 유닛이라 그곳 시야·조우가 있다). 마지막 2차맵에서는 목표 칸 둘레의 설 칸까지 걷는다.
// - 건너뛰기(593 나): 다음 2차맵을 서버가 띄우지 않았으면 변 끝에서 사라지고(유닛 행은 이 서비스가 들고, DB 행은 사라진 자리 그대로),
//   곧은 거리 ÷ 속도 뒤 다음 띄운 2차맵의 변에 나타난다. 그동안 직무·시야·전투에서 빠진다. 도중 습격(610 나, raid.ts): 숨길 때 건너뛰는
//   2차맵마다 확률로 굴리고, 났으면 나타난 자리에서 빨리감기 전투 — 지면 부상으로 그 자리에 멈춘다(raided).
// - 정찰(591 나): 목표에 닿으면 출발한 자리로 돌아온다(줄·목표를 돌아오는 길로 바꾼다). 지나간 2차맵마다 걸은 자리의 시야를 탐사 기록에
//   남긴다(구독하지 않아도 — U3: 한 칸이라도 탐사하면 그 2차맵을 볼 수 있다). 이동도 같은 기록을 남긴다(내 유닛의 시야다).
// - 넘기 직전에 그 주인을 정산한다: 넘기 전까지 한 일은 떠나는 2차맵 몫이고, 다음 정산이 "유닛이 시설의 2차맵에 없다"로 직무 배치를 풀고
//   노동 계약을 끝낸다(질문 582 "지금 코드" 그대로 — 떠난 시각에 끝난다).
// - 길에서 벗어남: 확인할 때 유닛이 없거나 움직임이 바뀌었으면(다른 이동 명령·전투 뒤 안전한 곳·사망) 멈춤(interrupted). 멈추기 명령은 그 자리에
//   세운다(건너뛰는 중이면 다음 띄운 2차맵에 나타난 자리에서). 같은 유닛에 새 보내기가 오면 앞 길을 버리고 새 길로 간다.
// - 저장: world_travels(유닛당 한 줄, 끝나면 지운다). 다시 켜면 유닛이 있는 2차맵부터 그 구간을 다시 시작한다(경로를 다시 찾는다). 건너뛰던
//   유닛은 사라진 자리에 다시 놓이므로 다시 숨기고 남은 시간을 기다린다.
// - 끝난 길(도착·멈춤)은 RECENT_MS 동안 메모리에서 보인다(화면이 "도착했습니다"를 띄운다). 저장하지 않는다.
// - 좌표 이동(기획 D-559 1619, docs/adr/2026-11-15-unloaded-second-maps.md — WP15의 "닿을 때 띄우고 상한이면 map_full"을 대체): 이동은 2차맵을
//   띄우지 않는다. 목적 2차맵이 띄우지 않은 것이면 마지막 구간이 목표 칸까지 곧은 선이고, 닿으면 그 칸의 좌표 유닛(서 있음, parked.ts)이 된다.
//   좌표 유닛을 보내면 그 자리에서 바로 좌표 이동을 시작한다(hopFrom adjacent). 가는 중 멈추기 = 지금 좌표에 선다. 띄우지 않은 목적지에서 도중
//   습격이 나면 그 2차맵을 띄워 싸운다(전투 = 띄우는 까닭). 좌표 유닛도 유지비를 낸다(coordinateUnits — 정산이 더한다).
// - 바다 건너기(기획 D-541 1283 나, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)"): 배(영역 sea)도 같은 길로 간다. 설 칸 = 물 칸(물 격자 —
//   넘는 자리는 두 2차맵 모두 물인 변 칸), 승객은 배와 함께 넘는다(transferOut의 riders). 승객에게 보낸 길은 그 배의 길이다.
//   먼 바다(기획 D-553 1329, D-559 1619 기획 해석 "실제로 항해 = 실제 길·시간, 매번 띄운다는 뜻이 아님"): 띄우지 않은 지나는 2차맵이 행성 값으로
//   바다(물 비트 WATER_OCEAN — attachSea)면 길에 넣고, 좌표로 항해한다(걷는 유닛의 건너뛰기와 같다). 바다가 아닌 2차맵이 끼면 no_route(가는 중에
//   바뀌었으면 멈춘다). 바다 습격 표는 해상 전투 때(1330 가) — 배는 도중 습격을 굴리지 않는다.
import {
  type CellPoint,
  type Motion,
  type Point,
  type SizeClass,
  anchorAt,
  anchorCenter,
  arrivalAt,
  positionAt,
} from "@terra/sim";
import type { TravelKind } from "@terra/protocol";
import type { WorldTravelStop } from "@terra/shared/worldMap";
import { lastPoint } from "../world/mapGeometry.ts";
import { UNIT_KIND_BOT } from "../world/unitKinds.ts";
import type { TransferRow } from "../world/secondMapRows.ts";
import type { SecondMap } from "../world/secondMap.ts";
import {
  type Hop,
  type RouteContext,
  type Standable,
  anchorOf,
  entryOf,
  hopFrom,
  hopPlace,
  legGoal,
  mapRoute,
  planLegs,
  routeContext,
  sideToward,
  standNear,
  travelMs,
} from "./route.ts";
import {
  type Finished,
  type Hidden,
  type Journey,
  type TravelCommandResult,
  type TravelDeps,
  type TravelService,
  type TravelTarget,
  type TravelView,
  commandCode,
  fail,
  pathPoints,
  startCode,
  stopOf,
} from "./serviceTypes.ts";
import { haltJourneys } from "./haltOn.ts";
import { createNpcListeners, createNpcMethods } from "./npcJourney.ts";
import { createParkedBook } from "./parked.ts";
import { createPlanner, routePlan } from "./planner.ts";
import { raidSeed } from "./raid.ts";
import { createTeleport } from "./teleport.ts";
import { type UnitInfo, fitCell, standsOn, travelEta, travelView, walkSpeed } from "./serviceParts.ts";
import {
  carriesUnit,
  coordMetrics,
  coordinateRows,
  hiddenAtOf,
  parkedAtOf,
  touchesMap,
} from "./coordReads.ts";
import { hopPaceDistance } from "./coordPace.ts";
import { restoreTravels } from "./restore.ts";
import { travelWriter } from "./store.ts";
import { parkMapUnits, parkableMap, placeFinder } from "./unloadPark.ts";
import { returningAt } from "../world/unitCondition.ts";

export { walkSpeed } from "./serviceParts.ts";
export type {
  CoordinateUnit,
  HaltedTrip,
  HiddenPlace,
  TravelCommandResult,
  TravelDeps,
  TravelPlanResult,
  TravelService,
  TravelTarget,
  TravelView,
} from "./serviceTypes.ts";

/** 끝난 길을 화면에 보이는 시간(ms) */
export const RECENT_MS = 10 * 60_000;
/** 길 찾기가 밀렸을 때(busy) 그 구간을 다시 해 보기까지(ms, 다음 구간·부팅 복구만 — 보내기 명령은 busy로 답한다) */
export const RETRY_MS = 2_000;
/** setTimeout 지연 상한(약 24.8일). 더 먼 확인은 깨어나서 다시 건다 */
const MAX_TIMER_MS = 0x7fff_ffff;

export function createTravelService(deps: TravelDeps): TravelService {
  const { maps, now, log } = deps;
  const journeys = new Map<number, Journey>();
  const recent = new Map<number, Finished>();
  const store = travelWriter(deps.writer, deps.planetId);
  const standable: Standable = (mapKey, cell, size) =>
    maps.get(mapKey)?.isStandable(cell.x, cell.y, size) ?? false;
  const loaded = (mapKey: number): boolean => maps.has(mapKey);
  /** 좌표 유닛 장부(서 있음, parked.ts) */
  const parked = createParkedBook(deps.writer);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let raids = deps.raids;
  let spawn = deps.spawn;
  let isSea: ((mapKey: number) => boolean) | undefined;
  let counts = { parks: 0, lands: 0 };
  /** 좌표 구간의 2차맵 걸음 배율(‰, coordPace.ts — 행성 값). 없으면 1000(곧은 선 ÷ 걷기 속도) */
  let paceOf: ((mapKey: number) => number) | undefined;
  /** NPC 이동 끝남 알림(npcJourney.ts) */
  const npcDone = createNpcListeners(log);
  /** NPC 휴먼이 아직 있나(restoreNpc가 붙인다 — 건너뛰는 동안 죽은 봇은 나타나지 않는다) */
  let npcAlive: ((unitId: number) => boolean) | undefined;
  /** 좌표 조우 전투가 끝날 때까지 내리지 않을 2차맵 → 그 시각(encounter.ts) */
  const held = new Map<number, number>();
  /** 배가 건너뛸 수 있나: 띄운 2차맵이거나(지나며 물 변을 다시 본다) 행성 값이 바다 */
  const seaPassable = (mapKey: number): boolean => maps.has(mapKey) || isSea?.(mapKey) === true;
  /** 설 칸 시험(걷는 유닛 = 땅, 배 = 물) */
  const standableFor =
    (sea: boolean): Standable =>
    (mapKey, cell, size) => {
      const map = maps.get(mapKey);
      return map ? standsOn(map, cell, size, sea) : false;
    };
  /** 보낼 수 있는 목적지: 띄운 2차맵이거나 이 행성의 2차맵 키(좌표 이동 — 띄우지 않는다) */
  const isTarget = (mapKey: number): boolean => maps.has(mapKey) || spawn?.canOpen(mapKey) === true;
  const planner = createPlanner({
    maps,
    parked,
    journeys,
    deps,
    now,
    isTarget,
    seaPassable: (key) => seaPassable(key),
  });
  const { locate, ownUnit, planFor, planStandable, routeLoaded } = planner;
  const contextOf = (
    journey: Pick<Journey, "route" | "target" | "sea">,
    size: SizeClass,
    from = 0,
  ): RouteContext =>
    routeContext(
      journey.route.slice(from),
      journey.target,
      size,
      planStandable(journey.sea === true),
      loaded,
    );

  /**
   * 좌표 구간 하나에 걸리는 시간(ms): 곧은 거리 × 지나는 2차맵 지형 배율 평균 ÷ 속도(D-564 1643, coordPace.ts). route = 그 hop이 가리키는 줄
   * (route[hop.from..hop.to]). 배는 배율 없이(구간 빠르기 ADR 2절)
   */
  const hopMs = (
    journey: Pick<Journey, "sea">,
    route: readonly number[],
    hop: Pick<Hop, "from" | "to" | "distance">,
    speed: number,
  ): number =>
    travelMs(
      journey.sea === true || !paceOf ? hop.distance : hopPaceDistance(route, hop, paceOf, loaded),
      speed,
    );

  const arm = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (stopped) return;
    let next: number | undefined;
    for (const journey of journeys.values())
      if (journey.checkAtMs !== null && (next === undefined || journey.checkAtMs < next))
        next = journey.checkAtMs;
    if (next === undefined) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        runDue();
      },
      Math.min(MAX_TIMER_MS, Math.max(0, next - now())),
    );
    timer.unref();
  };

  const schedule = (journey: Journey, atMs: number): void => {
    journey.checkAtMs = atMs;
    arm();
  };

  /** 건너뛰는 중인 자리(사라진 점 → 나타날 점을 지난 시간만큼) */
  const hiddenPlace = (journey: Journey, hidden: Hidden) => {
    const span = Math.max(1, hidden.untilMs - hidden.startMs);
    const progress = (now() - hidden.startMs) / span;
    return hopPlace(contextOf(journey, hidden.size), hidden.hop, hidden.exit, progress);
  };

  const viewOf = (
    journey: Journey,
    state: TravelView["state"],
    stop: WorldTravelStop | null,
    arriveAt: number,
  ): TravelView => {
    const spot = journey.hidden ? undefined : parked.get(journey.unitId);
    // 좌표로 가는 중이면 곧은 선 위 자리, 좌표 유닛으로 섰으면 그 자리
    const place = journey.hidden
      ? hiddenPlace(journey, journey.hidden)
      : spot
        ? { mapKey: spot.row.mapKey, cell: spot.cell }
        : null;
    const info = maps.get(journey.route[journey.leg] ?? -1)?.unitInfo(journey.unitId);
    return travelView(journey, state, stop, arriveAt, place, info, now());
  };

  const prune = (): void => {
    const cutoff = now() - RECENT_MS;
    for (const [unitId, finished] of recent) if (finished.view.arriveAt < cutoff) recent.delete(unitId);
  };

  /** 들고 있던(건너뛰던) 유닛을 사라진 자리 둘레에 다시 세운다. 세웠으면 true */
  const putBack = (journey: Journey, hidden: Hidden): boolean => {
    const fromKey = journey.route[hidden.hop.from] ?? -1;
    const back = maps.get(fromKey);
    const exit = anchorOf(hidden.exit, hidden.size);
    if (!back) {
      // 띄우지 않은 2차맵에서 떠난 좌표 이동: 떠난 자리의 좌표 유닛으로 되돌린다
      park(hidden.row, fromKey, exit);
      journey.hidden = null;
      journey.hiddenUntilMs = null;
      journey.leg = hidden.hop.from;
      return true;
    }
    const sea = journey.sea === true;
    const spot = standsOn(back, exit, hidden.size, sea)
      ? exit
      : standNear(back.mapKey, exit, hidden.size, sea ? standableFor(true) : standable);
    if (!spot || !back.transferIn(hidden.row, spot.x, spot.y, journey.npc)) return false;
    journey.hidden = null;
    journey.hiddenUntilMs = null;
    journey.leg = hidden.hop.from;
    return true;
  };

  /** 길을 끝낸다(도착·멈춤): 줄을 지우고 최근 목록에 둔다 */
  const finish = (journey: Journey, state: "arrived" | "stopped", stop: WorldTravelStop | null): void => {
    if (journeys.get(journey.unitId) !== journey) return;
    // 건너뛰던 유닛을 버리지 않는다(드묾 — 오류로 끝날 때): 사라진 자리로 되돌린다. 못 하면 DB 행이 그 자리라 다시 켜면 돌아온다
    if (journey.hidden && !putBack(journey, journey.hidden))
      log.error({ unitId: journey.unitId }, "travel: hidden unit could not be put back");
    journeys.delete(journey.unitId);
    journey.seq += 1;
    journey.checkAtMs = null;
    store.remove(journey.unitId);
    if (journey.npc === true) {
      // NPC 이동: 스스로 걷기를 다시 켜고 알린다(화면 목록에는 두지 않는다)
      const map = journey.hidden ? undefined : locate(journey.unitId)?.map;
      map?.holdRoam(journey.unitId, false);
      npcDone.emit({ unitId: journey.unitId, state, stop, mapKey: map?.mapKey });
    } else
      recent.set(journey.unitId, { ownerId: journey.ownerId, view: viewOf(journey, state, stop, now()) });
    prune();
    if (state === "stopped")
      log.info({ unitId: journey.unitId, leg: journey.leg, stop }, "travel stopped before arriving");
  };

  /** 걸은 자리의 시야를 보낸 사용자의 탐사 기록에 남긴다(591 나 — 구독하지 않아도) */
  const explore = (journey: Journey, map: SecondMap, motion: Motion): void => {
    const { userId } = journey;
    if (userId === null) return;
    map.vision.explore(userId, pathPoints(motion, now())).catch((error: unknown) => {
      log.error({ err: error, unitId: journey.unitId }, "travel: exploration record failed");
    });
  };

  /** 지금 구간을 시작한다: 다음 2차맵 쪽 변 끝 칸(마지막이면 목표 둘레 설 칸)까지 그 2차맵 길 찾기로 걷는다 */
  const beginLeg = async (journey: Journey, retryBusy: boolean): Promise<TravelCommandResult> => {
    journey.seq += 1;
    const seq = journey.seq;
    journey.motion = null;
    journey.checkAtMs = null;
    const mapKey = journey.route[journey.leg];
    const map = mapKey === undefined ? undefined : maps.get(mapKey);
    const info = map?.unitInfo(journey.unitId);
    if (mapKey === undefined || !map || !info) {
      finish(journey, "stopped", "interrupted");
      return fail("unknown_unit");
    }
    const at = now();
    const position = positionAt(info.motion, at);
    const goal = legGoal(contextOf(journey, info.size, journey.leg), 0, position);
    if (goal.kind === "blocked") {
      finish(journey, "stopped", "blocked");
      return fail(goal.problem);
    }
    const cell = goal.kind === "stand" ? goal.cell : goal.exit;
    const here = anchorAt(position, info.size);
    // 이미 그 칸에 서 있다(부팅 복구가 도착한 뒤 넘기 전이었다 등): 바로 확인한다
    if (here.x === cell.x && here.y === cell.y && at >= arrivalAt(info.motion)) {
      journey.motion = info.motion;
      schedule(journey, at);
      return { ok: true };
    }
    const result = await map.moveUnit(journey.unitId, anchorCenter(cell.x, cell.y, info.size), {
      speedFactor: journey.speedFactor,
      // 진 사이보그 본체가 사는 곳으로 돌아가는 길(D-594, world/cyborgHome.ts): 돌아가는 중 표시(쓰지 못함)가 있어도 이 길은 걷는다. 돌아가는 중인 유닛은
      // 새 길을 받지 못하므로(planFor unavailable) 이 표시가 있는 길은 그 돌아가는 길뿐이다
      ignoreCondition: returningAt(info.condition, at),
    });
    if (journeys.get(journey.unitId) !== journey || journey.seq !== seq) return fail("busy");
    if (!result.ok) {
      const code = commandCode(result.code);
      if (code === "busy" && result.code === "busy" && retryBusy) {
        // 길 찾기가 밀렸다: 잠시 뒤 이 구간을 다시 한다(motion null → 확인이 구간을 다시 시작한다)
        schedule(journey, now() + RETRY_MS);
        return fail("busy");
      }
      finish(journey, "stopped", stopOf(code));
      return fail(code);
    }
    const motion = map.unitInfo(journey.unitId)?.motion;
    if (!motion) {
      finish(journey, "stopped", "interrupted");
      return fail("unknown_unit");
    }
    journey.motion = motion;
    schedule(journey, arrivalAt(motion));
    return { ok: true };
  };

  /** 넘기 직전 정산(넘기 전까지 한 일은 떠나는 2차맵 몫 — 다음 정산이 직무 배치를 풀고 계약을 끝낸다, 질문 582) */
  const settleBefore = (journey: Journey): void => {
    if (journey.npc === true) return;
    try {
      deps.settle?.(journey.ownerId, now());
    } catch (error) {
      log.error({ err: error, ownerId: journey.ownerId }, "travel: settle before crossing failed");
    }
  };

  type Info = NonNullable<ReturnType<SecondMap["unitInfo"]>>;

  /** 지금 2차맵의 변 끝 칸에 닿았다: 옆(띄운) 2차맵으로 넘기고 다음 구간을 시작한다 */
  const cross = (journey: Journey, map: SecondMap, info: Info, nextKey: number): void => {
    const next = maps.get(nextKey);
    const here = anchorAt(lastPoint(info.motion), info.size);
    const side = sideToward(map.mapKey, nextKey);
    const entry = next && side ? entryOf(map.mapKey, nextKey, here, side, info.size) : null;
    if (!next || !entry || !standsOn(next, entry, info.size, journey.sea === true)) {
      finish(journey, "stopped", "blocked");
      return;
    }
    settleBefore(journey);
    explore(journey, map, info.motion);
    const row = map.transferOut(journey.unitId, journey.npc);
    if (!row) {
      finish(journey, "stopped", "interrupted");
      return;
    }
    if (!next.transferIn(row, entry.x, entry.y, journey.npc)) {
      map.transferIn(row, here.x, here.y, journey.npc);
      finish(journey, "stopped", "blocked");
      return;
    }
    journey.leg += 1;
    store.save(journey);
    void beginLeg(journey, true);
  };

  /** 숨긴다: 유닛 행을 들고 leg를 첫 띄우지 않은 2차맵으로, untilMs에 나타난다 */
  const conceal = (journey: Journey, map: SecondMap, info: Info, hop: Hop, untilMs: number): boolean => {
    const row = map.transferOut(journey.unitId, journey.npc);
    if (!row) return false;
    const exit = lastPoint(info.motion);
    const speed = walkSpeed(info.speed, journey.speedFactor);
    const duration = hopMs(journey, journey.route.slice(journey.leg), hop, speed);
    journey.hidden = {
      row,
      startMs: Math.min(now(), untilMs - duration),
      untilMs,
      hop: { ...hop, from: journey.leg, to: journey.leg + (hop.to - hop.from) },
      exit,
      size: info.size,
      speed,
      cancelled: false,
    };
    journey.leg += 1;
    journey.hiddenUntilMs = untilMs;
    store.save(journey);
    schedule(journey, untilMs);
    return true;
  };

  /** 다음 2차맵을 띄우지 않았다: 변 끝에서 사라져 다음 띄운 2차맵 변에 나타날 때까지 건너뛴다(593 나) */
  const hide = (journey: Journey, map: SecondMap, info: Info): void => {
    // 배는 지나는 띄우지 않은 2차맵이 모두 바다여야 한다(가는 중에 바뀌었으면 멈춘다)
    if (journey.sea === true && !journey.route.slice(journey.leg + 1, -1).every(seaPassable)) {
      finish(journey, "stopped", "blocked");
      return;
    }
    const hop = hopFrom(contextOf(journey, info.size, journey.leg), 0, lastPoint(info.motion));
    if (!hop) {
      finish(journey, "stopped", "blocked");
      return;
    }
    settleBefore(journey);
    explore(journey, map, info.motion);
    if (
      !conceal(
        journey,
        map,
        info,
        hop,
        now() +
          hopMs(journey, journey.route.slice(journey.leg), hop, walkSpeed(info.speed, journey.speedFactor)),
      )
    ) {
      finish(journey, "stopped", "interrupted");
      return;
    }
    log.info(
      { unitId: journey.unitId, from: map.mapKey, skipped: hop.to - hop.from - 1 },
      "travel: crossing maps that are not loaded",
    );
  };

  /**
   * 도중 습격(610 나): 나타난 자리에서 건너뛴 2차맵마다 굴리고(씨앗이 길·구간마다 정해져 다시 켜도 같다), 났으면 그 자리에서 싸운다.
   * 졌으면 부상으로 그 자리에 멈추고 true
   */
  const raided = (journey: Journey, map: SecondMap, hidden: Hidden): boolean => {
    // 바다 습격 표는 해상 전투 때(D-542 1330 가)
    if (!raids || journey.sea === true || journey.npc === true) return false;
    const seed = raidSeed(journey.unitId, journey.startedAtMs, hidden.hop.from);
    let outcome: ReturnType<typeof raids.fight> = null;
    let raidAt: number | null = null;
    try {
      raidAt = raids.raidAt(journey.route.slice(hidden.hop.from + 1, hidden.hop.to), seed);
      if (raidAt !== null) outcome = raids.fight(map, journey.unitId, seed, now());
    } catch (error) {
      log.error({ err: error, unitId: journey.unitId }, "travel: raid battle failed");
    }
    if (!outcome) return false;
    log.info(
      { unitId: journey.unitId, raidAt, lost: outcome.lost, ticks: outcome.ticks },
      "travel: raided while crossing maps that are not loaded",
    );
    if (!outcome.lost) return false;
    finish(journey, "stopped", "raided");
    return true;
  };

  /**
   * 좌표 이동을 시작한다(유닛 행을 들고 route[from]의 exit 점에서 다음 띄운 2차맵 변, 또는 띄우지 않은 목적지의 목표 칸까지 곧은 선).
   * untilMs가 있으면 그 시각에 닿는다(부팅 복구). 갈 수 없으면 false(행은 부르는 쪽이 둔다)
   */
  const float = (
    journey: Journey,
    row: TransferRow,
    from: number,
    exit: Point,
    speed: number,
    untilMs?: number,
  ): boolean => {
    const hop = hopFrom(contextOf(journey, row.size, from), 0, exit, true);
    if (!hop) return false;
    const duration = hopMs(journey, journey.route.slice(from), hop, speed);
    const until = untilMs ?? now() + duration;
    journey.hidden = {
      row,
      startMs: Math.min(now(), until - duration),
      untilMs: until,
      hop: { ...hop, from, to: from + hop.to },
      exit,
      size: row.size,
      speed,
      cancelled: false,
    };
    journey.leg = from;
    journey.hiddenUntilMs = until;
    store.save(journey);
    schedule(journey, until);
    return true;
  };

  /** 좌표 유닛(서 있음)으로 둔다: 장부에 넣고 유닛 행을 그 자리로 쓴다 */
  const park = (row: TransferRow, mapKey: number, cell: CellPoint): void => {
    parked.put(row, mapKey, { x: fitCell(cell.x, row.size), y: fitCell(cell.y, row.size) }, now());
    counts.parks += 1;
  };

  /** 그 자리에 세운다: 그 2차맵을 띄웠으면 가장 가까운 설 칸에, 아니면 좌표 유닛으로. 세웠으면 true */
  const settleAt = (journey: Journey, row: TransferRow, mapKey: number, cell: CellPoint): boolean => {
    const map = maps.get(mapKey);
    if (!map) {
      park(row, mapKey, cell);
      return true;
    }
    const spot = standNear(mapKey, cell, row.size, standableFor(journey.sea === true));
    return spot !== null && map.transferIn(row, spot.x, spot.y, journey.npc);
  };

  /** 띄우지 않은 목적지에 닿았다: 목표 칸의 좌표 유닛이 된다(정찰이면 탐사를 남기고 돌아선다) */
  const landUnloaded = (journey: Journey, hidden: Hidden): void => {
    const mapKey = journey.route[hidden.hop.to] ?? -1;
    park(hidden.row, mapKey, hidden.hop.entry);
    journey.hidden = null;
    journey.hiddenUntilMs = null;
    journey.leg = hidden.hop.to;
    counts.lands += 1;
    if (journey.userId !== null)
      deps.exploreOff?.(journey.userId, mapKey, [
        anchorCenter(hidden.hop.entry.x, hidden.hop.entry.y, hidden.size),
      ]);
    if (!turnBackParked(journey)) finish(journey, "arrived", null);
  };

  /**
   * 띄우지 않은 목적지에서 도중 습격(610 나)이 나면 그 2차맵을 띄워 싸운다(전투 = 띄우는 까닭, ADR 2026-11-15 2절 3). 띄우면 나타나기(appear)가
   * 같은 씨앗으로 다시 굴려 싸운다. 습격이 없거나 띄울 수 없으면 좌표 유닛으로 선다
   */
  const arriveUnloaded = (journey: Journey, hidden: Hidden): void => {
    const mapKey = journey.route[hidden.hop.to] ?? -1;
    const skipped = journey.route.slice(hidden.hop.from + 1, hidden.hop.to);
    let raidAt: number | null = null;
    try {
      if (raids && journey.sea !== true && journey.npc !== true && spawn)
        raidAt = raids.raidAt(skipped, raidSeed(journey.unitId, journey.startedAtMs, hidden.hop.from));
    } catch (error) {
      log.error({ err: error, unitId: journey.unitId }, "travel: raid roll failed");
    }
    if (raidAt === null || !spawn) {
      landUnloaded(journey, hidden);
      return;
    }
    const seq = journey.seq;
    spawn.open(mapKey).then(
      (outcome) => {
        if (journeys.get(journey.unitId) !== journey || journey.seq !== seq) return;
        if (outcome === "ok" && maps.has(mapKey)) appear(journey, hidden);
        else landUnloaded(journey, hidden);
        arm();
      },
      (error: unknown) => {
        log.error({ err: error, unitId: journey.unitId, mapKey }, "travel: opening the raid map failed");
        if (journeys.get(journey.unitId) === journey && journey.seq === seq) landUnloaded(journey, hidden);
      },
    );
  };

  /** 나타난다: 다음 띄운 2차맵의 변(막혔으면 다시 찾는다). 어디에도 못 서면 사라진 자리로 되돌리고 멈춘다 */
  const appear = (journey: Journey, hidden: Hidden): void => {
    const mapKey = journey.route[hidden.hop.to] ?? -1;
    const target = maps.get(mapKey);
    const last = hidden.hop.to === journey.route.length - 1;
    if (!target) {
      // 나타날 2차맵이 띄우지 않은 것: 목적지면 좌표 유닛으로 서고, 가운데면(그동안 내려갔다) 그 자리에서 좌표 이동을 잇는다
      if (last) arriveUnloaded(journey, hidden);
      else if (
        !float(
          journey,
          hidden.row,
          hidden.hop.to,
          anchorCenter(hidden.hop.entry.x, hidden.hop.entry.y, hidden.size),
          hidden.speed,
        )
      ) {
        park(hidden.row, mapKey, hidden.hop.entry);
        journey.hidden = null;
        finish(journey, "stopped", "blocked");
      }
      return;
    }
    const sea = journey.sea === true;
    let entry: CellPoint | null = hidden.hop.entry;
    if (!standsOn(target, entry, hidden.size, sea)) {
      if (last) entry = standNear(mapKey, entry, hidden.size, standableFor(sea));
      else {
        const again = hopFrom(contextOf(journey, hidden.size, hidden.hop.from), 0, hidden.exit);
        entry = again?.entry ?? null;
      }
    }
    if (entry && target.transferIn(hidden.row, entry.x, entry.y, journey.npc)) {
      journey.hidden = null;
      journey.hiddenUntilMs = null;
      journey.leg = hidden.hop.to;
      if (raided(journey, target, hidden)) return;
      if (hidden.cancelled) {
        finish(journey, "stopped", "cancelled");
        return;
      }
      store.save(journey);
      void beginLeg(journey, true);
      return;
    }
    if (putBack(journey, hidden)) {
      finish(journey, "stopped", "blocked");
      return;
    }
    // 어디에도 세울 수 없다(드묾): 든 채 잠시 뒤 다시
    schedule(journey, now() + RETRY_MS);
  };

  /** 정찰이 돌아올 길(591 나): 출발 자리로 가는 2차맵 줄. 돌아갈 수 없으면 null */
  const backRoute = (journey: Journey, from: number): number[] | null => {
    const origin = journey.origin;
    if (journey.kind !== "scout" || journey.scoutedMapKey !== null || !origin || !isTarget(origin.mapKey))
      return null;
    return mapRoute(from, origin.mapKey, routeLoaded(from, origin.mapKey));
  };

  /** 돌아오는 길로 바꾼다(줄·목표·도착 예상) */
  const turnTo = (
    journey: Journey,
    scouted: number,
    route: number[],
    size: SizeClass,
    speed: number,
    at: Point,
  ) => {
    const origin = journey.origin ?? { mapKey: scouted, x: journey.target.x, y: journey.target.y };
    journey.scoutedMapKey = scouted;
    journey.route = route;
    journey.leg = 0;
    journey.target = { x: origin.x, y: origin.y };
    const back = planLegs(contextOf(journey, size), at);
    journey.arriveAtMs =
      now() + (back.ok ? travelMs(back.distance, walkSpeed(speed, journey.speedFactor)) : 0);
    log.info({ unitId: journey.unitId, scouted, maps: route.length }, "travel: scout turns back");
  };

  /** 정찰이 목표에 닿았다: 출발한 자리로 돌아오는 길로 바꾼다(591 나). 돌아갈 수 없으면 끝(그 자리에 선다) */
  const turnBack = (journey: Journey, map: SecondMap, info: Info): boolean => {
    const route = backRoute(journey, map.mapKey);
    if (!route) return false;
    turnTo(journey, map.mapKey, route, info.size, info.speed, positionAt(info.motion, now()));
    store.save(journey);
    void beginLeg(journey, true);
    return true;
  };

  /** 정찰이 띄우지 않은 목표에 닿아 좌표 유닛으로 섰다: 그 자리에서 돌아오는 좌표 이동을 시작한다 */
  const turnBackParked = (journey: Journey): boolean => {
    const here = journey.route[journey.leg] ?? -1;
    const spot = parked.get(journey.unitId);
    const route = spot ? backRoute(journey, here) : null;
    if (!spot || !route) return false;
    const exit = anchorCenter(spot.cell.x, spot.cell.y, spot.row.size);
    turnTo(journey, here, route, spot.row.size, spot.row.speed, exit);
    const row = parked.take(journey.unitId);
    if (row && float(journey, row, 0, exit, walkSpeed(row.speed, journey.speedFactor))) return true;
    if (row) park(row, here, spot.cell);
    return false;
  };

  /** 확인 시각: 그 움직임 그대로 끝났으면 넘기거나(중간) 끝낸다(마지막). 건너뛰는 중이면 나타날 때 */
  const check = (journey: Journey): void => {
    const hidden = journey.hidden;
    if (hidden) {
      if (now() < hidden.untilMs) schedule(journey, hidden.untilMs);
      else if (
        journey.npc === true &&
        hidden.row.kind === UNIT_KIND_BOT &&
        npcAlive?.(journey.unitId) === false
      )
        npcMethods.cancelNpc(journey.unitId, true);
      else appear(journey, hidden);
      return;
    }
    if (journey.motion === null) {
      void beginLeg(journey, true);
      return;
    }
    const mapKey = journey.route[journey.leg];
    const map = mapKey === undefined ? undefined : maps.get(mapKey);
    const info = map?.unitInfo(journey.unitId);
    if (!map || !info || info.motion !== journey.motion) {
      finish(journey, "stopped", "interrupted");
      return;
    }
    const arrive = arrivalAt(info.motion);
    if (now() < arrive) {
      schedule(journey, arrive);
      return;
    }
    const nextKey = journey.route[journey.leg + 1];
    if (nextKey === undefined) {
      explore(journey, map, info.motion);
      if (!turnBack(journey, map, info)) finish(journey, "arrived", null);
      return;
    }
    // 다음 2차맵을 띄우지 않았으면 좌표로 간다(배도 — 띄우지 않은 바다는 좌표 항해, D-559 1619). 2차맵을 띄우지 않는다
    if (loaded(nextKey)) cross(journey, map, info, nextKey);
    else hide(journey, map, info);
  };

  function runDue(): void {
    const at = now();
    const due = [...journeys.values()]
      .filter((journey) => journey.checkAtMs !== null && journey.checkAtMs <= at)
      .toSorted((a, b) => (a.checkAtMs ?? 0) - (b.checkAtMs ?? 0) || a.unitId - b.unitId);
    for (const journey of due) {
      if (journeys.get(journey.unitId) !== journey || journey.checkAtMs === null || journey.checkAtMs > at)
        continue;
      journey.checkAtMs = null;
      try {
        check(journey);
      } catch (error) {
        log.error({ err: error, unitId: journey.unitId }, "travel step failed");
        finish(journey, "stopped", "interrupted");
      }
    }
    arm();
  }

  /** 가는 중인 길의 도착 예상(serviceParts.ts travelEta) */
  const etaOf = (journey: Journey, at: number): number => {
    const size = journey.hidden?.size;
    const info = maps.get(journey.route[journey.leg] ?? -1)?.unitInfo(journey.unitId);
    return travelEta(journey, at, (from) => contextOf(journey, size ?? info?.size ?? 1, from), info);
  };

  /** 길을 만든다(보내기·NPC 보내기 공통): 앞 길을 버리고 새 줄을 저장한 뒤 첫 구간을 시작한다 */
  const launch = async (
    found: { id: number; ownerId: number; mapKey: number; info: UnitInfo; map: SecondMap | undefined },
    planned: { route: number[]; distance: number },
    request: TravelTarget & { readonly kind: TravelKind },
    userId: string | null,
    speedFactor: number,
    npc: boolean,
  ): Promise<TravelCommandResult> => {
    const at = now();
    // 가는 중이면 앞 길을 버린다(줄은 아래에서 덮어쓴다)
    const old = journeys.get(found.id);
    if (old) {
      journeys.delete(found.id);
      old.seq += 1;
      old.checkAtMs = null;
    }
    recent.delete(found.id);
    const position = positionAt(found.info.motion, at);
    const journey: Journey = {
      unitId: found.id,
      ownerId: found.ownerId,
      userId,
      kind: request.kind,
      route: planned.route,
      leg: 0,
      target: { x: request.x, y: request.y },
      startedAtMs: at,
      arriveAtMs: at + travelMs(planned.distance, walkSpeed(found.info.speed, speedFactor)),
      origin: { mapKey: found.mapKey, ...anchorOf(position, found.info.size) },
      scoutedMapKey: null,
      hiddenUntilMs: null,
      seq: 0,
      motion: null,
      checkAtMs: null,
      hidden: null,
      speedFactor,
      sea: found.info.domain === "sea",
      ...(npc ? { npc } : {}),
    };
    journeys.set(found.id, journey);
    store.save(journey);
    // NPC 이동: 가는 동안 스스로 걷지 않는다(끝나면 finish가 다시 켠다)
    if (npc) found.map?.holdRoam(found.id, true);
    // 좌표 유닛(서 있음): 그 자리에서 좌표 이동을 시작한다(2차맵을 띄우지 않는다)
    if (!found.map) {
      const row = parked.take(found.id);
      if (row && float(journey, row, 0, position, walkSpeed(row.speed, speedFactor)))
        return { ok: true, maps: planned.route.length, arriveAt: journey.arriveAtMs };
      if (row) park(row, found.mapKey, anchorOf(position, row.size));
      journeys.delete(found.id);
      store.remove(found.id);
      return fail(row ? "border_blocked" : "unknown_unit");
    }
    const first = await beginLeg(journey, false);
    return first.ok ? { ok: true, maps: planned.route.length, arriveAt: journey.arriveAtMs } : first;
  };

  /** 운영자 텔레포트(teleport.ts, D-560 1239) */
  const teleport = createTeleport({
    deps,
    maps,
    parked,
    stopped: () => stopped,
    spawn: () => spawn,
    ownUnit,
    locate,
    standable,
    standableFor,
    journeys,
    recent,
    store,
    arm,
    park,
  });

  const npcMethods = createNpcMethods({
    stopped: () => stopped,
    maps,
    journeys,
    writer: deps.writer,
    locate,
    planFor,
    launch,
    hiddenPlace,
    settleAt,
    finish,
    arm,
    listeners: npcDone,
  });

  const restoreParts = {
    deps,
    maps,
    parked,
    journeys,
    store,
    isTarget,
    loaded,
    contextOf,
    float,
    park,
    conceal,
    beginLeg,
  };

  return {
    plan(userId, request) {
      const found = ownUnit(userId, request.unitId);
      if ("problem" in found) return { ok: false, problem: found.problem };
      const planned = planFor(found, request);
      if ("problem" in planned) return { ok: false, problem: planned.problem };
      return { ok: true, plan: routePlan(found, planned, request.mapKey, loaded, now()) };
    },

    async start(userId, request, startOptions) {
      if (stopped || !deps.ready()) return fail("busy");
      const found = ownUnit(userId, request.unitId);
      if ("problem" in found) return fail(startCode(found.problem));
      const planned = planFor(found, request, startOptions?.returning === true);
      if ("problem" in planned) return fail(startCode(planned.problem));
      return launch(found, planned, request, userId, startOptions?.speedFactor ?? 1, false);
    },

    ...npcMethods,

    teleport,

    releasePace(unitIds) {
      for (const unitId of unitIds) {
        const journey = journeys.get(unitId);
        if (journey && journey.speedFactor !== 1) journey.speedFactor = 1;
      }
    },

    cancel(userId, asked) {
      // 승객의 멈추기는 그 배의 길(D-541 1279 나)
      const unitId = journeys.has(asked) ? asked : (locate(asked)?.info.aboard ?? asked);
      const journey = journeys.get(unitId);
      const ownerId = deps.ownerOf(userId);
      if (!journey || ownerId === undefined || journey.ownerId !== ownerId) return fail("not_traveling");
      const hidden = journey.hidden;
      if (hidden) {
        // 좌표로 가는 중: 지금 좌표에 선다(그 2차맵을 띄웠으면 가까운 설 칸, 아니면 좌표 유닛 — ADR 2026-11-15 4절)
        const place = hiddenPlace(journey, hidden);
        if (place && settleAt(journey, hidden.row, place.mapKey, place.cell)) {
          journey.hidden = null;
          journey.hiddenUntilMs = null;
          journey.leg = place.index;
        }
        finish(journey, "stopped", "cancelled");
        arm();
        return { ok: true };
      }
      const mapKey = journey.route[journey.leg];
      if (mapKey !== undefined) maps.get(mapKey)?.halt(unitId);
      finish(journey, "stopped", "cancelled");
      arm();
      return { ok: true };
    },

    list(userId) {
      const ownerId = deps.ownerOf(userId);
      if (ownerId === undefined) return [];
      prune();
      const at = now();
      const out: TravelView[] = [];
      for (const journey of journeys.values()) {
        if (journey.ownerId !== ownerId) continue;
        out.push(viewOf(journey, "going", null, etaOf(journey, at)));
      }
      for (const [unitId, finished] of recent)
        if (finished.ownerId === ownerId && !journeys.has(unitId)) out.push(finished.view);
      return out.toSorted((a, b) => a.unitId - b.unitId);
    },

    attachRaids(next) {
      raids = next;
    },

    attachSpawn(next) {
      spawn = next;
    },

    attachSea(next) {
      isSea = next;
    },

    touches: (mapKey) => touchesMap(held, journeys, now(), mapKey),
    hiddenAt: (unitId) => hiddenAtOf(journeys, hiddenPlace, unitId),
    parkedAt: (unitId) => parkedAtOf(parked, unitId),

    coordinateUnits: (ownerIds) => coordinateRows(parked, journeys, hiddenPlace, ownerIds),
    carries: (unitId) => carriesUnit(parked, journeys, unitId),
    haltOn: (mapKey, unitIds) =>
      haltJourneys({ journeys, maps, hiddenPlace, park, finish, arm }, mapKey, unitIds),

    holdMap(mapKey, untilMs) {
      held.set(mapKey, Math.max(untilMs, held.get(mapKey) ?? 0));
    },

    attachPace(next) {
      paceOf = next;
    },

    claim: (mapKey, map) => parked.claim(mapKey, placeFinder(map)),
    hasParked: (mapKey, ownerId) => parked.hasOwnerOn(mapKey, ownerId),
    parkable: (map) => parkableMap(map, now()),

    parkAll(map) {
      const moved = parkMapUnits(map, parked, now());
      if (moved > 0) counts.parks += moved;
      return moved;
    },

    takeMetrics() {
      const out = coordMetrics(parked, journeys, counts);
      counts = { parks: 0, lands: 0 };
      return out;
    },

    restore: (orphans) => restoreTravels(orphans, restoreParts, "main"),
    restoreNpc(alive) {
      npcAlive = alive;
      return restoreTravels(undefined, restoreParts, "npc");
    },

    runDue,

    get active() {
      return journeys.size;
    },

    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
