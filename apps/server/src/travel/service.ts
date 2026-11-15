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
// - 그때 띄우기(기획 답 730 다, docs/adr/2026-11-07-play-flow.md "WP15"): 길의 마지막 2차맵(목적지)을 서버가 띄우지 않았으면 보낼 수 있고
//   (확인 단계·길 고르기는 그 2차맵을 띄운 것처럼 — 설 칸은 닿을 때 다시 본다), 유닛이 그 2차맵에 들어서려 할 때(변 끝에 닿음·건너뛰다 나타남)
//   world/mapSpawn.ts가 띄운 뒤 넘긴다. 띄우는 동안 유닛은 변 앞에 서서 기다린다. 못 띄우면(상한) map_full로 멈춘다. 지나는 2차맵은 그대로 건너뛴다.
// - 바다 건너기(기획 D-541 1283 나, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)"): 배(영역 sea)도 같은 길로 간다. 설 칸 = 물 칸(물 격자 —
//   넘는 자리는 두 2차맵 모두 물인 변 칸), 승객은 배와 함께 넘는다(transferOut의 riders). 승객에게 보낸 길은 그 배의 길이다.
//   먼 바다(기획 D-553 1329 — D-542 1329 나 "건너뛰기"를 대체, docs/adr/2026-11-15-sea-combat-routes.md): 배는 건너뛰지 않는다. 띄우지 않은 지나는
//   2차맵이 행성 값으로 바다(물 비트 WATER_OCEAN — attachSea)면 길에 넣을 수 있고, 닿을 때 그 2차맵을 띄워(목적지처럼, 상한이면 map_full) 실제로 항해한다.
//   바다가 아닌 2차맵이 끼면 no_route(가는 중에 바뀌었으면 멈춘다). 바다 습격 표는 해상 전투 때(1330 가) — 배는 도중 습격을 굴리지 않는다.
import { AVERAGE_CELL_EDGE_METERS } from "@terra/planet/territory";
import {
  type CellPoint,
  JOB_NONE,
  type Motion,
  type SizeClass,
  anchorAt,
  anchorCenter,
  arrivalAt,
  positionAt,
} from "@terra/sim";
import { MAX_UNIT_SPEED } from "@terra/protocol";
import type { WorldTravelProblem, WorldTravelStop } from "@terra/shared/worldMap";
import { lastPoint } from "../world/mapGeometry.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import { UNIT_KIND_BOT, UNIT_KIND_GUARDIAN } from "../world/unitKinds.ts";
import {
  type Hop,
  type RouteContext,
  type Standable,
  anchorOf,
  distanceMeters,
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
  cellOf,
  commandCode,
  fail,
  pathPoints,
  startCode,
  stopOf,
} from "./serviceTypes.ts";
import { raidSeed } from "./raid.ts";
import { loadTravels, travelWriter } from "./store.ts";

export type {
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
/**
 * 걷는 빠르기 × 배수(운영자 모드 길, 사용자 지적 2026-11-09 "운영자모드에서 인접 2차맵을 목적지로 선택시 원래 속도로 느려진다").
 * 2차맵 이동 명령(secondMap.ts onRoute)과 같은 식이다
 */
export function walkSpeed(speed: number, factor: number): number {
  if (factor === 1) return speed;
  return Math.min(MAX_UNIT_SPEED, Math.max(1, Math.round(speed * factor)));
}

/** 설 수 있나: 걷는 유닛 = 땅, 배 = 물 칸(D-541 1283 나) */
function standsOn(map: SecondMap, cell: CellPoint, size: SizeClass, sea: boolean): boolean {
  return sea ? map.isNavigable(cell.x, cell.y, size) : map.isStandable(cell.x, cell.y, size);
}

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let raids = deps.raids;
  let spawn = deps.spawn;
  let isSea: ((mapKey: number) => boolean) | undefined;
  /** 배가 건너뛸 수 있나: 띄운 2차맵이거나(지나며 물 변을 다시 본다) 행성 값이 바다 */
  const seaPassable = (mapKey: number): boolean => maps.has(mapKey) || isSea?.(mapKey) === true;
  /** 설 칸 시험(걷는 유닛 = 땅, 배 = 물) */
  const standableFor =
    (sea: boolean): Standable =>
    (mapKey, cell, size) => {
      const map = maps.get(mapKey);
      return map ? standsOn(map, cell, size, sea) : false;
    };
  /** 닿을 때 띄울 2차맵: 아직 띄우지 않았고 그때 띄울 수 있으면 그 키(띄웠으면 undefined), 띄울 수 없으면 null */
  const opening = (mapKey: number): number | undefined | null =>
    maps.has(mapKey) ? undefined : spawn?.canOpen(mapKey) ? mapKey : null;
  /** 길의 마지막 2차맵이 닿을 때 띄울 것이면 그 키 */
  const opensAt = (route: readonly number[]): number | undefined => {
    const last = route.at(-1);
    return last === undefined ? undefined : (opening(last) ?? undefined);
  };
  const loadedOr =
    (opens: number | undefined) =>
    (mapKey: number): boolean =>
      maps.has(mapKey) || mapKey === opens;
  /** 아직 띄우지 않은 목적지는 설 수 있다고 본다(보기 값 — 닿아서 띄운 뒤 실제 지형으로 다시 고른다). sea = 배(물 칸) */
  const standableOr =
    (opens: number | undefined, sea = false): Standable =>
    (mapKey, cell, size) => {
      const map = maps.get(mapKey);
      return map ? standsOn(map, cell, size, sea) : mapKey === opens;
    };
  const contextOf = (
    journey: Pick<Journey, "route" | "target" | "sea">,
    size: SizeClass,
    from = 0,
  ): RouteContext => {
    const opens = opensAt(journey.route);
    return routeContext(
      journey.route.slice(from),
      journey.target,
      size,
      standableOr(opens, journey.sea === true),
      loadedOr(opens),
    );
  };

  /** 유닛이 선 2차맵과 유닛 정보 */
  /** fresh = 걷기 빠르기를 몸에서 다시 읽고 본다(길 예상 시간 — D-540 실효 AGI, 장비를 바꾼 뒤 첫 길도 맞게) */
  const locate = (unitId: number, fresh = false) => {
    for (const map of maps.values()) {
      if (fresh && map.unitInfo(unitId)) map.refreshSpeed(unitId);
      const info = map.unitInfo(unitId);
      if (info) return { map, info };
    }
    return undefined;
  };

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
    let mapKey = journey.route[journey.leg] ?? journey.route[0] ?? 0;
    let cell: CellPoint = journey.target;
    if (journey.hidden) {
      const place = hiddenPlace(journey, journey.hidden);
      if (place) {
        mapKey = place.mapKey;
        cell = place.cell;
      }
    } else {
      const info = maps.get(mapKey)?.unitInfo(journey.unitId);
      if (info) cell = cellOf(positionAt(info.motion, now()));
    }
    return {
      unitId: journey.unitId,
      kind: journey.kind,
      route: [...journey.route],
      leg: journey.leg,
      mapKey,
      cellX: cell.x,
      cellY: cell.y,
      targetX: journey.target.x,
      targetY: journey.target.y,
      startedAt: journey.startedAtMs,
      arriveAt,
      state,
      stop,
      returning: journey.scoutedMapKey !== null,
      scoutedMapKey: journey.scoutedMapKey,
      hidden: journey.hidden !== null,
    };
  };

  const prune = (): void => {
    const cutoff = now() - RECENT_MS;
    for (const [unitId, finished] of recent) if (finished.view.arriveAt < cutoff) recent.delete(unitId);
  };

  /** 들고 있던(건너뛰던) 유닛을 사라진 자리 둘레에 다시 세운다. 세웠으면 true */
  const putBack = (journey: Journey, hidden: Hidden): boolean => {
    const back = maps.get(journey.route[hidden.hop.from] ?? -1);
    if (!back) return false;
    const exit = anchorOf(hidden.exit, hidden.size);
    const sea = journey.sea === true;
    const spot = standsOn(back, exit, hidden.size, sea)
      ? exit
      : standNear(back.mapKey, exit, hidden.size, sea ? standableFor(true) : standable);
    if (!spot || !back.transferIn(hidden.row, spot.x, spot.y)) return false;
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
    const row = map.transferOut(journey.unitId);
    if (!row) {
      finish(journey, "stopped", "interrupted");
      return;
    }
    if (!next.transferIn(row, entry.x, entry.y)) {
      map.transferIn(row, here.x, here.y);
      finish(journey, "stopped", "blocked");
      return;
    }
    journey.leg += 1;
    store.save(journey);
    void beginLeg(journey, true);
  };

  /** 숨긴다: 유닛 행을 들고 leg를 첫 띄우지 않은 2차맵으로, untilMs에 나타난다 */
  const conceal = (journey: Journey, map: SecondMap, info: Info, hop: Hop, untilMs: number): boolean => {
    const row = map.transferOut(journey.unitId);
    if (!row) return false;
    const exit = lastPoint(info.motion);
    const speed = walkSpeed(info.speed, journey.speedFactor);
    const duration = travelMs(hop.distance, speed);
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
    // 배는 건너뛰지 않는다(D-553 1329 — check가 띄운다). 여기 온 배(옛 저장 줄)는 길에 땅 2차맵이 끼었으면 멈춘다
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
        now() + travelMs(hop.distance, walkSpeed(info.speed, journey.speedFactor)),
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
    if (!raids || journey.sea === true) return false;
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

  /** 나타난다: 다음 띄운 2차맵의 변(막혔으면 다시 찾는다). 어디에도 못 서면 사라진 자리로 되돌리고 멈춘다 */
  const appear = (journey: Journey, hidden: Hidden): void => {
    const mapKey = journey.route[hidden.hop.to] ?? -1;
    const target = maps.get(mapKey);
    let entry: CellPoint | null = hidden.hop.entry;
    if (target && !standsOn(target, entry, hidden.size, journey.sea === true)) {
      const again = hopFrom(contextOf(journey, hidden.size, hidden.hop.from), 0, hidden.exit);
      entry = again?.entry ?? null;
    }
    if (target && entry && target.transferIn(hidden.row, entry.x, entry.y)) {
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

  /**
   * 닿을 때 띄울 목적지(730 다): 띄운 뒤 next(넘기기·나타나기). 그동안 유닛은 그 자리에 서서 기다린다. 못 띄우면 멈춘다(상한이면 map_full,
   * 건너뛰던 중이면 finish가 사라진 자리로 되돌린다)
   */
  const openThen = (journey: Journey, mapKey: number, next: () => void): void => {
    const seq = journey.seq;
    const current = () => journeys.get(journey.unitId) === journey && journey.seq === seq;
    if (!spawn) {
      finish(journey, "stopped", "blocked");
      return;
    }
    spawn.open(mapKey).then(
      (outcome) => {
        if (!current()) return;
        if (outcome === "ok" && maps.has(mapKey)) next();
        else finish(journey, "stopped", outcome === "full" ? "map_full" : "blocked");
        arm();
      },
      (error: unknown) => {
        log.error(
          { err: error, unitId: journey.unitId, mapKey },
          "travel: opening the destination map failed",
        );
        if (current()) finish(journey, "stopped", "blocked");
      },
    );
  };

  /** 정찰이 목표에 닿았다: 출발한 자리로 돌아오는 길로 바꾼다(591 나). 돌아갈 수 없으면 끝(그 자리에 선다) */
  const turnBack = (journey: Journey, map: SecondMap, info: Info): boolean => {
    const origin = journey.origin;
    // 출발 2차맵이 그동안 내려갔으면(비어서) 돌아올 때 다시 띄운다(730 다)
    const opens = origin ? opening(origin.mapKey) : null;
    if (journey.kind !== "scout" || journey.scoutedMapKey !== null || !origin || opens === null) return false;
    const route = mapRoute(map.mapKey, origin.mapKey, loadedOr(opens));
    if (!route) return false;
    journey.scoutedMapKey = map.mapKey;
    journey.route = route;
    journey.leg = 0;
    journey.target = { x: origin.x, y: origin.y };
    const back = planLegs(contextOf(journey, info.size), positionAt(info.motion, now()));
    journey.arriveAtMs =
      now() + (back.ok ? travelMs(back.distance, walkSpeed(info.speed, journey.speedFactor)) : 0);
    store.save(journey);
    log.info({ unitId: journey.unitId, scouted: map.mapKey, maps: route.length }, "travel: scout turns back");
    void beginLeg(journey, true);
    return true;
  };

  /** 확인 시각: 그 움직임 그대로 끝났으면 넘기거나(중간) 끝낸다(마지막). 건너뛰는 중이면 나타날 때 */
  const check = (journey: Journey): void => {
    const hidden = journey.hidden;
    if (hidden) {
      const appearIn = journey.route[hidden.hop.to] ?? -1;
      if (now() < hidden.untilMs) schedule(journey, hidden.untilMs);
      else if (!maps.has(appearIn) && appearIn === opensAt(journey.route))
        openThen(journey, appearIn, () => appear(journey, hidden));
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
    if (loaded(nextKey)) cross(journey, map, info, nextKey);
    // 배는 먼 바다를 건너뛰지 않는다(기획 D-553 1329 — "먼바다로 순간이동하는기능은 없다"): 지나는 바다 2차맵도 닿을 때 띄우고 실제로 항해한다
    else if (nextKey === opensAt(journey.route) || journey.sea === true)
      // 띄운 뒤 이 2차맵의 넘는 자리를 실제 지형으로 다시 고른다(이미 그 칸이면 바로 넘는다). 기다리는 동안 다른 명령을 받았으면 벗어남
      openThen(journey, nextKey, () => {
        if (map.unitInfo(journey.unitId)?.motion === info.motion) void beginLeg(journey, true);
        else finish(journey, "stopped", "interrupted");
      });
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

  /** 내가 옮길 수 있는 유닛(내 소유, 수호신·봇 아님)과 그 자리. 건너뛰는 중이면 in_transit */
  const ownUnit = (userId: string, unitId: number | undefined) => {
    const asked = unitId ?? deps.cyborgUnitOf?.(userId) ?? null;
    if (asked === null) return { problem: "no_cyborg" as const };
    const ownerId = deps.ownerOf(userId);
    // 승객에게 보낸 길은 그 배의 길(D-541 1279 나·1283 나)
    const id = locate(asked)?.info.aboard ?? asked;
    const where = locate(id, true);
    if (!where) {
      const journey = journeys.get(id);
      return journey?.hidden && journey.ownerId === ownerId
        ? { problem: "in_transit" as const }
        : { problem: "unknown_unit" as const };
    }
    const { kind } = where.info;
    if (
      ownerId === undefined ||
      where.info.ownerId !== ownerId ||
      kind === UNIT_KIND_GUARDIAN ||
      kind === UNIT_KIND_BOT
    )
      return { problem: "forbidden" as const };
    return { id, ownerId, ...where };
  };

  /** 지나는 2차맵 줄과 곧은 거리 */
  const planFor = (
    where: NonNullable<ReturnType<typeof locate>>,
    target: TravelTarget,
  ): { route: number[]; distance: number; opens: boolean } | { problem: WorldTravelProblem } => {
    // 띄우지 않은 목적지는 닿을 때 띄운다(730 다) — 지금 더 띄울 자리가 없으면 map_full(닿을 때 다시 본다)
    const opens = opening(target.mapKey);
    if (opens === null) return { problem: "unknown_map" };
    if (unavailable(where.info.condition, now())) return { problem: "unavailable" };
    if (opens !== undefined && !spawn?.hasRoom()) return { problem: "map_full" };
    const route = mapRoute(where.map.mapKey, target.mapKey, loadedOr(opens));
    if (!route) return { problem: "no_route" };
    const sea = where.info.domain === "sea";
    // 배는 행성 값이 바다인 띄우지 않은 2차맵만 길에 넣는다(닿을 때 띄우고 항해한다 — D-553 1329, 목적지도 닿을 때 띄울 수 있다)
    if (sea && !route.slice(1, -1).every(seaPassable)) return { problem: "no_route" };
    const cell = { x: target.x, y: target.y };
    const legs = planLegs(
      routeContext(route, cell, where.info.size, standableOr(opens, sea), loadedOr(opens)),
      positionAt(where.info.motion, now()),
    );
    if (!legs.ok) return { problem: legs.problem };
    return { route, distance: legs.distance, opens: opens !== undefined };
  };

  /**
   * 가는 중인 길의 도착 예상: 지금 2차맵 다리는 움직임의 실제 도착(구간 빠르기 — 지형을 따른다, docs/adr/2026-11-14-segment-speed.md 8절),
   * 그 끝에서 남은 줄은 곧은 거리 ÷ 속도(못 재면 보낼 때 잰 값). 띄우지 않은 2차맵 건너뛰기는 지형이 없어 곧은 거리 ÷ 속도
   */
  const etaOf = (journey: Journey, at: number): number => {
    const hidden = journey.hidden;
    if (hidden) {
      const rest = planLegs(
        contextOf(journey, hidden.size, hidden.hop.to),
        anchorCenter(hidden.hop.entry.x, hidden.hop.entry.y, hidden.size),
      );
      return rest.ok
        ? Math.max(at, hidden.untilMs) + travelMs(rest.distance, hidden.speed)
        : journey.arriveAtMs;
    }
    const mapKey = journey.route[journey.leg];
    const info = mapKey === undefined ? undefined : maps.get(mapKey)?.unitInfo(journey.unitId);
    if (!info) return journey.arriveAtMs;
    const rest = planLegs(contextOf(journey, info.size, journey.leg), lastPoint(info.motion));
    return rest.ok
      ? Math.max(at, arrivalAt(info.motion)) +
          travelMs(rest.distance, walkSpeed(info.speed, journey.speedFactor))
      : journey.arriveAtMs;
  };

  return {
    plan(userId, request) {
      const found = ownUnit(userId, request.unitId);
      if ("problem" in found) return { ok: false, problem: found.problem };
      const planned = planFor(found, request);
      if ("problem" in planned) return { ok: false, problem: planned.problem };
      const durationMs = travelMs(planned.distance, found.info.speed);
      return {
        ok: true,
        plan: {
          unitId: found.id,
          route: planned.route,
          distanceM: distanceMeters(planned.distance, AVERAGE_CELL_EDGE_METERS),
          durationMs,
          arriveAt: now() + durationMs,
          working: found.info.job.job !== JOB_NONE,
          hiddenMaps: planned.route.filter((key) => !loaded(key) && key !== request.mapKey).length,
          opensMap: planned.opens,
          cost: "walk",
        },
      };
    },

    async start(userId, request, startOptions) {
      if (stopped || !deps.ready()) return fail("busy");
      const found = ownUnit(userId, request.unitId);
      if ("problem" in found) return fail(startCode(found.problem));
      const planned = planFor(found, request);
      if ("problem" in planned) return fail(startCode(planned.problem));
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
      const speedFactor = startOptions?.speedFactor ?? 1;
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
        origin: { mapKey: found.map.mapKey, ...anchorOf(position, found.info.size) },
        scoutedMapKey: null,
        hiddenUntilMs: null,
        seq: 0,
        motion: null,
        checkAtMs: null,
        hidden: null,
        speedFactor,
        sea: found.info.domain === "sea",
      };
      journeys.set(found.id, journey);
      store.save(journey);
      // 닿을 때 띄울 목적지는 지형을 미리 받아 둔다(닿을 때 캐시에서 — 이벤트 루프를 막지 않는다)
      if (planned.opens) spawn?.prefetch(request.mapKey);
      const first = await beginLeg(journey, false);
      return first.ok ? { ok: true, maps: planned.route.length, arriveAt: journey.arriveAtMs } : first;
    },

    async teleport(userId, request) {
      if (stopped || !deps.ready()) return fail("busy");
      const found = ownUnit(userId, request.unitId);
      if ("problem" in found) return fail(startCode(found.problem));
      if (unavailable(found.info.condition, now())) return fail("unavailable");
      // 띄우지 않은 목적지는 띄운 뒤 옮긴다(상한·띄울 수 없는 칸이면 unknown_map)
      if (!maps.has(request.mapKey)) {
        if (!spawn?.canOpen(request.mapKey)) return fail("unknown_map");
        const opened = await spawn.open(request.mapKey);
        if (opened !== "ok") return fail(opened === "full" ? "busy" : "unknown_map");
      }
      const target = maps.get(request.mapKey);
      // 띄우는 동안 유닛이 바뀌었을 수 있다(다시 찾는다)
      const where = locate(found.id);
      if (!target || !where) return fail(target ? "unknown_unit" : "unknown_map");
      const sea = where.info.domain === "sea";
      const goal = { x: request.x, y: request.y };
      const spot = standsOn(target, goal, where.info.size, sea)
        ? goal
        : standNear(target.mapKey, goal, where.info.size, sea ? standableFor(true) : standable);
      if (!spot) return fail("goal_blocked");
      // 가던 길은 버린다(줄도 지운다)
      const old = journeys.get(found.id);
      if (old) {
        journeys.delete(found.id);
        old.seq += 1;
        old.checkAtMs = null;
        store.remove(found.id);
        arm();
      }
      recent.delete(found.id);
      if (where.map !== target) {
        try {
          deps.settle?.(found.ownerId, now());
        } catch (error) {
          log.error({ err: error, ownerId: found.ownerId }, "travel: settle before teleport failed");
        }
      }
      const row = where.map.transferOut(found.id);
      if (!row) return fail("unknown_unit");
      if (!target.transferIn(row, spot.x, spot.y)) {
        // 못 놓으면 떠난 자리로 되돌린다
        const back = anchorOf(positionAt(where.info.motion, now()), where.info.size);
        where.map.transferIn(row, back.x, back.y);
        return fail("goal_blocked");
      }
      // 닿은 자리의 시야를 탐사 기록에 남긴다(걸어서 닿은 것과 같게 — 구독하지 않아도 그 2차맵을 볼 수 있다)
      target.vision
        .explore(userId, [anchorCenter(spot.x, spot.y, where.info.size)])
        .catch((error: unknown) => {
          log.error({ err: error, unitId: found.id }, "travel: teleport exploration record failed");
        });
      log.info({ unitId: found.id, from: where.map.mapKey, to: target.mapKey }, "operator teleport");
      return { ok: true, maps: 1, arriveAt: now() };
    },

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
        // 띄우지 않은 2차맵에는 설 수 없다: 다음 띄운 2차맵에 나타난 자리에서 선다(다시 켜도 그곳까지 — 줄을 거기서 끊는다)
        hidden.cancelled = true;
        journey.route = journey.route.slice(0, hidden.hop.to + 1);
        journey.target = hidden.hop.entry;
        journey.scoutedMapKey = null;
        store.save(journey);
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

    touches(mapKey) {
      for (const journey of journeys.values()) {
        if (journey.route.at(-1) === mapKey || journey.route[journey.leg] === mapKey) return true;
        if (journey.hidden && journey.route[journey.hidden.hop.to] === mapKey) return true;
      }
      return false;
    },

    hiddenAt(unitId) {
      const journey = journeys.get(unitId);
      if (!journey?.hidden) return undefined;
      const place = hiddenPlace(journey, journey.hidden);
      return place ? { mapKey: place.mapKey, cellX: place.cell.x, cellY: place.cell.y } : undefined;
    },

    async restore() {
      if (!deps.pool) return 0;
      const rows = await loadTravels(deps.pool, deps.planetId);
      let resumed = 0;
      for (const row of rows) {
        // 유닛이 지나는 2차맵 가운데 어디 서 있나(없으면 — 사라졌거나 띄우지 않은 2차맵 — 줄을 지운다)
        const leg = row.route.findIndex((key) => maps.get(key)?.unitInfo(row.unitId) !== undefined);
        if (leg < 0 || journeys.has(row.unitId)) {
          store.remove(row.unitId);
          continue;
        }
        const journey: Journey = {
          ...row,
          leg,
          seq: 0,
          motion: null,
          checkAtMs: null,
          hidden: null,
          speedFactor: 1,
          sea: maps.get(row.route[leg] ?? -1)?.unitInfo(row.unitId)?.domain === "sea",
        };
        journeys.set(row.unitId, journey);
        resumed += 1;
        // 건너뛰던 중: 유닛은 사라진 자리(변 끝)에 다시 놓였다 → 다시 숨기고 남은 시간을 기다린다
        const until = row.hiddenUntilMs;
        const map = maps.get(row.route[leg] ?? -1);
        const info = map?.unitInfo(row.unitId);
        if (until !== null && leg === row.leg - 1 && !loaded(row.route[row.leg] ?? -1) && map && info) {
          const hop = hopFrom(contextOf(journey, info.size, leg), 0, lastPoint(info.motion));
          if (hop && conceal(journey, map, info, hop, until)) continue;
        }
        journey.hiddenUntilMs = null;
        if (leg !== row.leg || until !== null) store.save(journey);
        void beginLeg(journey, true);
      }
      if (rows.length > 0) log.info({ travels: rows.length, resumed }, "world boot: travels resumed");
      return resumed;
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

/** 월드(world.ts)가 잇는 모양: 소유 주체·정산은 정산 서비스, 사이보그 본체는 사이보그 서비스에서 */
export function createWorldTravel(parts: {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly planetId: string;
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  readonly now: () => number;
  readonly log: TravelDeps["log"];
  readonly ready: () => boolean;
  readonly settlement: {
    findOwnerOfUser(userId: string): number | undefined;
    settleOwner(ownerId: number, toMs: number): unknown;
  };
  readonly cyborgs: { record(userId: string): { readonly unitId: number | null } | undefined };
}): TravelService {
  const { settlement, cyborgs } = parts;
  return createTravelService({
    ...parts,
    ownerOf: (userId) => settlement.findOwnerOfUser(userId),
    cyborgUnitOf: (userId) => cyborgs.record(userId)?.unitId ?? null,
    settle: (ownerId, atMs) => {
      settlement.settleOwner(ownerId, atMs);
    },
  });
}
