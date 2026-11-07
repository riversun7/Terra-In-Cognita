// 2차맵 사이 이동 서비스 — docs/adr/2026-11-07-play-flow.md "WP9 2차맵 사이 이동", 기획 D-197(1차맵은 좌표·명령만, 유닛은 실제 2차맵을 지나간다)·
// D-6019·D-6021(대상 → 명령 → 파티 → 확인 → 확정)·질문 571 가(출발 2차맵 가장자리까지 걷고 이웃 2차맵을 하나씩 지나간다).
// - 서버 권위: 지나는 2차맵 줄·넘는 자리·2차맵마다의 길을 서버가 정한다(route.ts). 기기는 목적 2차맵·칸·명령 종류만 보낸다.
// - 걷기: 지금 2차맵 안에서는 그 2차맵의 길 찾기(경로 워커, moveUnit)로 변 끝 칸까지 걷는다. 그 움직임의 도착 시각에 확인해서 그대로면
//   옆 2차맵으로 넘긴다(transferOut → transferIn: 유닛 행은 새 2차맵 키로 같은 쓰기 묶음, 지나는 2차맵마다 실제 유닛이라 그곳 시야·조우가 있다).
//   마지막 2차맵에서는 목표 칸 둘레의 설 칸까지 걷고 끝난다.
// - 넘기 직전에 그 주인을 정산한다: 넘기 전까지 한 일은 떠나는 2차맵 몫이고, 다음 정산이 "유닛이 시설의 2차맵에 없다"로 직무 배치를 풀고
//   노동 계약을 끝낸다(질문 582 "지금 코드" 그대로 — 떠난 시각에 끝난다).
// - 길에서 벗어남: 확인할 때 유닛이 없거나 움직임이 바뀌었으면(다른 이동 명령·전투 뒤 안전한 곳·사망) 멈춤(interrupted). 멈추기 명령은 그 자리에 세운다.
//   같은 유닛에 새 보내기가 오면 앞 길을 버리고 새 길로 간다.
// - 저장: world_travels(유닛당 한 줄, 끝나면 지운다). 다시 켜면 유닛이 있는 2차맵부터 그 구간을 다시 시작한다(경로를 다시 찾는다).
// - 끝난 길(도착·멈춤)은 RECENT_MS 동안 메모리에서 보인다(화면이 "도착했습니다"를 띄운다). 저장하지 않는다.
// [임시] 띄운 2차맵만 지난다(띄우지 않은 2차맵을 지나야 하면 no_route) — 서버가 띄우는 시험 2차맵이 한 줄로 이어져 있어 지금은 모든 도시에 닿는다.
// 지나는 2차맵을 그때 띄우는 것(질문 571 다의 대안)은 확인 대기(질문 593).
import type { TravelKind, TravelResultCode, ResultCode } from "@terra/protocol";
import { AVERAGE_CELL_EDGE_METERS } from "@terra/planet/territory";
import {
  CELL_UNITS,
  type CellPoint,
  JOB_NONE,
  type Motion,
  PLACEMENT_SIZE,
  type Point,
  anchorAt,
  anchorCenter,
  arrivalAt,
  positionAt,
} from "@terra/sim";
import type {
  WorldTravel,
  WorldTravelPlan,
  WorldTravelProblem,
  WorldTravelStop,
} from "@terra/shared/worldMap";
import { lastPoint } from "../world/mapGeometry.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import { UNIT_KIND_BOT, UNIT_KIND_GUARDIAN } from "../world/unitKinds.ts";
import {
  type Standable,
  distanceMeters,
  entryOf,
  mapRoute,
  pickCrossing,
  planLegs,
  sideToward,
  standNear,
  travelMs,
} from "./route.ts";
import { type TravelRecord, loadTravels, travelWriter } from "./store.ts";

/** 끝난 길을 화면에 보이는 시간(ms) */
export const RECENT_MS = 10 * 60_000;
/** 길 찾기가 밀렸을 때(busy) 그 구간을 다시 해 보기까지(ms, 다음 구간·부팅 복구만 — 보내기 명령은 busy로 답한다) */
export const RETRY_MS = 2_000;
/** setTimeout 지연 상한(약 24.8일). 더 먼 확인은 깨어나서 다시 건다 */
const MAX_TIMER_MS = 0x7fff_ffff;

/** 목적지: 목적 2차맵과 그 안 배치 칸 */
export interface TravelTarget {
  readonly mapKey: number;
  readonly x: number;
  readonly y: number;
}

export type TravelCommandResult =
  | { readonly ok: true; readonly maps?: number; readonly arriveAt?: number }
  | { readonly ok: false; readonly code: TravelResultCode };

export type TravelPlanResult =
  | { readonly ok: true; readonly plan: WorldTravelPlan }
  | { readonly ok: false; readonly problem: WorldTravelProblem };

/** 화면 한 줄(위도·경도는 조회가 붙인다) */
export type TravelView = Omit<WorldTravel, "latDeg" | "lonDeg">;

export interface TravelService {
  /** 확인 단계: 지나는 2차맵·곧은 거리·걸리는 시간(보내지 않는다). unitId가 없으면 내 사이보그 본체 */
  plan(userId: string, request: TravelTarget & { readonly unitId?: number | undefined }): TravelPlanResult;
  /** 확정: 보낸다(첫 구간 길을 찾으면 ok). 가는 중이면 새 길로 바꾼다 */
  start(
    userId: string,
    request: TravelTarget & { readonly unitId: number; readonly kind: TravelKind },
  ): Promise<TravelCommandResult>;
  /** 멈추기: 그 자리에 선다 */
  cancel(userId: string, unitId: number): TravelCommandResult;
  /** 내 유닛의 길(가는 중 + 최근 끝난 것), 유닛 ID 차례 */
  list(userId: string): TravelView[];
  /** 부팅: 저장한 길을 다시 잇는다(유닛을 다시 놓은 뒤). 다시 시작한 수 */
  restore(): Promise<number>;
  /** 지금 시각까지 확인할 길을 처리한다(타이머가 부른다. 시험은 가짜 시계를 옮긴 뒤 부른다) */
  runDue(): void;
  /** 가는 중인 길 수 */
  readonly active: number;
  stop(): void;
}

export interface TravelDeps {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly planetId: string;
  readonly now: () => number;
  readonly log: {
    info(obj: object, message: string): void;
    error(obj: object, message: string): void;
  };
  /** 사용자의 소유 주체(없으면 내 유닛 없음) */
  ownerOf(userId: string): number | undefined;
  /** 사용자의 사이보그 본체 유닛(없으면 null) */
  cyborgUnitOf?: ((userId: string) => number | null) | undefined;
  /** 그 주체를 그 시각까지 정산한다(2차맵을 넘기 직전) */
  settle?: ((ownerId: number, atMs: number) => void) | undefined;
  /** 쓰기 대기열(없으면 메모리에만) */
  readonly writer?: WorldWriter | undefined;
  /** 부팅 복구가 읽는 DB(없으면 복구 없음) */
  readonly pool?: QueryPool | undefined;
  /** 세계가 명령을 받을 수 있나(부팅 복구 끝) */
  ready(): boolean;
}

interface Journey extends TravelRecord {
  /** 구간을 시작할 때마다 오른다(늦게 온 길 찾기 결과를 버린다) */
  seq: number;
  /** 지금 구간의 움직임(길 찾기를 기다리면 null) */
  motion: Motion | null;
  /** 다음 확인 시각(없으면 null) */
  checkAtMs: number | null;
}

interface Finished {
  readonly ownerId: number;
  readonly view: TravelView;
}

const fail = (code: TravelResultCode): TravelCommandResult => ({ ok: false, code });

/** 2차맵 이동 명령 결과 → 보내기 결과 코드 */
function commandCode(code: ResultCode): TravelResultCode {
  switch (code) {
    case "invalid_request":
      return "unavailable";
    case "superseded":
      return "busy";
    case "unknown_unit":
    case "unknown_map":
    case "start_blocked":
    case "goal_blocked":
    case "no_path":
    case "budget_exceeded":
    case "path_too_complex":
    case "busy":
      return code;
    default:
      return "internal_error";
  }
}

/** 보내기 결과 코드 → 멈춘 까닭 */
function stopOf(code: TravelResultCode): WorldTravelStop {
  if (code === "unavailable") return "unavailable";
  if (code === "unknown_unit" || code === "busy") return "interrupted";
  return "blocked";
}

const clampCell = (value: number): number => Math.max(0, Math.min(PLACEMENT_SIZE - 1, value));
const cellOf = (point: Point): CellPoint => ({
  x: clampCell(Math.floor(point.x / CELL_UNITS)),
  y: clampCell(Math.floor(point.y / CELL_UNITS)),
});

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

  /** 유닛이 선 2차맵과 유닛 정보 */
  const locate = (unitId: number) => {
    for (const map of maps.values()) {
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

  const viewOf = (
    journey: TravelRecord,
    state: TravelView["state"],
    stop: WorldTravelStop | null,
    arriveAt: number,
  ): TravelView => {
    const mapKey = journey.route[journey.leg] ?? journey.route[0] ?? 0;
    const info = maps.get(mapKey)?.unitInfo(journey.unitId);
    const cell = info ? cellOf(positionAt(info.motion, now())) : journey.target;
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
    };
  };

  const prune = (): void => {
    const cutoff = now() - RECENT_MS;
    for (const [unitId, finished] of recent) if (finished.view.arriveAt < cutoff) recent.delete(unitId);
  };

  /** 길을 끝낸다(도착·멈춤): 줄을 지우고 최근 목록에 둔다 */
  const finish = (journey: Journey, state: "arrived" | "stopped", stop: WorldTravelStop | null): void => {
    if (journeys.get(journey.unitId) !== journey) return;
    journeys.delete(journey.unitId);
    journey.seq += 1;
    journey.checkAtMs = null;
    store.remove(journey.unitId);
    recent.set(journey.unitId, { ownerId: journey.ownerId, view: viewOf(journey, state, stop, now()) });
    prune();
    if (state === "stopped")
      log.info({ unitId: journey.unitId, leg: journey.leg, stop }, "travel stopped before arriving");
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
    const here = anchorAt(positionAt(info.motion, at), info.size);
    const next = journey.route[journey.leg + 1];
    const goal =
      next === undefined
        ? standNear(mapKey, journey.target, info.size, standable)
        : (pickCrossing(mapKey, next, here, info.size, standable)?.exit ?? null);
    if (!goal) {
      finish(journey, "stopped", "blocked");
      return fail(next === undefined ? "goal_blocked" : "border_blocked");
    }
    // 이미 그 칸에 서 있다(부팅 복구가 도착한 뒤 넘기 전이었다 등): 바로 확인한다
    if (here.x === goal.x && here.y === goal.y && at >= arrivalAt(info.motion)) {
      journey.motion = info.motion;
      schedule(journey, at);
      return { ok: true };
    }
    const result = await map.moveUnit(journey.unitId, anchorCenter(goal.x, goal.y, info.size));
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

  /** 지금 2차맵의 변 끝 칸에 닿았다: 옆 2차맵으로 넘기고 다음 구간을 시작한다 */
  const cross = (
    journey: Journey,
    map: SecondMap,
    info: NonNullable<ReturnType<SecondMap["unitInfo"]>>,
    nextKey: number,
  ): void => {
    const next = maps.get(nextKey);
    const here = anchorAt(lastPoint(info.motion), info.size);
    const side = sideToward(map.mapKey, nextKey);
    const entry = next && side ? entryOf(map.mapKey, nextKey, here, side, info.size) : null;
    if (!next || !entry || !next.isStandable(entry.x, entry.y, info.size)) {
      finish(journey, "stopped", "blocked");
      return;
    }
    // 넘기 직전까지 한 일은 떠나는 2차맵 몫(다음 정산이 직무 배치를 풀고 계약을 끝낸다 — 질문 582)
    try {
      deps.settle?.(journey.ownerId, now());
    } catch (error) {
      log.error({ err: error, ownerId: journey.ownerId }, "travel: settle before crossing failed");
    }
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

  /** 확인 시각: 그 움직임 그대로 끝났으면 넘기거나(중간) 끝낸다(마지막) */
  const check = (journey: Journey): void => {
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
      finish(journey, "arrived", null);
      return;
    }
    cross(journey, map, info, nextKey);
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

  /** 내가 옮길 수 있는 유닛(내 소유, 수호신·봇 아님)과 그 자리 */
  const ownUnit = (userId: string, unitId: number | undefined) => {
    const id = unitId ?? deps.cyborgUnitOf?.(userId) ?? null;
    if (id === null) return { problem: "no_cyborg" as const };
    const where = locate(id);
    if (!where) return { problem: "unknown_unit" as const };
    const ownerId = deps.ownerOf(userId);
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
  ): { route: number[]; distance: number } | { problem: WorldTravelProblem } => {
    if (!maps.has(target.mapKey)) return { problem: "unknown_map" };
    if (unavailable(where.info.condition, now())) return { problem: "unavailable" };
    const route = mapRoute(where.map.mapKey, target.mapKey, loaded);
    if (!route) return { problem: "no_route" };
    const cell = { x: target.x, y: target.y };
    const legs = planLegs(route, positionAt(where.info.motion, now()), cell, where.info.size, standable);
    if (!legs.ok) return { problem: legs.problem };
    return { route, distance: legs.distance };
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
        },
      };
    },

    async start(userId, request) {
      if (stopped || !deps.ready()) return fail("busy");
      const found = ownUnit(userId, request.unitId);
      if ("problem" in found) return fail(found.problem === "no_cyborg" ? "unknown_unit" : found.problem);
      const planned = planFor(found, request);
      if ("problem" in planned)
        return fail(planned.problem === "no_cyborg" ? "unknown_unit" : planned.problem);
      const at = now();
      // 가는 중이면 앞 길을 버린다(줄은 아래에서 덮어쓴다)
      const old = journeys.get(found.id);
      if (old) {
        journeys.delete(found.id);
        old.seq += 1;
        old.checkAtMs = null;
      }
      recent.delete(found.id);
      const journey: Journey = {
        unitId: found.id,
        ownerId: found.ownerId,
        kind: request.kind,
        route: planned.route,
        leg: 0,
        target: { x: request.x, y: request.y },
        startedAtMs: at,
        arriveAtMs: at + travelMs(planned.distance, found.info.speed),
        seq: 0,
        motion: null,
        checkAtMs: null,
      };
      journeys.set(found.id, journey);
      store.save(journey);
      const first = await beginLeg(journey, false);
      return first.ok ? { ok: true, maps: planned.route.length, arriveAt: journey.arriveAtMs } : first;
    },

    cancel(userId, unitId) {
      const journey = journeys.get(unitId);
      const ownerId = deps.ownerOf(userId);
      if (!journey || ownerId === undefined || journey.ownerId !== ownerId) return fail("not_traveling");
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
        const mapKey = journey.route[journey.leg];
        const info = mapKey === undefined ? undefined : maps.get(mapKey)?.unitInfo(journey.unitId);
        // 도착 예상: 지금 자리에서 남은 2차맵 줄의 곧은 거리 ÷ 속도(못 재면 보낼 때 잰 값)
        const rest = info
          ? planLegs(
              journey.route.slice(journey.leg),
              positionAt(info.motion, at),
              journey.target,
              info.size,
              standable,
            )
          : null;
        const arriveAt = info && rest?.ok ? at + travelMs(rest.distance, info.speed) : journey.arriveAtMs;
        out.push(viewOf(journey, "going", null, arriveAt));
      }
      for (const [unitId, finished] of recent)
        if (finished.ownerId === ownerId && !journeys.has(unitId)) out.push(finished.view);
      return out.toSorted((a, b) => a.unitId - b.unitId);
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
        const journey: Journey = { ...row, leg, seq: 0, motion: null, checkAtMs: null };
        journeys.set(row.unitId, journey);
        if (leg !== row.leg) store.save(journey);
        void beginLeg(journey, true);
        resumed += 1;
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
